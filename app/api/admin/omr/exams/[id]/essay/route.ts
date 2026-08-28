import { NextResponse } from "next/server";
import readXlsxFile from "read-excel-file/node";
import { authorizeApi } from "@/lib/api-auth";
import { getExam } from "@/lib/omr-exams";
import { listScans, updateScan } from "@/lib/omr-scans";
import { essayCountOf, pointFor } from "@/lib/omr-scoring";
import { makeXlsx } from "@/lib/xlsx-lite";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * 서술형 채점표 엑셀 다운로드.
 * 행 = 학생(검수 완료 답안), 열 = 서술형 문항. 채점자가 화면을 보며 점수만 채우면 된다.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApi("viewReports");
  if (auth.response) return auth.response;
  const { id } = await context.params;

  try {
    const exam = await getExam(id);
    if (!exam) return NextResponse.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });

    const essayCount = essayCountOf(exam);
    if (essayCount === 0) {
      return NextResponse.json(
        { error: "이 시험에는 서술형 문항이 없습니다. 시험을 만들 때 서술형 문항 수를 지정하세요." },
        { status: 400 },
      );
    }

    const scans = (await listScans(id)).filter((scan) => scan.status === "reviewed" && scan.studentId);
    const essayNumbers = Array.from({ length: essayCount }, (_, k) => exam.numQuestions + k + 1);

    // 머리글: 수험번호 · 파일 · 문항별 "N번(배점)" · 합계
    const header: Array<string | number | null> = ["수험번호", "스캔 파일"];
    for (const q of essayNumbers) header.push(`${q}번 (${Math.round(pointFor(exam, q) * 10) / 10}점)`);
    header.push("합계");

    const rows: Array<Array<string | number | null>> = [header];
    for (const scan of scans) {
      const row: Array<string | number | null> = [scan.studentId, scan.filename];
      let sum = 0;
      for (const q of essayNumbers) {
        const value = scan.essayScores?.[String(q)];
        if (typeof value === "number") sum += value;
        row.push(typeof value === "number" ? value : null);
      }
      row.push(sum > 0 ? Math.round(sum * 10) / 10 : null);
      rows.push(row);
    }

    rows.push([null, null]);
    rows.push(["※ 각 문항 칸에 점수(숫자)만 입력한 뒤 이 파일을 그대로 업로드하세요.", null]);
    rows.push(["※ 배점을 넘는 점수는 배점으로 자동 조정됩니다. 빈칸은 0점으로 처리합니다.", null]);
    rows.push(["※ 수험번호 열은 수정하지 마세요. 학생을 찾는 기준입니다.", null]);
    if (scans.length === 0) {
      rows.push(["※ 검수 완료된 답안이 아직 없습니다. 스캔·검수를 먼저 진행하세요.", null]);
    }

    const buf = makeXlsx("서술형채점", rows);
    const filename = `${exam.title.replace(/[^\w가-힣.-]+/g, "_")}_서술형채점.xlsx`;
    const encoded = encodeURIComponent(filename).replace(/'/g, "%27");
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="essay-scores.xlsx"; filename*=UTF-8''${encoded}`,
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "채점표 생성 오류" },
      { status: 500 },
    );
  }
}

/** 채워 온 서술형 채점표를 업로드해 점수를 저장한다. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApi("createReports");
  if (auth.response) return auth.response;
  const { id } = await context.params;

  try {
    const exam = await getExam(id);
    if (!exam) return NextResponse.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });

    const essayCount = essayCountOf(exam);
    if (essayCount === 0) {
      return NextResponse.json({ error: "이 시험에는 서술형 문항이 없습니다." }, { status: 400 });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "엑셀 파일을 선택해 주세요." }, { status: 400 });
    }

    let sheets: Awaited<ReturnType<typeof readXlsxFile>>;
    try {
      sheets = await readXlsxFile(Buffer.from(await file.arrayBuffer()), { trim: false } as never);
    } catch {
      return NextResponse.json(
        { error: "엑셀 파일을 읽지 못했습니다. 내려받은 채점표(.xlsx)에 점수를 채워 올려 주세요." },
        { status: 400 },
      );
    }

    const scans = (await listScans(id)).filter((scan) => scan.status === "reviewed" && scan.studentId);
    const byStudent = new Map(scans.map((scan) => [String(scan.studentId), scan]));
    const essayNumbers = Array.from({ length: essayCount }, (_, k) => exam.numQuestions + k + 1);

    let updated = 0;
    const unknown: string[] = [];
    const invalid: string[] = [];

    for (const sheet of sheets as unknown as Array<{ sheet: string; data: unknown[][] }>) {
      for (const row of sheet.data ?? []) {
        const rawKey = String(row?.[0] ?? "").trim();
        if (!rawKey || !/^\d+$/.test(rawKey)) continue; // 머리글·안내 행
        const scan = byStudent.get(rawKey);
        if (!scan) {
          unknown.push(rawKey);
          continue;
        }

        const scores: Record<string, number> = {};
        essayNumbers.forEach((q, index) => {
          const cell = row?.[2 + index]; // 0:수험번호 1:파일 2~:문항
          if (cell === null || cell === undefined || String(cell).trim() === "") return;
          const value = Number(String(cell).trim());
          if (!Number.isFinite(value) || value < 0) {
            invalid.push(`${rawKey} ${q}번`);
            return;
          }
          const max = pointFor(exam, q);
          scores[String(q)] = Math.min(value, max); // 배점 초과는 배점으로 조정
        });

        await updateScan(scan.id, { essayScores: scores });
        updated += 1;
      }
    }

    if (invalid.length > 0) {
      return NextResponse.json(
        {
          error: `점수는 0 이상의 숫자여야 합니다 — ${invalid.slice(0, 5).join(", ")}${invalid.length > 5 ? " 외" : ""}`,
        },
        { status: 400 },
      );
    }
    if (updated === 0) {
      return NextResponse.json(
        { error: "반영할 학생을 찾지 못했습니다. 수험번호 열이 그대로인지 확인해 주세요." },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      updated,
      unknownKeys: [...new Set(unknown)].slice(0, 10),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "서술형 점수 업로드 오류" },
      { status: 500 },
    );
  }
}
