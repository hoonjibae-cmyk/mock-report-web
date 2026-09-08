import { NextResponse } from "next/server";

import {
  SLACK_STATE_COOKIE,
  SlackLoginNotConfiguredError,
  authorizeUrl,
  createState,
} from "@/lib/slack-auth";
import { siteBaseUrl } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 슬랙 로그인 시작 — 로그인 화면의 '슬랙으로 로그인' 이 여기로 온다 */
export async function GET() {
  try {
    const state = createState();
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
