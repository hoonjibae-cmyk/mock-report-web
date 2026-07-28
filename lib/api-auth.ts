import { NextResponse } from "next/server";
import { getCurrentUser, hasPermission, type CurrentUser } from "@/lib/auth";
import type { UserPermissionKey } from "@/lib/access";

export type ApiAuthorization =
  | { user: CurrentUser; response?: never }
  | { user?: never; response: NextResponse };

export async function authorizeApi(permission?: UserPermissionKey): Promise<ApiAuthorization> {
  const user = await getCurrentUser();
  if (!user) return { response: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }) };
  if (permission && !hasPermission(user, permission)) {
    return { response: NextResponse.json({ error: "이 작업을 수행할 권한이 없습니다." }, { status: 403 }) };
  }
  return { user };
}

export async function authorizeAdminApi(): Promise<ApiAuthorization> {
  const auth = await authorizeApi();
  if (auth.response) return auth;
  if (auth.user.role !== "admin") {
    return { response: NextResponse.json({ error: "관리자만 사용할 수 있는 기능입니다." }, { status: 403 }) };
  }
  return auth;
}
