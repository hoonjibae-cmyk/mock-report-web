import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { getExam } from "@/lib/omr-exams";
import { deleteScan, getScan, updateScan } from "@/lib/omr-scans";

export const runtime = "nodejs";

/** 검수 저장: 수험번호·답안 수정 및 확인 처리 */
export async function PATCH(request: Request, context: { params: Promise<{ scanId: string }> }) {
  const auth = await authorizeApi("createReports");
  if (auth.response) return auth.response;
  const { scanId } = await context.params;

  try {
    const scan = await getScan(scanId);
    if (!scan) return NextResponse.json({ error: "판독 결과를 찾을 수 없습니다." }, { status: 404 });
    const exam = await getExam(scan.examId);
    if (!exam) return NextResponse.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const patch: Parameters<typeof updateScan>[1] = {};

    if (body.studentId !== undefined) {
      const value = String(body.studentId ?? "").trim();
      if (value && !/^\d{1,9}$/.test(value)) {
        return NextResponse.json({ error: "수험번호는 숫자만 입력해 주세요." }, { status: 400 });
      }
      patch.studentId = value || null;
    }

    if (body.answers !== undefined) {
      if (typeof body.answers !== "object" || body.answers === null) {
        return NextResponse.json({ error: "답안 형식이 올바르지 않습니다." }, { status: 400 });
      }
      const answers: Record<string, number | null> = {};
      for (let q = 1; q <= exam.numQuestions; q += 1) {
        const raw = (body.answers as Record<string, unknown>)[String(q)];
        if (raw === null || raw === undefined || raw === "") {
          answers[String(q)] = null;
          continue;
        }
        const choice = Number(raw);
        if (!Number.isInteger(choice) || choice < 1 || choice > exam.numChoices) {
          return NextResponse.json(
            { error: `${q}번 답안은 1~${exam.numChoices} 사이여야 합니다.` },
            { status: 400 },
          );
        }
        answers[String(q)] = choice;
      }
      patch.answers = answers;
    }

    if (body.status !== undefined) {
      if (body.status !== "pending" && body.status !== "reviewed") {
        return NextResponse.json({ error: "알 수 없는 검수 상태입니다." }, { status: 400 });
      }
      patch.status = body.status;
    }

    return NextResponse.json({ ok: true, scan: await updateScan(scanId, patch) });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "검수 저장 오류" },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ scanId: string }> }) {
  const auth = await authorizeApi("createReports");
  if (auth.response) return auth.response;
  const { scanId } = await context.params;

  try {
    await deleteScan(scanId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "삭제 오류" },
      { status: 500 },
    );
  }
}
