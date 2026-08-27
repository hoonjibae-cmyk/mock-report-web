import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { getExam } from "@/lib/omr-exams";
import {
  getExamOverview,
  listCommentStudents,
  saveExamOverview,
  parseOverview,
} from "@/lib/omr-comments";

export const runtime = "nodejs";

/** 총평 + 학생별 코멘트 현황 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApi("viewReports");
  if (auth.response) return auth.response;
  const { id } = await context.params;

  try {
    const exam = await getExam(id);
    if (!exam) return NextResponse.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });
    const [overview, students] = await Promise.all([getExamOverview(id), listCommentStudents(id)]);
    // reportData는 응답 크기가 크므로 목록에서는 제외
    return NextResponse.json({
      ok: true,
      overview,
      students: students.map(({ reportData: _omit, ...rest }) => rest),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "담임 의견 조회 오류" },
      { status: 500 },
    );
  }
}

/** 총평 저장 — {overview: {aiDraft?, final, status}} */
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApi("createReports");
  if (auth.response) return auth.response;
  const { id } = await context.params;

  try {
    const exam = await getExam(id);
    if (!exam) return NextResponse.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const incoming = parseOverview(body.overview);
    if (incoming.final && incoming.final.length > 4000) {
      return NextResponse.json({ error: "총평은 4000자 이하로 작성해 주세요." }, { status: 400 });
    }
    const saved = await saveExamOverview(id, incoming);
    return NextResponse.json({ ok: true, overview: saved });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "총평 저장 오류" },
      { status: 500 },
    );
  }
}
