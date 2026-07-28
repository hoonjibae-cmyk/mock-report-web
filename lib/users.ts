import { DEFAULT_USER_PERMISSIONS, normalizePermissions, type UserPermissions } from "@/lib/access";
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

export async function listManagedUsers(): Promise<ManagedUser[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("app_users")
    .select("id,username,display_name,is_active,permissions,last_login_at,created_at,updated_at")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`일반 사용자 목록 조회 실패: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    active: row.is_active,
    permissions: normalizePermissions(row.permissions),
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
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
    .select("id,username,display_name,is_active,permissions,last_login_at,created_at,updated_at")
    .single();
  if (error || !data) {
    if (error?.code === "23505") throw new Error("이미 사용 중인 아이디입니다.");
    throw new Error(`일반 사용자 생성 실패: ${error?.message ?? "알 수 없는 오류"}`);
  }
  return {
    id: data.id,
    username: data.username,
    displayName: data.display_name,
    active: data.is_active,
    permissions: normalizePermissions(data.permissions),
    lastLoginAt: data.last_login_at,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}
