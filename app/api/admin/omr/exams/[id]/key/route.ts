import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { compactMark, toChoices, type AnswerKeyValue } from "@/lib/omr-answers";
import { getExam, updateExamAnswerKey } from "@/lib/omr-exams";
import { essayCountOf } from "@/lib/omr-scoring";

export const runtime = "nodejs";

/**
 * 정답키 저장: {answerKey: {"1": 3, "2": [2, 4], ...}}
 * 값은 보기번호(1~보기수) 하나 또는 배열('모두 고르기' 문항). 빈 값은 키 생략.
 */
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

    const lastQuestion = exam.numQuestions + essayCountOf(exam);

    const answerKey: Record<string, AnswerKeyValue> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const q = Number(key);
      if (!Number.isInteger(q) || q < 1 || q > lastQuestion) {
        return NextResponse.json(
          { error: `문항 번호 ${key}는 1~${lastQuestion} 범위를 벗어납니다.` },
          { status: 400 },
        );
      }
      if (value === null || value === undefined || value === "") continue;

      // 주관식 정답은 문장이다. 보기번호로 검사하면 안 되고, 그대로 담는다.
      // (똑같이 맞다고 볼 답이 여럿이면 | 로 나눠 한 문자열에 적는다)
      if (q > exam.numQuestions) {
        const text = String(value).trim();
        if (text) answerKey[String(q)] = text.slice(0, 2000);
        continue;
      }

      const raws = Array.isArray(value) ? value : [value];
      for (const entry of raws) {
        const choice = Number(entry);
        if (!Number.isInteger(choice) || choice < 1 || choice > exam.numChoices) {
          return NextResponse.json(
            { error: `${q}번 정답은 1~${exam.numChoices} 사이여야 합니다.` },
            { status: 400 },
          );
        }
      }
      const packed = compactMark(toChoices(raws.map(Number)));
      if (packed != null) answerKey[String(q)] = packed;
    }

    // 배점(선택) — 0보다 큰 숫자만, 비우면 자동 균등 배분
    let points: Record<string, number> | undefined;
    if (body.points !== undefined) {
      if (typeof body.points !== "object" || body.points === null) {
        return NextResponse.json({ error: "배점 형식이 올바르지 않습니다." }, { status: 400 });
      }
      points = {};
      for (const [key, value] of Object.entries(body.points as Record<string, unknown>)) {
        const q = Number(key);
        if (!Number.isInteger(q) || q < 1 || q > lastQuestion) continue;
        if (value === null || value === undefined || value === "") continue;
        const point = Number(value);
        if (!Number.isFinite(point) || point <= 0 || point > 1000) {
          return NextResponse.json(
            { error: `${q}번 배점은 0보다 큰 숫자여야 합니다.` },
            { status: 400 },
          );
        }
        points[String(q)] = point;
      }
    }

    // 영역(선택)
    let questionMeta: Record<string, { area?: string }> | undefined;
    if (body.questionMeta !== undefined) {
      if (typeof body.questionMeta !== "object" || body.questionMeta === null) {
        return NextResponse.json({ error: "영역 형식이 올바르지 않습니다." }, { status: 400 });
      }
      questionMeta = {};
      for (const [key, value] of Object.entries(body.questionMeta as Record<string, unknown>)) {
        const q = Number(key);
        if (!Number.isInteger(q) || q < 1 || q > lastQuestion) continue;
        const area =
          typeof value === "object" && value !== null
            ? String((value as { area?: unknown }).area ?? "").trim()
            : String(value ?? "").trim();
        if (area) questionMeta[String(q)] = { area: area.slice(0, 30) };
      }
    }

    const updated = await updateExamAnswerKey(id, answerKey, { points, questionMeta });
    return NextResponse.json({ ok: true, exam: updated });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "정답 저장 오류" },
      { status: 500 },
    );
  }
}
