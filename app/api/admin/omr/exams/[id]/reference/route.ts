import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import readXlsxFile from "read-excel-file/node";
import { authorizeApi } from "@/lib/api-auth";
import { getExam, updateExamAnswerKey, updateMockReference } from "@/lib/omr-exams";
import { parseMockReference } from "@/lib/mock-reference";
import { mockSubjectOf } from "@/lib/omr-types";
import type { MarkValue } from "@/lib/omr-answers";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;

/** 기준 자료 엑셀 양식(문항분류표·전국비교기준 탭 포함) 내려받기 */
export async function GET() {
  const auth = await authorizeApi("viewReports");
  if (auth.response) return auth.response;

  try {
    const file = await readFile(
      path.join(process.cwd(), "public", "template", "score-input-template-2026.xlsx"),
    );
    const name = "국영수모의고사_시험기반정보_양식.xlsx";
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="mock-reference.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "양식 파일을 불러오지 못했습니다." }, { status: 500 });
  }
}

/** 시험 기반 정보 업로드 — 이 시험의 과목 행만 골라 저장한다 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApi("createReports");
  if (auth.response) return auth.response;
  const { id } = await context.params;

  try {
    const exam = await getExam(id);
    if (!exam) return NextResponse.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });
    if (exam.examType !== "mock") {
      return NextResponse.json(
        { error: "시험 기반 정보는 국영수 모의고사에만 올릴 수 있습니다." },
        { status: 400 },
      );
    }
    const subject = mockSubjectOf(exam.subject);
    if (!subject) {
      return NextResponse.json(
        { error: "이 시험의 과목(국어·영어·수학)이 지정되어 있지 않습니다. 시험 설정을 확인해 주세요." },
        { status: 400 },
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "엑셀 파일을 선택해 주세요." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "파일이 너무 큽니다(8MB 이하)." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    // 옵션 없이 부르면 모든 시트를 [{sheet, data}, ...]로 돌려준다
    let sheets: Array<{ sheet: string; data: unknown[][] }>;
    try {
      sheets = (await readXlsxFile(buffer, { trim: false } as never)) as never;
    } catch {
      return NextResponse.json(
        { error: "엑셀 파일을 읽지 못했습니다. 성적 입력 템플릿(.xlsx)을 그대로 올려 주세요." },
        { status: 400 },
      );
    }

    let reference;
    try {
      reference = parseMockReference(sheets as never, {
        subject: subject.value,
        filename: file.name,
        uploadedBy: auth.user?.displayName ?? auth.user?.username,
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "기준 자료를 읽지 못했습니다." },
        { status: 400 },
      );
    }

    let updated = await updateMockReference(id, reference);

    // 정답을 아직 다 넣지 않았다면 문항분류표의 정답·배점·영역으로 채워 준다.
    // 이미 입력해 둔 정답이 있으면 손대지 않는다(채점을 먼저 끝낸 경우).
    const filled = Object.keys(exam.answerKey ?? {}).length;
    let appliedKey = 0;
    if (filled < exam.numQuestions) {
      const answerKey: Record<string, MarkValue> = { ...exam.answerKey };
      const points: Record<string, number> = { ...exam.points };
      const meta: Record<string, { area?: string }> = { ...exam.questionMeta };
      for (const item of reference.items) {
        if (item.number > exam.numQuestions) continue;
        if (item.answer !== null && item.answer >= 1 && item.answer <= exam.numChoices) {
          answerKey[String(item.number)] = item.answer;
          appliedKey += 1;
        }
        if (item.points !== null && item.points > 0) points[String(item.number)] = item.points;
        if (item.area) meta[String(item.number)] = { area: item.area };
      }
      if (appliedKey > 0) {
        updated = await updateExamAnswerKey(id, answerKey, { points, questionMeta: meta });
      }
    }

    return NextResponse.json({
      ok: true,
      exam: updated,
      reference: {
        subjectLabel: reference.subjectLabel,
        itemCount: reference.items.length,
        gradeCutCount: reference.gradeCuts.length,
        nationalAverage: reference.nationalAverage,
        filename: reference.filename,
        uploadedAt: reference.uploadedAt,
      },
      appliedKey,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "시험 기반 정보 업로드 오류" },
      { status: 500 },
    );
  }
}

/** 올린 기준 자료 삭제 */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApi("createReports");
  if (auth.response) return auth.response;
  const { id } = await context.params;
  try {
    const exam = await updateMockReference(id, null);
    return NextResponse.json({ ok: true, exam });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "삭제 오류" },
      { status: 500 },
    );
  }
}
