import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { normalizePermissions } from "@/lib/access";
import { hashUserPassword } from "@/lib/crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateManagedPassword } from "@/lib/users";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { response: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }) };
  if (user.role !== "admin") return { response: NextResponse.json({ error: "관리자만 계정을 관리할 수 있습니다." }, { status: 403 }) };
  return { user };
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    displayName?: string;
    active?: boolean;
    permissions?: unknown;
    password?: string;
  } | null;
  if (!body) return NextResponse.json({ error: "입력값을 확인해 주세요." }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (typeof body.displayName === "string") {
    const displayName = body.displayName.trim();
    if (!displayName) return NextResponse.json({ error: "사용자 이름을 입력해 주세요." }, { status: 400 });
    updates.display_name = displayName;
  }
  if (typeof body.active === "boolean") updates.is_active = body.active;
  if (body.permissions !== undefined) updates.permissions = normalizePermissions(body.permissions);
  if (typeof body.password === "string" && body.password.length) {
    const passwordError = validateManagedPassword(body.password);
    if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });
    updates.password_hash = hashUserPassword(body.password);
    updates.password_changed_at = new Date().toISOString();
  }
  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: "변경할 내용이 없습니다." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("app_users")
    .update(updates)
    .eq("id", id)
    .select("id,username,display_name,is_active,permissions,last_login_at,created_at,updated_at")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "사용자 계정을 찾을 수 없습니다." }, { status: 404 });

  return NextResponse.json({
    ok: true,
    user: {
      id: data.id,
      username: data.username,
      displayName: data.display_name,
      active: data.is_active,
      permissions: normalizePermissions(data.permissions),
      lastLoginAt: data.last_login_at,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const { id } = await context.params;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("app_users")
    .delete()
    .eq("id", id)
    .select("id,username")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "사용자 계정을 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({ ok: true, deletedId: data.id, username: data.username });
}
