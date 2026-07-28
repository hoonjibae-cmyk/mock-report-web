import { NextResponse } from "next/server";
import { authenticateUser, setSessionCookie } from "@/lib/auth";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { username?: string; password?: string } | null;
  if (!body?.username || !body?.password) {
    return NextResponse.json({ error: "아이디와 비밀번호를 입력해 주세요." }, { status: 400 });
  }

  const user = await authenticateUser(body.username, body.password).catch(() => null);
  if (!user) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return NextResponse.json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  await setSessionCookie(user);
  return NextResponse.json({ ok: true, role: user.role, displayName: user.displayName });
}
