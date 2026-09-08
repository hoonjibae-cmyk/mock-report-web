import { NextResponse } from "next/server";

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
 * 직원의 구글 계정은 본인이 만든 것이라 **회사가 정지시킬 수 없다.** 퇴사한
 * 사람의 계정은 대개 그대로 살아 있고, 구글은 계속 "이 사람 맞다"고 답한다.
 * 그러니 들어오지 못하게 막는 것은 오직 이 명부뿐이고, 이것이 늦게 돌수록
 * 퇴사자가 열어 볼 수 있는 시간이 길어진다.
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
