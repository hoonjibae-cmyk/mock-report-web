// 동기화 계획을 실제로 적용하고 슬랙 안내를 보낸다.
//
// 무엇을 할지는 lib/hr-sync.ts 가 정한다. 여기서는 그 결정을 표에 옮기고
// 안내를 보낼 뿐이다. 판단과 적용을 나눠 둔 것은, 판단만 따로 시험하기
// 위해서다(누구를 잠글지가 이 프로그램에서 가장 되돌리기 어렵다).

import { DEFAULT_USER_PERMISSIONS } from "@/lib/access";
import { fetchHrStaff, notifyStaff } from "@/lib/hr-directory";
import { planSync, type ExistingAccount, type HrStaff, type SyncPlan } from "@/lib/hr-sync";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { siteBaseUrl } from "@/lib/utils";

export interface SyncOutcome {
  created: number;
  updated: number;
  deactivated: number;
  /** 이번에 슬랙 안내가 실제로 나간 사람 수 */
  notified: number;
  /** 아직 슬랙에 없어 다음으로 미룬 사람 수 */
  notifyPending: number;
  /** 사람이 손봐야 하는 것들(이메일 없음 등) */
  problems: string[];
  departments: string[];
  ranAt: string;
}

/** 처음 안내에 쓰는 글 — 슬랙 DM으로 그대로 나간다 */
export function welcomeText(staff: HrStaff, siteUrl: string): string {
  const role = staff.role === "admin" ? "총괄" : "일반";
  return [
    `${staff.name} 님, 목동유쌤영어학원 *성적표 프로그램(OMR 리포트)* 계정이 준비되었습니다.`,
    "",
    `• 주소 : ${siteUrl.replace(/\/$/, "")}`,
    "• 로그인 : *슬랙으로 로그인* 을 누르시면 됩니다. 지금 보고 계신 이 슬랙 계정 그대로입니다.",,
    "• 별도 비밀번호는 없습니다.",
    `• 권한 : ${staff.department} · ${role}`,
    "",
    "시험을 만들고 OMR 답안지를 뽑는 것부터 성적표 발송까지 이 주소에서 합니다.",
    "로그인이 안 되거나 권한이 맞지 않으면 경영지원에 알려 주세요.",
  ].join("\n");
}

/** 우리 표에 있는 계정 전부 — 판단에 필요한 칸만 */
async function loadAccounts(): Promise<ExistingAccount[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("app_users")
    .select("id,username,display_name,email,role,is_active,hr_emp_no,hr_department,managed_by_hr,slack_notified_at");
  if (error) throw new Error(`계정 목록을 불러오지 못했습니다: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    username: String(row.username ?? ""),
    displayName: String(row.display_name ?? ""),
    email: (row.email as string | null) ?? null,
    role: row.role === "admin" ? "admin" : "user",
    isActive: row.is_active !== false,
    hrEmpNo: (row.hr_emp_no as string | null) ?? null,
    hrDepartment: (row.hr_department as string | null) ?? null,
    managedByHr: row.managed_by_hr === true,
    slackNotifiedAt: (row.slack_notified_at as string | null) ?? null,
  }));
}

async function applyPlan(plan: SyncPlan): Promise<{ created: number; updated: number; deactivated: number; problems: string[] }> {
  const supabase = getSupabaseAdmin();
  const problems: string[] = [];
  let created = 0;
  let updated = 0;
  let deactivated = 0;

  for (const item of plan.create) {
    const { error } = await supabase.from("app_users").insert({
      username: item.username,
      display_name: item.staff.name,
      // 비밀번호는 두지 않는다 — 슬랙으로만 들어온다.
      password_hash: null,
      email: item.staff.email,
      role: item.staff.role,
      hr_emp_no: item.staff.empNo,
      hr_department: item.staff.department,
      managed_by_hr: true,
      is_active: true,
      permissions: DEFAULT_USER_PERMISSIONS,
    });
    if (error) problems.push(`${item.staff.name} 계정 생성 실패: ${error.message}`);
    else created += 1;
  }

  for (const item of plan.update) {
    const { error } = await supabase
      .from("app_users")
      .update({
        display_name: item.staff.name,
        email: item.staff.email,
        role: item.staff.role,
        hr_emp_no: item.staff.empNo,
        hr_department: item.staff.department,
        managed_by_hr: true,
        is_active: true,
        deactivated_reason: null,
      })
      .eq("id", item.id);
    if (error) problems.push(`${item.staff.name} 계정 수정 실패: ${error.message}`);
    else updated += 1;
  }

  for (const item of plan.deactivate) {
    const { error } = await supabase
      .from("app_users")
      .update({ is_active: false, deactivated_reason: item.reason })
      .eq("id", item.id);
    if (error) problems.push(`${item.displayName} 계정 중지 실패: ${error.message}`);
    else deactivated += 1;
  }

  return { created, updated, deactivated, problems };
}

/**
 * 안내를 보낸다.
 *
 * 보낸 사람만 시각을 남긴다. 못 보낸 사람은 빈 채로 두어 **다음 동기화에서
 * 다시 시도**한다 — 신규 입사자가 슬랙에 가입하는 날 자동으로 나가는 것이
 * 이 구조다.
 */
async function sendNotices(staffList: readonly HrStaff[]): Promise<{ notified: number; problems: string[] }> {
  const supabase = getSupabaseAdmin();
  const siteUrl = siteBaseUrl();
  const problems: string[] = [];
  let notified = 0;

  for (const staff of staffList) {
    const result = await notifyStaff(staff.empNo, welcomeText(staff, siteUrl));
    if (!result.delivered) {
      // 'no-slack' 은 문제로 세지 않는다 — 아직 가입 전일 뿐이고 다음에 간다.
      if (result.reason !== "no-slack") {
        problems.push(`${staff.name} 슬랙 안내 실패: ${result.error ?? result.reason ?? "알 수 없음"}`);
      }
      continue;
    }
    const { error } = await supabase
      .from("app_users")
      .update({ slack_notified_at: new Date().toISOString() })
      .eq("hr_emp_no", staff.empNo);
    if (error) problems.push(`${staff.name} 안내 기록 실패: ${error.message}`);
    notified += 1;
  }

  return { notified, problems };
}

/** 인사 명부를 읽어 계정을 맞추고, 아직 안내 못 받은 사람에게 슬랙을 보낸다 */
export async function runHrSync(): Promise<SyncOutcome> {
  const ranAt = new Date().toISOString();
  const directory = await fetchHrStaff();
  const accounts = await loadAccounts();
  const plan = planSync(directory.items, accounts);

  const applied = await applyPlan(plan);
  // 계정을 만든 직후에 안내를 보내야 하므로 적용이 끝난 뒤에 부른다.
  const sent = await sendNotices(plan.notify);

  const pending = directory.items.filter((staff) => !staff.slackLinked).length;

  return {
    created: applied.created,
    updated: applied.updated,
    deactivated: applied.deactivated,
    notified: sent.notified,
    notifyPending: pending,
    problems: [...applied.problems, ...sent.problems, ...plan.skipped.map((s) => s.reason)],
    departments: directory.departments,
    ranAt,
  };
}
