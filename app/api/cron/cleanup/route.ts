import { NextResponse } from "next/server";

import { hrConfigured } from "@/lib/hr-directory";
import { runHrSync } from "@/lib/hr-apply";
import { purgeExpiredScanOriginals, purgeExpiredSheets } from "@/lib/omr-retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * 하루 한 번 도는 정리 작업(vercel.json 의 crons 가 부른다).
 *
 * 로그인한 사람이 아니라 Vercel이 부르므로 보통의 인증을 쓸 수 없다. 대신
 * Vercel이 붙여 보내는 CRON_SECRET 을 확인한다. 그 값이 설정돼 있지 않으면
 * 아무나 부를 수 있는 주소가 되므로, 없으면 아예 돌지 않는다.
 *
 * 지우는 것은 둘 뿐이다.
 *  - 일주일 지난 스캔 원본(미리보기와 주관식 칸 이미지는 남긴다)
 *  - 세 달 지난 답안지 PDF(다시 뽑으면 새로 만들어진다)
 * 성적표와 판독 결과는 건드리지 않는다.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      {
        error:
          "CRON_SECRET이 설정되어 있지 않습니다. Vercel → Settings → Environment Variables 에 " +
          "긴 임의 문자열로 추가한 뒤 다시 배포해 주세요. 그때까지 정리 작업은 돌지 않습니다.",
      },
      { status: 503 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 401 });
  }

  const now = new Date();
  const report: Record<string, unknown> = { ranAt: now.toISOString() };

  // 한쪽이 실패해도 다른 쪽은 정리되어야 한다. 정리가 며칠 밀리면 그만큼
  // 지워야 할 것이 쌓이므로, 되는 것만이라도 해 두는 편이 낫다.
  try {
    report.scans = await purgeExpiredScanOriginals(now);
  } catch (error) {
    console.error("스캔 원본 정리 실패", error);
    report.scans = { error: error instanceof Error ? error.message : "알 수 없는 오류" };
  }
  try {
    report.sheets = await purgeExpiredSheets(now);
  } catch (error) {
    console.error("답안지 정리 실패", error);
    report.sheets = { error: error instanceof Error ? error.message : "알 수 없는 오류" };
  }

  // 인사 연동 — 계정을 맞추고, 아직 안내를 못 받은 사람에게 슬랙을 보낸다.
  //
  // 이 한 줄이 "신규 입사자가 슬랙에 가입하면 그때 안내가 나간다"를 만든다.
  // 슬랙 가입 사건을 따로 받아 보지 않고, 매일 한 번 '아직 못 보낸 사람'을
  // 다시 훑는다. 가입 당일이 아니라 다음 날 아침에 도착하지만, 받을 사람이
  // 빠지는 일은 없다 — 사건을 놓치면 영영 못 보내는 쪽보다 이편이 튼튼하다.
  if (hrConfigured()) {
    try {
      report.hr = await runHrSync();
    } catch (error) {
      console.error("인사 연동 실패", error);
      report.hr = { error: error instanceof Error ? error.message : "알 수 없는 오류" };
    }
  } else {
    report.hr = { skipped: "HR_API_URL/HR_API_KEY가 설정되지 않아 건너뜁니다." };
  }

  return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
}
