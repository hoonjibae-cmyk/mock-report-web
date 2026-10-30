import { NextResponse } from "next/server";
import { backfillAllReports, examSyncConfigured } from "@/lib/student-card-exams";
import { siteBaseUrl } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * 하루 한 번 — 살아 있는 성적표 전부를 학생 카드(테스트 탭)로 다시 보낸다 (vercel.json 의 crons, v1.58.0).
 * 성적표를 만들 때 보낸 것이 그 순간 실패했어도 여기서 메워진다. 같은 성적표는 학생 카드가 덮어쓴다.
 * 정리 작업(cleanup)과 같이 Vercel 이 붙여 보내는 CRON_SECRET 으로 확인한다.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET이 설정되어 있지 않습니다." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 401 });
  }
  if (!examSyncConfigured()) return NextResponse.json({ ok: true, skipped: "학생 관리 프로그램 연동이 설정되어 있지 않습니다." });
  const result = await backfillAllReports(siteBaseUrl(request.url));
  if (result.error) console.warn("Student-Card exam backfill failed", result.error);
  return NextResponse.json({ ok: !result.error, ranAt: new Date().toISOString(), ...result });
}
