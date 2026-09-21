import { NextResponse } from "next/server";
import { canDeleteOwned, NOT_OWNER_MESSAGE } from "@/lib/ownership";
import { authorizeApi } from "@/lib/api-auth";
import { deleteExam } from "@/lib/omr-exams";
import { getVisibleExam } from "@/lib/exam-access";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApi("viewReports");
  if (auth.response) return auth.response;
  const { id } = await context.params;
  try {
    const exam = await getVisibleExam(id);
    if (!exam) return NextResponse.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json({ exam });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "시험 조회 오류" },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApi("deleteReports");
  if (auth.response) return auth.response;
  const { id } = await context.params;
  try {
    const exam = await getVisibleExam(id);
    if (!exam) return NextResponse.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });
    // 지우는 것은 되돌릴 수 없다 — 만든 사람과 총괄만
    if (!canDeleteOwned(auth.user, exam.createdByUsername)) {
      return NextResponse.json({ error: NOT_OWNER_MESSAGE }, { status: 403 });
    }
    await deleteExam(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "시험 삭제 오류" },
      { status: 500 },
    );
  }
}
