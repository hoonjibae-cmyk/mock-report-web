import { cookies } from "next/headers";
import {
  ADMIN_PERMISSIONS,
  defaultPermissionsFor,
  normalizePermissions,
  type UserPermissionKey,
  type UserPermissions,
} from "@/lib/access";
import type { ExamType } from "@/lib/omr-types";
import { signPayload, verifyPayload, verifyUserPassword } from "@/lib/crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const SESSION_COOKIE = "ys_mock_session";
export const REPORT_ACCESS_COOKIE = "ys_mock_report_access";

export type AppRole = "admin" | "user";

export interface CurrentUser {
  id: string | null;
  username: string;
  displayName: string;
  role: AppRole;
  permissions: UserPermissions;
  source: "environment" | "database";
}

interface SessionPayload {
  [key: string]: unknown;
  kind?: "environment-admin" | "database-user";
  userId?: string;
  username?: string;
  exp?: number;
}

function normalizeUsername(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function environmentAdminUsername(): string {
  return normalizeUsername(process.env.ADMIN_USERNAME || "admin") || "admin";
}

export async function authenticateUser(usernameInput: string, password: string): Promise<CurrentUser | null> {
  const username = normalizeUsername(usernameInput);
  if (!username || !password) return null;

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (username === environmentAdminUsername() && adminPassword && password === adminPassword) {
    return {
      id: null,
      username,
      displayName: "시스템 관리자",
      role: "admin",
      permissions: ADMIN_PERMISSIONS,
      source: "environment",
    };
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("app_users")
    .select("id,username,display_name,password_hash,is_active,permissions,role,hr_department")
    .eq("username", username)
    .maybeSingle();

  if (error || !data || !data.is_active) return null;
  // 비밀번호가 없는 계정은 슬랙으로만 들어온다. 빈 값으로 통과하는 일이 없도록
  // 대조 전에 막는다.
  if (!data.password_hash || !verifyUserPassword(password, data.password_hash)) return null;

  await touchLastLogin(data.id as string);
  return fromRow(data);
}

/** app_users 한 줄을 로그인한 사람으로 옮긴다 */
function fromRow(row: {
  id: string;
  username: string;
  display_name: string;
  permissions?: unknown;
  role?: unknown;
  hr_department?: unknown;
}): CurrentUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role === "admin" ? "admin" : "user",
    // 반배치고사 열람처럼 부서에 따라 기본값이 다른 권한이 있어 부서를 함께 넘긴다
    permissions: normalizePermissions(row.permissions, defaultPermissionsFor(row.hr_department)),
    source: "database",
  };
}

/**
 * 이 사람이 이 유형의 시험(과 그 성적표)을 볼 수 있는가.
 *
 * 반배치고사만 따로 잠근다 — 반을 새로 짜는 자료라 편성 전에 새면 안 된다.
 * 총괄(경영지원)은 언제나 보고, 나머지는 계정의 '반배치고사 열람'을 따른다.
 * 다른 유형은 성적표를 볼 수 있는 사람이면 누구나 본다.
 */
export function canViewExamType(user: CurrentUser, type: ExamType): boolean {
  if (type !== "placement") return true;
  return user.role === "admin" || user.permissions.viewPlacement;
}

async function touchLastLogin(id: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase
    .from("app_users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", id)
    .then(() => undefined);
}

/**
 * 확인된 이메일로 로그인한다(슬랙 로그인이 부른다).
 *
 * **명부에 없으면 들어올 수 없다.** 학원 슬랙에 있다는 것과 성적표 프로그램을
 * 쓸 사람이라는 것은 다른 이야기다 — 조교팀도 슬랙에는 있다. 인사 프로그램에서
 * 대상 부서에 속한 재직자만 이 표에 들어온다.
 */
export async function authenticateByEmail(email: string): Promise<CurrentUser | null> {
  const address = String(email ?? "").trim().toLowerCase();
  if (!address) return null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("app_users")
    .select("id,username,display_name,is_active,permissions,role,hr_department")
    .ilike("email", address)
    .maybeSingle();

  if (error || !data || !data.is_active) return null;

  await touchLastLogin(data.id as string);
  return fromRow(data);
}

export async function setSessionCookie(user: CurrentUser): Promise<void> {
  const store = await cookies();
  const token = signPayload({
    // 자리(admin/user)가 아니라 **어디서 온 계정인지** 를 담는다. 예전에는 자리로
    // 적었는데, DB 계정에도 총괄이 생기면서 그 계정이 환경변수 관리자 행세를
    // 하게 되어 로그인이 통째로 막힌다.
    kind: user.source === "environment" ? "environment-admin" : "database-user",
    userId: user.id ?? undefined,
    username: user.username,
    exp: Date.now() + 12 * 60 * 60 * 1000,
  });
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 12 * 60 * 60,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  store.set("ys_mock_admin", "", { path: "/", maxAge: 0 });
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = verifyPayload<SessionPayload>(token);
  if (!payload) return null;

  if (payload.kind === "environment-admin") {
    if (payload.username !== environmentAdminUsername()) return null;
    return {
      id: null,
      username: payload.username,
      displayName: "시스템 관리자",
      role: "admin",
      permissions: ADMIN_PERMISSIONS,
      source: "environment",
    };
  }

  if (payload.kind !== "database-user" || !payload.userId) return null;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("app_users")
    .select("id,username,display_name,is_active,permissions,role,hr_department")
    .eq("id", payload.userId)
    .maybeSingle();
  if (error || !data || !data.is_active) return null;

  // 자리를 쿠키가 아니라 매번 표에서 읽는다. 부서가 바뀌어 총괄이 풀린 사람이
  // 쿠키가 살아 있는 동안 총괄로 남으면 안 된다.
  return fromRow(data);
}

export function hasPermission(user: CurrentUser, permission: UserPermissionKey): boolean {
  return user.role === "admin" || user.permissions[permission];
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const user = await getCurrentUser();
  return user?.role === "admin";
}

export async function setReportAccessCookie(publicToken: string): Promise<void> {
  const store = await cookies();
  const signed = signPayload({
    reportToken: publicToken,
    exp: Date.now() + 12 * 60 * 60 * 1000,
  });
  store.set(REPORT_ACCESS_COOKIE, signed, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: `/r/${publicToken}`,
    maxAge: 12 * 60 * 60,
  });
}

export async function hasReportAccess(publicToken: string): Promise<boolean> {
  const store = await cookies();
  const signed = store.get(REPORT_ACCESS_COOKIE)?.value;
  if (!signed) return false;
  const payload = verifyPayload<{ reportToken?: string; exp?: number }>(signed);
  return payload?.reportToken === publicToken;
}
