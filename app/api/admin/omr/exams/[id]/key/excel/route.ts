import { NextResponse } from "next/server";
import readXlsxFile from "read-excel-file/node";
import { authorizeApi } from "@/lib/api-auth";
import { getExam, updateExamAnswerKey } from "@/lib/omr-exams";
import { essayCountOf, pointFor } from "@/lib/omr-scoring";
import { makeXlsx } from "@/lib/xlsx-lite";

export const runtime = "nodejs";

const CIRCLED = "①②③④⑤⑥⑦⑧⑨";

function parseChoice(value: unknown, numChoices: number): number | null | "invalid" {
  if (value === null || value === undefined || value === "") return null;
  let text = String(value).trim();
  if (!text) return null;
  const circled = CIRCLED.indexOf(text);
  if (circled >= 0) text = String(circled + 1);
  const choice = Number(text);
  if (!Number.isInteger(choice) || choice < 1 || choice > numChoices) return "invalid";
  return choice;
}

/** 정답 입력용 엑셀 양식 다운로드 (기존 입력값이 있으면 채워서 제공) */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApi("viewReports");
  if (auth.response) return auth.response;
  const { id } = await context.params;

  try {
    const exam = await getExam(id);
    if (!exam) return NextResponse.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });

    const essayCount = essayCountOf(exam);
    const hasCustomPoints = Object.keys(exam.points ?? {}).length > 0;
    const rows: Array<Array<string | number | null>> = [["문항", "정답", "배점", "영역"]];

    for (let q = 1; q <= exam.numQuestions; q += 1) {
      const answer = exam.answerKey?.[String(q)];
      const point = exam.points?.[String(q)];
      const area = exam.questionMeta?.[String(q)]?.area;
      rows.push([
        q,
        typeof answer === "number" ? answer : null,
        // 배점을 직접 지정한 적이 없으면 빈칸으로 두어 '자동 배분'임을 드러낸다
        hasCustomPoints && typeof point === "number" ? point : null,
        typeof area === "string" && area ? area : null,
      ]);
    }
    for (let k = 1; k <= essayCount; k += 1) {
      const q = exam.numQuestions + k;
      const point = exam.points?.[String(q)];
      const area = exam.questionMeta?.[String(q)]?.area;
      rows.push([
        q,
        "서술형",
        hasCustomPoints && typeof point === "number" ? point : null,
        typeof area === "string" && area ? area : null,
      ]);
    }

    rows.push([null, null, null, null]);
    rows.push([`※ 정답: 1~${exam.numChoices} 또는 ①~⑤ (서술형 행은 정답을 비워 두세요)`, null, null, null]);
    rows.push(["※ 배점: 비워 두면 전체 문항에 100점을 자동으로 균등 배분합니다.", null, null, null]);
    rows.push(["※ 영역: 듣기 · 어법 · 독해처럼 자유롭게 입력하면 성적표에 영역별 분석이 실립니다.", null, null, null]);

    const buf = makeXlsx("정답", rows);
    const filename = `${exam.title.replace(/[^\w가-힣.-]+/g, "_")}_정답입력.xlsx`;
    const encoded = encodeURIComponent(filename).replace(/'/g, "%27");
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="answer-key.xlsx"; filename*=UTF-8''${encoded}`,
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "양식 생성 오류" },
      { status: 500 },
    );
  }
}

/** 채워 온 엑셀을 업로드하면 정답키로 저장한다. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApi("createReports");
  if (auth.response) return auth.response;
  const { id } = await context.params;

  try {
    const exam = await getExam(id);
    if (!exam) return NextResponse.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "엑셀 파일을 선택해 주세요." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let sheets: Awaited<ReturnType<typeof readXlsxFile>>;
    try {
      sheets = await readXlsxFile(buffer, { trim: false } as never);
    } catch {
      return NextResponse.json(
        { error: "엑셀 파일을 읽지 못했습니다. 내려받은 양식(.xlsx)에 정답을 채워 다시 올려 주세요." },
        { status: 400 },
      );
    }

    const essayCount = essayCountOf(exam);
    const lastQuestion = exam.numQuestions + essayCount;

    const answerKey: Record<string, number> = {};
    const points: Record<string, number> = {};
    const questionMeta: Record<string, { area?: string }> = {};
    const problems: string[] = [];
    const pointProblems: string[] = [];

    for (const sheet of sheets as unknown as Array<{ sheet: string; data: unknown[][] }>) {
      for (const row of sheet.data ?? []) {
        const q = Number(String(row?.[0] ?? "").trim());
        if (!Number.isInteger(q) || q < 1 || q > lastQuestion) continue; // 머리글·안내 행
        const isEssay = q > exam.numQuestions;

        if (!isEssay) {
          const parsed = parseChoice(row?.[1], exam.numChoices);
          if (parsed === "invalid") {
            problems.push(`${q}번: '${row?.[1]}'`);
          } else if (parsed != null) {
            answerKey[String(q)] = parsed;
          }
        }

        const rawPoint = row?.[2];
        if (rawPoint !== null && rawPoint !== undefined && String(rawPoint).trim() !== "") {
          const point = Number(String(rawPoint).trim());
          if (!Number.isFinite(point) || point <= 0 || point > 1000) {
            pointProblems.push(`${q}번: '${rawPoint}'`);
          } else {
            points[String(q)] = point;
          }
        }

        const rawArea = row?.[3];
        const area = rawArea === null || rawArea === undefined ? "" : String(rawArea).trim();
        if (area) questionMeta[String(q)] = { area: area.slice(0, 30) };
      }
    }

    if (pointProblems.length > 0) {
      return NextResponse.json(
        {
          error: `배점은 0보다 큰 숫자여야 합니다 — ${pointProblems.slice(0, 5).join(", ")}${pointProblems.length > 5 ? " 외" : ""}`,
        },
        { status: 400 },
      );
    }

    if (problems.length > 0) {
      return NextResponse.json(
        {
          error: `정답 범위(1~${exam.numChoices})를 벗어난 값이 있습니다 — ${problems.slice(0, 5).join(", ")}${problems.length > 5 ? " 외" : ""}`,
        },
        { status: 400 },
      );
    }
    if (Object.keys(answerKey).length === 0) {
      return NextResponse.json(
        { error: "정답을 찾지 못했습니다. '문항'·'정답' 두 열이 있는 양식인지 확인해 주세요." },
        { status: 400 },
      );
    }

    const updated = await updateExamAnswerKey(id, answerKey, { points, questionMeta });
    return NextResponse.json({
      ok: true,
      exam: updated,
      filled: Object.keys(answerKey).length,
      total: exam.numQuestions,
      pointsFilled: Object.keys(points).length,
      areasFilled: Object.keys(questionMeta).length,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "엑셀 업로드 오류" },
      { status: 500 },
    );
  }
}
