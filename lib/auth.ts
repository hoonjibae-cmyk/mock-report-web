import { cookies } from "next/headers";
import { ADMIN_PERMISSIONS, normalizePermissions, type UserPermissionKey, type UserPermissions } from "@/lib/access";
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
    .select("id,username,display_name,password_hash,is_active,permissions")
    .eq("username", username)
    .maybeSingle();

  if (error || !data || !data.is_active || !verifyUserPassword(password, data.password_hash)) return null;

  await supabase
    .from("app_users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => undefined);

  return {
    id: data.id,
    username: data.username,
    displayName: data.display_name,
    role: "user",
    permissions: normalizePermissions(data.permissions),
    source: "database",
  };
}

export async function setSessionCookie(user: CurrentUser): Promise<void> {
  const store = await cookies();
  const token = signPayload({
    kind: user.role === "admin" ? "environment-admin" : "database-user",
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
    .select("id,username,display_name,is_active,permissions")
    .eq("id", payload.userId)
    .maybeSingle();
  if (error || !data || !data.is_active) return null;

  return {
    id: data.id,
    username: data.username,
    displayName: data.display_name,
    role: "user",
    permissions: normalizePermissions(data.permissions),
    source: "database",
  };
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
