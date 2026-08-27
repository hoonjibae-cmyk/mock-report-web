import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { getExam, updateExamAnswerKey } from "@/lib/omr-exams";

export const runtime = "nodejs";

/** 정답키 저장: {answerKey: {"1": 3, ...}} — 값은 1~보기수, 빈 값은 키 생략 */
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApi("createReports");
  if (auth.response) return auth.response;
  const { id } = await context.params;

  try {
    const exam = await getExam(id);
    if (!exam) return NextResponse.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const raw = body.answerKey;
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return NextResponse.json({ error: "정답 형식이 올바르지 않습니다." }, { status: 400 });
    }

    const answerKey: Record<string, number> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const q = Number(key);
      if (!Number.isInteger(q) || q < 1 || q > exam.numQuestions) {
        return NextResponse.json(
          { error: `문항 번호 ${key}는 1~${exam.numQuestions} 범위를 벗어납니다.` },
          { status: 400 },
        );
      }
      if (value === null || value === undefined || value === "") continue;
      const choice = Number(value);
      if (!Number.isInteger(choice) || choice < 1 || choice > exam.numChoices) {
        return NextResponse.json(
          { error: `${q}번 정답은 1~${exam.numChoices} 사이여야 합니다.` },
          { status: 400 },
        );
      }
      answerKey[String(q)] = choice;
    }

    const updated = await updateExamAnswerKey(id, answerKey);
    return NextResponse.json({ ok: true, exam: updated });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "정답 저장 오류" },
      { status: 500 },
    );
  }
}
