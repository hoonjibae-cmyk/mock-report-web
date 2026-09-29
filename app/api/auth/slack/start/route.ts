import { NextResponse } from "next/server";

import {
  SLACK_NEXT_COOKIE,
  SLACK_STATE_COOKIE,
  SlackLoginNotConfiguredError,
  authorizeUrl,
  createState,
} from "@/lib/slack-auth";
import { DEFAULT_AFTER_LOGIN, safeNextPath } from "@/lib/login-next";
import { siteBaseUrl } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 슬랙 로그인 시작 — 로그인 화면의 '슬랙으로 로그인' 이 여기로 온다 */
export async function GET(request: Request) {
  try {
    const state = createState();
    // 슬랙에 갔다 오는 동안 가려던 곳을 잊지 않게 쿠키에 적어 둔다
    const next = safeNextPath(new URL(request.url).searchParams.get("next"));
    const url = authorizeUrl(siteBaseUrl(), state);
    const res = NextResponse.redirect(url);
    // 돌아왔을 때 우리가 보낸 요청이 맞는지 확인할 표식
    res.cookies.set(SLACK_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/auth/slack",
      maxAge: 10 * 60,
    });
    if (next !== DEFAULT_AFTER_LOGIN) {
      res.cookies.set(SLACK_NEXT_COOKIE, next, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/api/auth/slack",
        maxAge: 10 * 60,
      });
    }
    return res;
  } catch (error) {
    const message =
      error instanceof SlackLoginNotConfiguredError
        ? error.message
        : "슬랙 로그인을 시작하지 못했습니다.";
    return NextResponse.redirect(
      `${siteBaseUrl().replace(/\/$/, "")}/login?error=${encodeURIComponent(message)}`,
    );
  }
}
