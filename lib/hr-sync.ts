// 인사 명부 ↔ 우리 계정 맞추기.
//
// 이 파일은 **결정만 한다.** 데이터베이스도 슬랙도 건드리지 않는다. 누구를
// 만들고 누구를 끌지가 이 프로그램에서 가장 되돌리기 어려운 판단이라, 화면도
// 네트워크도 없이 그 판단만 따로 두고 시험한다.

/** 인사 프로그램이 주는 한 사람 */
export interface HrStaff {
  empNo: string;
  name: string;
  department: string;
  /**
   * 로그인 신원 — 인사 프로그램의 **업무용 구글메일(workEmail)**.
   *
   * 인사 프로그램에는 이메일이 둘이다. 급여명세서 발송용은 개인 메일인 경우가
   * 많아 슬랙 계정과 대조되지 않는다. 여기 오는 것은 업무용 쪽이어야 한다.
   *
   * 비어 있으면 계정을 만들 수 없다.
   */
  email: string;
  role: "admin" | "user";
  /** 지금 슬랙 안내를 보낼 수 있는가 */
  slackLinked: boolean;
}

/** 우리 쪽에 이미 있는 계정 */
export interface ExistingAccount {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  role: "admin" | "user";
  isActive: boolean;
  hrEmpNo: string | null;
  hrDepartment: string | null;
  managedByHr: boolean;
  slackNotifiedAt: string | null;
}

export interface CreatePlan {
  staff: HrStaff;
  /** 만들 로그인 아이디 — 이메일 앞부분에서 딴다 */
  username: string;
}

export interface UpdatePlan {
  id: string;
  staff: HrStaff;
  /** 무엇이 달라졌는지 — 화면과 기록에 그대로 쓴다 */
  changes: string[];
}

export interface DeactivatePlan {
  id: string;
  username: string;
  displayName: string;
  reason: string;
}

export interface SkipPlan {
  staff: HrStaff;
  reason: string;
}

export interface SyncPlan {
  create: CreatePlan[];
  update: UpdatePlan[];
  deactivate: DeactivatePlan[];
  skipped: SkipPlan[];
  /** 슬랙 안내를 아직 못 보낸 사람(새로 만든 사람 + 지난번에 못 보낸 사람) */
  notify: HrStaff[];
}

const USERNAME_RE = /^[a-z0-9._-]{3,40}$/;

/**
 * 이메일에서 로그인 아이디를 딴다.
 *
 * 아이디는 화면에 이름표로 쓰일 뿐 로그인 열쇠가 아니다(열쇠는 슬랙 계정이다).
 * 그래도 겹치면 안 되므로, 겹칠 때는 뒤에 숫자를 붙인다.
 *
 * 딸 수 없는 이메일이면 사번으로 만든다 — 사람이 읽기는 나빠도, 계정을 아예
 * 못 만드는 것보다는 낫다.
 */
export function usernameFromEmail(email: string, empNo: string, taken: Set<string>): string {
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  let base = local.replace(/[^a-z0-9._-]/g, "");
  if (base.length < 3) base = `hr${empNo.toLowerCase().replace(/[^a-z0-9._-]/g, "")}`;
  if (base.length < 3) base = `hr${base}000`.slice(0, 8);
  base = base.slice(0, 36);
  if (!USERNAME_RE.test(base)) base = `hr${empNo.replace(/[^a-z0-9]/g, "") || "000"}`.slice(0, 36);

  let candidate = base;
  let n = 2;
  while (taken.has(candidate)) {
    candidate = `${base.slice(0, 36)}${n}`;
    n += 1;
  }
  taken.add(candidate);
  return candidate;
}

/** 같은 사람인지 — 사번이 먼저다. 이메일은 바뀔 수 있고 사번은 안 바뀐다. */
function findAccount(
  staff: HrStaff,
  byEmpNo: Map<string, ExistingAccount>,
  byEmail: Map<string, ExistingAccount>,
): ExistingAccount | undefined {
  return byEmpNo.get(staff.empNo) ?? (staff.email ? byEmail.get(staff.email) : undefined);
}

