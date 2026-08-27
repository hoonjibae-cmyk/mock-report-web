import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { deleteExam, getExam } from "@/lib/omr-exams";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApi("viewReports");
  if (auth.response) return auth.response;
  const { id } = await context.params;
  try {
    const exam = await getExam(id);
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
    await deleteExam(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "시험 삭제 오류" },
      { status: 500 },
    );
  }
}
