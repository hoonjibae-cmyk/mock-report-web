import { NextResponse } from "next/server";

import { authorizeApi } from "@/lib/api-auth";
import { HrNotConfiguredError, hrConfigured } from "@/lib/hr-directory";
import { runHrSync } from "@/lib/hr-apply";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** 지금 연동 상태 — 화면이 버튼을 켤지 정할 때 쓴다 */
export async function GET() {
  const auth = await authorizeApi("viewReports");
  if (auth.response) return auth.response;
  if (auth.user?.role !== "admin") {
    return NextResponse.json({ error: "관리자만 볼 수 있습니다." }, { status: 403 });
  }
  return NextResponse.json({ ok: true, hrConfigured: hrConfigured() });
}

/**
 * 인사 명부에 계정을 맞춘다.
 *
 * 계정을 만들고 끄는 일이라 **총괄만** 누른다. 하루 한 번 크론도 같은 일을
 * 하지만, 오늘 입사한 사람을 지금 들여보내야 할 때가 있어 손으로도 돌린다.
 */
export async function POST() {
  const auth = await authorizeApi("createReports");
  if (auth.response) return auth.response;
  if (auth.user?.role !== "admin") {
    return NextResponse.json({ error: "관리자만 인사 연동을 실행할 수 있습니다." }, { status: 403 });
  }

  try {
    const outcome = await runHrSync();
    return NextResponse.json({ ok: true, ...outcome });
  } catch (error) {
    if (error instanceof HrNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("인사 연동 실패", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "인사 연동 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