/**
 * 무엇을 할지 정한다.
 *
 * 끄는 것에 대해
 * -------------
 * 명부에서 사라진 사람은 끈다(퇴사·부서 이동). 지우지는 않는다 — 그 사람이 만든
 * 성적표의 '만든 사람' 기록이 끊기기 때문이다.
 *
 * **손으로 만든 계정은 건드리지 않는다.** 인사에 없다고 끄면, 연동을 켠 날
 * 관리자가 자기 손으로 만들어 둔 계정까지 함께 잠긴다.
 *
 * **명부가 비어 있으면 아무도 끄지 않는다.** 인사 프로그램이 잠깐 멈췄거나 키가
 * 틀렸을 때 빈 명단이 오는데, 그걸 '전원 퇴사'로 읽으면 그 순간 모두가 잠긴다.
 */
export function planSync(staffList: readonly HrStaff[], accounts: readonly ExistingAccount[]): SyncPlan {
  const plan: SyncPlan = { create: [], update: [], deactivate: [], skipped: [], notify: [] };

  const byEmpNo = new Map<string, ExistingAccount>();
  const byEmail = new Map<string, ExistingAccount>();
  const taken = new Set<string>();
  for (const account of accounts) {
    taken.add(account.username.toLowerCase());
    if (account.hrEmpNo) byEmpNo.set(account.hrEmpNo, account);
    if (account.email) byEmail.set(account.email.toLowerCase(), account);
  }

  const seen = new Set<string>();

  for (const staff of staffList) {
    if (!staff.email) {
      plan.skipped.push({
        staff,
        reason: `${staff.name} 님은 인사 프로그램에 이메일이 없어 계정을 만들 수 없습니다. 인사 프로그램의 직원 정보에서 '업무용 구글메일'을 채워 주세요(급여명세서용 이메일이 아닙니다).`,
      });
      continue;
    }

    const existing = findAccount(staff, byEmpNo, byEmail);
    if (!existing) {
      plan.create.push({ staff, username: usernameFromEmail(staff.email, staff.empNo, taken) });
      plan.notify.push(staff);
      continue;
    }

    seen.add(existing.id);

    const changes: string[] = [];
    if (existing.email?.toLowerCase() !== staff.email) changes.push("이메일");
    if (existing.role !== staff.role) {
      changes.push(`권한(${existing.role === "admin" ? "총괄" : "일반"} → ${staff.role === "admin" ? "총괄" : "일반"})`);
    }
    if (existing.hrDepartment !== staff.department) changes.push(`부서(${existing.hrDepartment ?? "없음"} → ${staff.department})`);
    if (existing.displayName !== staff.name) changes.push("이름");
    if (existing.hrEmpNo !== staff.empNo) changes.push("사번");
    if (!existing.isActive) changes.push("다시 사용 가능");

    if (changes.length > 0) plan.update.push({ id: existing.id, staff, changes });

    // 아직 안내를 못 보낸 사람은 계속 대상으로 둔다. 신규 입사자가 슬랙에
    // 가입하는 날 자동으로 나가게 하는 것이 이 줄이다.
    if (!existing.slackNotifiedAt) plan.notify.push(staff);
  }

  // 명부가 비어 있으면 끄지 않는다 — 위 설명 참고.
  if (staffList.length > 0) {
    for (const account of accounts) {
      if (!account.managedByHr) continue;
      if (!account.isActive) continue;
      if (seen.has(account.id)) continue;
      plan.deactivate.push({
        id: account.id,
        username: account.username,
        displayName: account.displayName,
        reason: `인사 프로그램의 대상 부서 명단에 없습니다(퇴사 또는 부서 이동). 확인한 시각: ${new Date().toISOString()}`,
      });
    }
  }

  // 슬랙이 연결되지 않은 사람은 지금 보낼 수 없다. 계정은 그대로 만들고,
  // 안내만 다음으로 미룬다.
  plan.notify = plan.notify.filter((staff) => staff.slackLinked);

  return plan;
}
