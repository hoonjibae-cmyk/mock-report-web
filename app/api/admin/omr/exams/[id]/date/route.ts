import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { getVisibleExam } from "@/lib/exam-access";
import { normalizeExamDate } from "@/lib/exam-date";
import { updateExamDate } from "@/lib/omr-exams";

export const runtime = "nodejs";

/**
 * 시험일 고치기 — 만든 뒤에 응시일이 비었거나 틀렸을 때.
 * 알림톡의 '응시일'과 목록·새로 만드는 성적표의 머리글에 바로 쓰인다.
 * 이미 만든 성적표에 찍힌 날짜는 '성적표 갱신'으로 다시 만들어야 바뀐다.
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApi("createReports");
  if (auth.response) return auth.response;
  const { id } = await context.params;
  try {
    const exam = await getVisibleExam(id);
    if (!exam) return NextResponse.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = normalizeExamDate(body.examDate);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const updated = await updateExamDate(id, parsed.value);
    return NextResponse.json({ ok: true, examDate: updated.examDate }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "시험일 저장 오류" },
      { status: 500 },
    );
  }
}
