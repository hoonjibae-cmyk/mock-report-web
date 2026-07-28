import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { DEFAULT_USER_PERMISSIONS, normalizePermissions } from "@/lib/access";
import { createManagedUser, listManagedUsers } from "@/lib/users";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { response: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }) };
  if (user.role !== "admin") return { response: NextResponse.json({ error: "관리자만 계정을 관리할 수 있습니다." }, { status: 403 }) };
  return { user };
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  try {
    return NextResponse.json({ ok: true, users: await listManagedUsers() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "사용자 목록을 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const body = (await request.json().catch(() => null)) as {
    username?: string;
    displayName?: string;
    password?: string;
    permissions?: unknown;
  } | null;
  if (!body) return NextResponse.json({ error: "입력값을 확인해 주세요." }, { status: 400 });

  try {
    const created = await createManagedUser({
      username: body.username ?? "",
      displayName: body.displayName ?? "",
      password: body.password ?? "",
      permissions: normalizePermissions(body.permissions ?? DEFAULT_USER_PERMISSIONS),
    });
    return NextResponse.json({ ok: true, user: created }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "사용자 계정을 만들지 못했습니다." },
      { status: 400 },
    );
  }
}
