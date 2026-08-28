import { NextResponse } from "next/server";
import readXlsxFile from "read-excel-file/node";
import { authorizeApi } from "@/lib/api-auth";
import {
  compactMark,
  parseChoices,
  serializeChoices,
  type AnswerKeyValue,
} from "@/lib/omr-answers";
import { getExam, updateExamAnswerKey } from "@/lib/omr-exams";
import { essayCountOf, normalizeDifficulty, pointFor } from "@/lib/omr-scoring";
import { makeXlsx } from "@/lib/xlsx-lite";

export const runtime = "nodejs";

/**
 * 엑셀의 '정답' 칸 한 개를 읽는다.
 * "3" / "③" 은 물론 "2,4" · "2 4" · "②④" 처럼 여러 개도 받는다('모두 고르기' 문항).
 * 비었으면 null, 보기 범위를 벗어난 값이 섞였으면 "invalid".
 */
function parseAnswerCell(value: unknown, numChoices: number): number[] | null | "invalid" {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).trim();
  if (!text) return null;
  const picked = parseChoices(text, numChoices);
  if (picked.length === 0) return "invalid";
  return picked;
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
    // 분석영역과 내용을 나눈 것은 성적표에서 서로 다른 질문에 답하기 때문이다.
    // 분석영역 = 어느 갈래가 약한가 / 내용 = 어떤 유형에서 막히는가
    const rows: Array<Array<string | number | null>> = [
      ["문항", "정답", "배점", "분석영역", "내용", "난이도"],
    ];

    const metaRow = (q: number, answer: string | null): Array<string | number | null> => {
      const point = exam.points?.[String(q)];
      const meta = exam.questionMeta?.[String(q)] ?? {};
      const text = (value: unknown) => (typeof value === "string" && value ? value : null);
      return [
        q,
        answer,
        // 배점을 직접 지정한 적이 없으면 빈칸으로 두어 '자동 배분'임을 드러낸다
        hasCustomPoints && typeof point === "number" ? point : null,
        text(meta.area),
        text(meta.content),
        text(meta.difficulty),
      ];
    };

    for (let q = 1; q <= exam.numQuestions; q += 1) {
      rows.push(metaRow(q, serializeChoices(exam.answerKey?.[String(q)]) || null));
    }
    for (let k = 1; k <= essayCount; k += 1) {
      const q = exam.numQuestions + k;
      // 주관식 정답은 문자열이라 객관식 answerKey와 자료형이 다르다.
      // 같은 '정답' 칸을 쓰되, 저장된 문자열을 그대로 돌려준다.
      const saved = exam.answerKey?.[String(q)];
      rows.push(metaRow(q, typeof saved === "string" && saved ? saved : null));
    }

    const note = (text: string) => rows.push([text, null, null, null, null, null]);
    rows.push([null, null, null, null, null, null]);
    note(`※ 정답: 1~${exam.numChoices} 또는 ①~⑤ (서술형 행은 정답을 비워 두세요)`);
    note("※ ‘모두 고르기’ 문항은 정답을 쉼표로 나열하세요 — 예: 2,4 (학생이 둘 다 표기해야 정답)");
    note("※ 배점: 비워 두면 전체 문항에 100점을 자동으로 균등 배분합니다.");
    note("※ 분석영역: 큰 갈래입니다 — 듣기 · 문법 · 독해 · 어휘 · 서술형처럼 적습니다.");
    note("※ 내용: 세부 유형입니다 — 빈칸추론 · 어법성 판단 · 주제파악 · 글의 순서처럼 적습니다.");
    note("※ 난이도: 상 · 중 · 하 (A · B · C 도 됩니다). 비워 두면 실제 정답률에서 자동으로 매깁니다.");
    if (essayCount > 0) {
      note("※ 주관식 정답: 문장을 그대로 적습니다. 똑같이 맞다고 볼 답이 여럿이면 | 로 나눠 적으세요.");
      note("     예: He is looking forward to seeing you. | He's looking forward to seeing you.");
      note("     적어 두면 전사 결과가 이와 정확히 일치하는 답안만 자동으로 만점 처리됩니다.");
    }
    note("※ 분석영역과 내용은 각각 성적표의 <영역별 분석>과 <내용별 분석>에 실립니다. 비워 두면 그 분석만 빠집니다.");

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

    const answerKey: Record<string, AnswerKeyValue> = {};
    const points: Record<string, number> = {};
    const questionMeta: Record<string, { area?: string; content?: string; difficulty?: string }> = {};
    const problems: string[] = [];
    const pointProblems: string[] = [];
    const difficultyProblems: string[] = [];

    for (const sheet of sheets as unknown as Array<{ sheet: string; data: unknown[][] }>) {
      for (const row of sheet.data ?? []) {
        const q = Number(String(row?.[0] ?? "").trim());
        if (!Number.isInteger(q) || q < 1 || q > lastQuestion) continue; // 머리글·안내 행
        const isEssay = q > exam.numQuestions;

        if (!isEssay) {
          const parsed = parseAnswerCell(row?.[1], exam.numChoices);
          if (parsed === "invalid") {
            problems.push(`${q}번: '${row?.[1]}'`);
          } else if (parsed != null) {
            const packed = compactMark(parsed);
            if (packed != null) answerKey[String(q)] = packed;
          }
        } else {
          // 주관식 정답은 문장이므로 문자열 그대로 담는다. 여러 개면 | 로 나눠 적는다.
          // 양식이 기본으로 넣던 '서술형' 자리표시자는 정답이 아니므로 버린다.
          const raw = String(row?.[1] ?? "").trim();
          if (raw && raw !== "서술형") answerKey[String(q)] = raw.slice(0, 2000);
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

        // 분석영역 · 내용 · 난이도 — 셋 다 선택이고, 적힌 것만 반영한다
        const cell = (index: number) => {
          const raw = row?.[index];
          return raw === null || raw === undefined ? "" : String(raw).trim();
        };
        const meta: { area?: string; content?: string; difficulty?: string } = {};
        const area = cell(3);
        const content = cell(4);
        const difficulty = cell(5);
        if (area) meta.area = area.slice(0, 30);
        if (content) meta.content = content.slice(0, 40);
        if (difficulty) {
          if (normalizeDifficulty(difficulty) === null) {
            difficultyProblems.push(`${q}번: '${difficulty}'`);
          } else {
            meta.difficulty = difficulty.slice(0, 10);
          }
        }
        if (Object.keys(meta).length > 0) questionMeta[String(q)] = meta;
      }
    }

    if (difficultyProblems.length > 0) {
      return NextResponse.json(
        {
          error: `난이도는 상·중·하(또는 A·B·C)로 적어 주세요 — ${difficultyProblems.slice(0, 5).join(", ")}${difficultyProblems.length > 5 ? " 외" : ""}. 비워 두면 실제 정답률에서 자동으로 매깁니다.`,
        },
        { status: 400 },
      );
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
          error: `정답 범위(1~${exam.numChoices})를 벗어난 값이 있습니다 — ${problems.slice(0, 5).join(", ")}${problems.length > 5 ? " 외" : ""}. 복수 정답은 쉼표로 구분해 주세요(예: 2,4).`,
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
