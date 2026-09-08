import { NextResponse } from "next/server";

import { authenticateGoogle, setSessionCookie } from "@/lib/auth";
import { GOOGLE_STATE_COOKIE, exchangeCode, stateMatches } from "@/lib/google-auth";
import { siteBaseUrl } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function backToLogin(message: string) {
  const base = siteBaseUrl().replace(/\/$/, "");
  const res = NextResponse.redirect(`${base}/login?error=${encodeURIComponent(message)}`);
  res.cookies.set(GOOGLE_STATE_COOKIE, "", { path: "/api/auth/google", maxAge: 0 });
  return res;
}

/** 구글에서 돌아오는 자리 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;

  // 사용자가 구글 화면에서 취소한 경우 — 오류가 아니라 그만둔 것이다.
  if (params.get("error")) {
    return backToLogin("구글 로그인을 취소했습니다.");
  }

  const state = params.get("state");
  const cookieState = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${GOOGLE_STATE_COOKIE}=`))
    ?.slice(GOOGLE_STATE_COOKIE.length + 1);

  if (!stateMatches(cookieState ? decodeURIComponent(cookieState) : undefined, state)) {
    // 남이 만든 로그인 요청을 우리가 처리하는 것을 막는 자리다.
    return backToLogin("로그인 요청이 확인되지 않았습니다. 다시 시도해 주세요.");
  }

  const code = params.get("code");
  if (!code) return backToLogin("구글에서 인증 정보를 받지 못했습니다.");

  let identity: Awaited<ReturnType<typeof exchangeCode>>;
  try {
    identity = await exchangeCode(code, siteBaseUrl());
  } catch (error) {
    console.error("구글 로그인 실패", error);
    return backToLogin(error instanceof Error ? error.message : "구글 로그인에 실패했습니다.");
  }
  if (!identity) return backToLogin("구글 계정을 확인하지 못했습니다. 다시 시도해 주세요.");

  const user = await authenticateGoogle(identity.email);
  if (!user) {
    // 여기서 이메일을 화면에 되비추지 않는다. 누가 등록돼 있고 누가 아닌지를
    // 로그인 화면에서 확인할 수 있게 되면 명단을 떠보는 데 쓸 수 있다.
    return backToLogin(
      "이 구글 계정은 사용 권한이 없습니다. 인사 프로그램에 등록된 회사 계정으로 로그인하거나 관리자에게 문의해 주세요.",
    );
  }

  await setSessionCookie(user);
  const res = NextResponse.redirect(`${siteBaseUrl().replace(/\/$/, "")}/admin`);
  res.cookies.set(GOOGLE_STATE_COOKIE, "", { path: "/api/auth/google", maxAge: 0 });
  return res;
}
