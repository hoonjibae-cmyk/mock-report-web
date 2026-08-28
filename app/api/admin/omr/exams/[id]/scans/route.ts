import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { readScans } from "@/lib/omr-api";
import { getExam, sheetSpecFor } from "@/lib/omr-exams";
import {
  downloadScanFile,
  listScans,
  upsertScans,
  uploadScanFile,
  type UpsertScanInput,
} from "@/lib/omr-scans";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_FILES = 60;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 이미지 장당 15MB
const MAX_PDF_BYTES = 60 * 1024 * 1024; // PDF는 여러 장이 들어가므로 60MB

function isPdf(file: { name: string; type?: string }): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function contentTypeFor(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  return "image/jpeg";
}

/** PDF 페이지 결과("스캔.pdf#p3")를 업로드 원본 파일명("스캔.pdf")으로 되돌린다 */
function baseFilename(name: string): string {
  return name.replace(/#p\d+$/, "");
}

/** 표기된 문항 수 */
function markedCount(answers: Record<string, number | null> | undefined): number {
  if (!answers) return 0;
  return Object.values(answers).filter((v) => typeof v === "number").length;
}

/**
 * 답안지와 시험 설정이 어긋나면 판독 좌표가 통째로 밀린다.
 * QR에 새겨진 시험 ID로 먼저 잡고, ID가 없으면 표기율로 의심 신호를 준다.
 */
function mismatchReason(
  result: { exam_id: string | null; answers: Record<string, number | null> },
  examId: string,
  numQuestions: number,
): string | null {
  const qrExam = (result.exam_id ?? "").trim();
  if (qrExam && qrExam !== examId) {
    return `다른 시험의 답안지입니다(답안지에 새겨진 시험 ID: ${qrExam}). 이 답안지를 만든 시험에서 업로드하거나, 이 시험의 답안지를 새로 출력해 사용해 주세요.`;
  }
  const marked = markedCount(result.answers);
  if (numQuestions >= 10 && marked > 0 && marked < numQuestions * 0.5) {
    return `표기가 ${marked}/${numQuestions}문항만 인식되었습니다. 답안지를 출력한 뒤 시험 설정(문항 수·보기 수·서술형 문항 수)을 바꾸면 판독 위치가 어긋납니다. 설정을 확인하고 답안지를 새로 출력해 주세요.`;
  }
  return null;
}

// 판독된 답안: {"1": 3, ...} 형태로 정규화(값은 1-base 보기번호 또는 null)
function normalizeAnswers(raw: Record<string, number | null> | undefined, total: number) {
  const out: Record<string, number | null> = {};
  for (let q = 1; q <= total; q += 1) {
    const value = raw?.[String(q)];
    out[String(q)] = typeof value === "number" ? value : null;
  }
  return out;
}

/** 시험의 판독 결과 목록 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApi("viewReports");
  if (auth.response) return auth.response;
  const { id } = await context.params;

  try {
    const exam = await getExam(id);
    if (!exam) return NextResponse.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json({ ok: true, scans: await listScans(id) });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "판독 목록 오류" },
      { status: 500 },
    );
  }
}

/** 스캔 이미지 업로드 → 원본 보관 → OMR API 판독 → 결과 저장 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApi("createReports");
  if (auth.response) return auth.response;
  const { id } = await context.params;

  try {
    const exam = await getExam(id);
    if (!exam) return NextResponse.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });

    const form = await request.formData();
    const direct = form.getAll("files").filter((entry): entry is File => entry instanceof File);

    // 큰 파일은 브라우저가 Storage에 직접 올리고 경로만 전달한다(Vercel 4.5MB 우회).
    let storagePaths: Array<{ path: string; filename: string }> = [];
    const rawPaths = form.get("storagePaths");
    if (typeof rawPaths === "string" && rawPaths.trim()) {
      try {
        const parsed = JSON.parse(rawPaths);
        if (Array.isArray(parsed)) {
          storagePaths = parsed
            .filter((entry) => entry && typeof entry.path === "string" && typeof entry.filename === "string")
            .slice(0, MAX_FILES);
        }
      } catch {
        return NextResponse.json({ error: "업로드 정보를 읽지 못했습니다." }, { status: 400 });
      }
    }

    const files: File[] = [...direct];
    // 이미 Storage에 있는 파일은 서버가 내려받아 판독에 함께 넘긴다.
    const preUploaded = new Map<string, string>();
    for (const entry of storagePaths) {
      const buffer = await downloadScanFile(entry.path);
      if (!buffer) {
        return NextResponse.json(
          { error: `'${entry.filename}' 파일을 보관함에서 읽지 못했습니다. 다시 업로드해 주세요.` },
          { status: 400 },
        );
      }
      files.push(
        new File([new Uint8Array(buffer)], entry.filename, { type: contentTypeFor(entry.filename) }),
      );
      preUploaded.set(entry.filename, entry.path);
    }

    if (files.length === 0) {
      return NextResponse.json({ error: "업로드할 스캔 이미지를 선택해 주세요." }, { status: 400 });
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { error: `한 번에 최대 ${MAX_FILES}장까지 올릴 수 있습니다.` },
        { status: 400 },
      );
    }
    const tooBig = direct.find(
      (file) => file.size > (isPdf(file) ? MAX_PDF_BYTES : MAX_IMAGE_BYTES),
    );
    if (tooBig) {
      return NextResponse.json(
        {
          error: `'${tooBig.name}' 파일이 너무 큽니다(이미지 15MB · PDF 60MB 이하).`,
        },
        { status: 400 },
      );
    }

    // 원본 보관 — 버킷이 없으면 경로 없이 진행(판독은 계속)
    const paths = new Map<string, string | null>(preUploaded);
    for (const file of direct) {
      const path = await uploadScanFile(
        id,
        file.name,
        await file.arrayBuffer(),
        file.type || contentTypeFor(file.name),
      );
      paths.set(file.name, path);
    }

    const read = await readScans(sheetSpecFor(exam), files);

    let mismatchCount = 0;
    const rows: UpsertScanInput[] = read.results.map((result) => {
      const answers = normalizeAnswers(result.answers, exam.numQuestions);
      const reason = mismatchReason(
        { exam_id: result.exam_id ?? null, answers },
        id,
        exam.numQuestions,
      );
      if (reason) mismatchCount += 1;
      return {
        examId: id,
        filename: result.filename,
        // PDF 페이지 결과는 원본 PDF의 저장 경로를 공유한다
        scanPath: paths.get(result.filename) ?? paths.get(baseFilename(result.filename)) ?? null,
        studentId: result.student_id ?? result.student_id_qr ?? result.student_id_bubbles ?? null,
        studentIdQr: result.student_id_qr ?? null,
        studentIdBubbles: result.student_id_bubbles ?? null,
        answers,
        reviewFlags: result.review_flags ?? [],
        status: "pending",
        readError: reason,
      };
    });

    // 판독 자체가 실패한 파일도 검수 화면에 남겨 다시 올릴 수 있게 한다.
    for (const problem of read.problems ?? []) {
      rows.push({
        examId: id,
        filename: problem.filename,
        scanPath: paths.get(problem.filename) ?? paths.get(baseFilename(problem.filename)) ?? null,
        answers: normalizeAnswers(undefined, exam.numQuestions),
        reviewFlags: [],
        status: "pending",
        readError: problem.error,
      });
    }

    await upsertScans(rows);
    const scans = await listScans(id);
    const storageSkipped = [...paths.values()].every((path) => path === null);

    return NextResponse.json({
      ok: true,
      scans,
      read: read.results.length,
      failed: read.problems?.length ?? 0,
      mismatched: mismatchCount,
      storageSkipped,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "스캔 판독 오류" },
      { status: 500 },
    );
  }
}
