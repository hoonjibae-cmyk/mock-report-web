import { NextResponse } from "next/server";

import { authenticateByEmail, setSessionCookie } from "@/lib/auth";
import { SLACK_STATE_COOKIE, exchangeCode, stateMatches } from "@/lib/slack-auth";
import { siteBaseUrl } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function backToLogin(message: string) {
  const base = siteBaseUrl().replace(/\/$/, "");
  const res = NextResponse.redirect(`${base}/login?error=${encodeURIComponent(message)}`);
  res.cookies.set(SLACK_STATE_COOKIE, "", { path: "/api/auth/slack", maxAge: 0 });
  return res;
}

/** 슬랙에서 돌아오는 자리 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  // 사용자가 슬랙 화면에서 취소한 경우 — 오류가 아니라 그만둔 것이다.
  if (params.get("error")) {
    return backToLogin("슬랙 로그인을 취소했습니다.");
  }

  const state = params.get("state");
  const cookieState = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SLACK_STATE_COOKIE}=`))
    ?.slice(SLACK_STATE_COOKIE.length + 1);

  if (!stateMatches(cookieState ? decodeURIComponent(cookieState) : undefined, state)) {
    // 남이 만든 로그인 요청을 우리가 처리하는 것을 막는 자리다.
    return backToLogin("로그인 요청이 확인되지 않았습니다. 다시 시도해 주세요.");
  }

  const code = params.get("code");
  if (!code) return backToLogin("슬랙에서 인증 정보를 받지 못했습니다.");

  let identity: Awaited<ReturnType<typeof exchangeCode>>;
  try {
    identity = await exchangeCode(code, siteBaseUrl());
  } catch (error) {
    console.error("슬랙 로그인 실패", error);
    return backToLogin(error instanceof Error ? error.message : "슬랙 로그인에 실패했습니다.");
  }
  if (!identity) {
    return backToLogin(
      "슬랙 계정을 확인하지 못했습니다. 학원 슬랙 워크스페이스 계정으로 다시 시도해 주세요.",
    );
  }

  const user = await authenticateByEmail(identity.email);
  if (!user) {
    // 슬랙이 넘겨준 이메일을 그대로 보여 준다. 방금 그 슬랙 계정으로 로그인한
    // 본인의 주소라 새로 알려 주는 정보가 없고, 인사 프로그램의 '업무용
    // 구글메일'과 어디가 다른지를 바로 볼 수 있다 — 실제로 슬랙 가입 주소와
    // 인사 기록 주소가 달라 막힌 선생님이 있었고, 이 한 줄이 없어 찾는 데
    // 한참 걸렸다. 등록 여부에 따라 문구가 달라지지 않으므로 명단을 떠보는
    // 데는 쓸 수 없다.
    return backToLogin(
      `슬랙 계정 이메일(${identity.email})로 등록된 성적표 계정이 없습니다. ` +
        "인사 프로그램의 '업무용 구글메일'이 이 주소와 같은지 확인하거나 경영지원에 문의해 주세요.",
    );
  }

  await setSessionCookie(user);
  const res = NextResponse.redirect(`${siteBaseUrl().replace(/\/$/, "")}/admin`);
  res.cookies.set(SLACK_STATE_COOKIE, "", { path: "/api/auth/slack", maxAge: 0 });
  return res;
}
