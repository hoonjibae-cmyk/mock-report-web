import { NextResponse } from "next/server";

import { hrSyncArmed } from "@/lib/app-settings";
import { hrConfigured } from "@/lib/hr-directory";
import { runHrSync } from "@/lib/hr-apply";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * 인사 명부에 계정을 맞춘다(vercel.json 의 crons 가 부른다).
 *
 * 왜 파일 정리와 따로 두고, 왜 자주 도는가
 * --------------------------------------
 * 퇴사자를 막는 길은 둘이다. 슬랙에서 내보내는 것과 이 명부에서 지우는 것.
 * 앞의 것은 사람이 잊을 수 있고, 뒤의 것은 이 작업이 돌아야 반영된다. 늦게
 * 돌수록 퇴사자가 열어 볼 수 있는 시간이 길어진다.
 *
 * 그래서 하루 한 번인 파일 정리와 떼어 몇 시간마다 돌린다. 명부를 읽고 달라진
 * 것만 고치는 가벼운 일이라 자주 돌려도 부담이 없다.
 *
 * 더 급하면 기다릴 필요 없다 — 설정 → 계정 관리에서 '지금 맞추기'를 누르거나,
 * 그 사람의 '사용 가능'을 꺼면 그 자리에서 막힌다(로그인한 세션도 요청마다
 * 이 표를 다시 보므로 즉시 끊긴다).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      {
        error:
          "CRON_SECRET이 설정되어 있지 않습니다. Vercel → Settings → Environment Variables 에 " +
          "추가한 뒤 다시 배포해 주세요. 그때까지 인사 연동은 저절로 돌지 않습니다.",
      },
      { status: 503 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 401 });
  }

  if (!hrConfigured()) {
    return NextResponse.json({
      skipped: "HR_API_URL/HR_API_KEY가 설정되지 않아 건너뜁니다.",
    });
  }

  // 관리자가 화면에서 한 번 직접 돌리기 전까지는 저절로 돌지 않는다.
  // 첫 실행은 대상 부서 전원에게 슬랙 DM을 보내므로, 설정을 막 마친 배포에서
  // 그것이 예고 없이 나가면 되돌릴 수 없다.
  if (!(await hrSyncArmed())) {
    return NextResponse.json({
      skipped:
        "관리자가 '설정 → 계정 관리 → 지금 맞추기'를 한 번 실행하기 전까지는 자동 실행하지 않습니다.",
    });
  }

  try {
    const outcome = await runHrSync();
    return NextResponse.json(outcome, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("인사 연동 실패", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "알 수 없는 오류" },
      { status: 500 },
    );
  }
}
