import { NextResponse } from "next/server";

import { armHrSync, hrSyncArmed } from "@/lib/app-settings";
import { authorizeApi } from "@/lib/api-auth";
import { HrNotConfiguredError, hrConfigured } from "@/lib/hr-directory";
import { previewHrSync, runHrSync } from "@/lib/hr-apply";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * 지금 상태, 또는 무엇이 바뀔지 미리보기(`?preview=1`).
 *
 * 미리보기는 **아무것도 고치지 않고 아무에게도 보내지 않는다.** 첫 실행은
 * 대상 부서 전원에게 DM을 보내므로, 누르기 전에 명단을 눈으로 볼 수 있어야 한다.
 */
export async function GET(request: Request) {
  const auth = await authorizeApi("viewReports");
  if (auth.response) return auth.response;
  if (auth.user?.role !== "admin") {
    return NextResponse.json({ error: "관리자만 볼 수 있습니다." }, { status: 403 });
  }

  const configured = hrConfigured();
  const armed = await hrSyncArmed();
  if (new URL(request.url).searchParams.get("preview") !== "1") {
    return NextResponse.json({ ok: true, hrConfigured: configured, armed });
  }

  if (!configured) {
    return NextResponse.json({ error: new HrNotConfiguredError().message }, { status: 400 });
  }
  try {
    return NextResponse.json({ ok: true, armed, preview: await previewHrSync() });
  } catch (error) {
    console.error("인사 연동 미리보기 실패", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "명부를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}

/**
 * 인사 명부에 계정을 맞춘다.
 *
 * 계정을 만들고 끄는 일이라 **총괄만** 누른다. 이 버튼을 한 번 누르고 나면
 * 자동 실행이 켜진다 — 사람이 결과를 한 번 눈으로 본 뒤에 맡기는 것이다.
 */
export async function POST() {
  const auth = await authorizeApi("createReports");
  if (auth.response) return auth.response;
  if (auth.user?.role !== "admin") {
    return NextResponse.json({ error: "관리자만 인사 연동을 실행할 수 있습니다." }, { status: 403 });
  }

  try {
    const outcome = await runHrSync();
    // 사람이 한 번 돌려 봤으니 이제부터는 저절로 돌아도 된다.
    await armHrSync(auth.user.displayName);
    return NextResponse.json({ ok: true, armed: true, ...outcome });
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
