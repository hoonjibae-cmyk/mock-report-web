import { NextResponse } from "next/server";
import { authorizeAdminApi } from "@/lib/api-auth";
import { backfillAllReports, examSyncConfigured } from "@/lib/student-card-exams";
import { siteBaseUrl } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * 살아 있는 성적표 전부를 학생 카드(테스트 탭)로 보낸다 — 설정 화면의 [시험 기록 전체 보내기] (v1.58.0).
 * 처음 연동할 때 지난 성적표를 채우는 용도이고, 그 뒤에는 성적표를 만들 때마다 저절로 가며 하루 한 번 cron 이 빠진 것을 메운다.
 * 관리자만. 같은 성적표는 학생 카드가 덮어쓰므로 몇 번 눌러도 늘지 않는다.
 */
export async function POST(request: Request) {
  const auth = await authorizeAdminApi();
  if (auth.response) return auth.response;
  if (!examSyncConfigured()) {
    return NextResponse.json({ error: "학생 관리 프로그램 연동(STUDENT_API_URL · STUDENT_API_KEY)이 설정되어 있지 않습니다." }, { status: 503 });
  }
  try {
    const result = await backfillAllReports(siteBaseUrl(request.url));
    return NextResponse.json({ ok: !result.error, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "시험 기록을 보내지 못했습니다." }, { status: 500 });
  }
}
