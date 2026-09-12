import { DEFAULT_USER_PERMISSIONS, defaultPermissionsFor, normalizePermissions, type UserPermissions } from "@/lib/access";
import { hashUserPassword } from "@/lib/crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export interface ManagedUser {
  id: string;
  username: string;
  displayName: string;
  active: boolean;
  permissions: UserPermissions;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** 총괄(admin) | 일반(user) — 인사 연동이 부서로 정한다 */
  role: "admin" | "user";
  /** 로그인 신원(슬랙 계정 이메일). 비어 있으면 예전 방식(비밀번호) 계정이다 */
  email: string | null;
  /** 마지막으로 확인한 소속 */
  department: string | null;
  /** 인사 연동이 관리하는 계정인가 */
  managedByHr: boolean;
  /** 슬랙 안내를 보낸 시각. 비어 있으면 아직 못 보낸 것 */
  slackNotifiedAt: string | null;
  /** 왜 껐는가(퇴사·부서 이동) */
  deactivatedReason: string | null;
}

export function normalizeManagedUsername(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function validateManagedUsername(username: string): string | null {
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
    return "아이디는 영문 소문자, 숫자, 점(.), 밑줄(_), 하이픈(-)으로 3~40자 이내여야 합니다.";
  }
  return null;
}

export function validateManagedPassword(password: string): string | null {
  if (password.length < 8) return "비밀번호는 8자 이상으로 설정해 주세요.";
  if (password.length > 100) return "비밀번호는 100자 이내로 설정해 주세요.";
  return null;
}

/**
 * app_users 한 줄 → 화면이 쓰는 모양. 읽는 곳이 여럿이라 한곳에 둔다.
 *
 * 칸 목록을 상수로 빼지 않은 것은 supabase-js 때문이다 — select에 변수를 주면
 * 줄의 생김새를 못 읽어 타입이 통째로 무너진다.
 */
function mapUser(row: Record<string, unknown>): ManagedUser {
  return {
    id: String(row.id),
    username: String(row.username),
    displayName: String(row.display_name),
    active: row.is_active !== false,
    permissions: normalizePermissions(row.permissions, defaultPermissionsFor(row.hr_department)),
    lastLoginAt: (row.last_login_at as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    role: row.role === "admin" ? "admin" : "user",
    email: (row.email as string | null) ?? null,
    department: (row.hr_department as string | null) ?? null,
    managedByHr: row.managed_by_hr === true,
    slackNotifiedAt: (row.slack_notified_at as string | null) ?? null,
    deactivatedReason: (row.deactivated_reason as string | null) ?? null,
  };
}

export async function listManagedUsers(): Promise<ManagedUser[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("app_users")
    .select("id,username,display_name,is_active,permissions,last_login_at,created_at,updated_at,role,email,hr_department,managed_by_hr,slack_notified_at,deactivated_reason")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`일반 사용자 목록 조회 실패: ${error.message}`);
  return (data ?? []).map(mapUser);
}

export async function createManagedUser(input: {
  username: string;
  displayName: string;
  password: string;
  permissions?: UserPermissions;
}): Promise<ManagedUser> {
  const username = normalizeManagedUsername(input.username);
  const usernameError = validateManagedUsername(username);
  if (usernameError) throw new Error(usernameError);
  const passwordError = validateManagedPassword(input.password);
  if (passwordError) throw new Error(passwordError);
  const displayName = String(input.displayName ?? "").trim();
  if (!displayName) throw new Error("사용자 이름을 입력해 주세요.");

  const reserved = normalizeManagedUsername(process.env.ADMIN_USERNAME || "admin") || "admin";
  if (username === reserved) throw new Error("관리자 아이디와 같은 아이디는 사용할 수 없습니다.");

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("app_users")
    .insert({
      username,
      display_name: displayName,
      password_hash: hashUserPassword(input.password),
      permissions: normalizePermissions(input.permissions ?? DEFAULT_USER_PERMISSIONS),
      is_active: true,
    })
    .select("id,username,display_name,is_active,permissions,last_login_at,created_at,updated_at,role,email,hr_department,managed_by_hr,slack_notified_at,deactivated_reason")
    .single();
  if (error || !data) {
    if (error?.code === "23505") throw new Error("이미 사용 중인 아이디입니다.");
    throw new Error(`일반 사용자 생성 실패: ${error?.message ?? "알 수 없는 오류"}`);
  }
  return mapUser(data);
}
