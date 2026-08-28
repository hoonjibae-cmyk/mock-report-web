import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { getExam } from "@/lib/omr-exams";
import { listScans, updateScan } from "@/lib/omr-scans";
import { summarizeReview } from "@/lib/omr-review";
import { lookupStudents } from "@/lib/student-directory";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * 자동 검수 통과 — 판독기가 확신한 답안지를 한 번에 확인 처리한다.
 *
 * 60~100명 시험에서 한 장씩 누르는 건 현실적이지 않지만, 그렇다고 전부 그냥
 * 넘기면 잘못 읽힌 답안지가 조용히 성적표가 된다. 그래서 판정은 서버가 다시
 * 하고(화면이 보낸 목록을 그대로 믿지 않는다), 확신한 것만 통과시킨다.
 *
 * GET  — 지금 몇 장이 자동 통과 대상이고 몇 장이 사람 확인 대상인지
 * POST — 자동 통과 대상을 실제로 확인 처리
 */

async function buildSummary(examId: string) {
  const exam = await getExam(examId);
  if (!exam) return null;

  const scans = await listScans(examId);

  // 학생 명부에 없는 수험번호도 걸러낸다. 연동이 꺼져 있으면 이 검사만 건너뛴다
  // (연동을 안 썼다고 전부 검수 대상으로 만들면 기능이 무용지물이 된다).
  const ids = scans.map((scan) => scan.studentId).filter((v): v is string => Boolean(v));
  let knownIds: Set<string> | null = null;
  if (ids.length > 0) {
    const directory = await lookupStudents(ids);
    if (directory.configured && directory.students.size > 0) {
      knownIds = new Set(
        [...directory.students.keys()].map((key) => key.replace(/^0+/, "") || "0"),
      );
    }
  }

  const summary = summarizeReview(scans, {
    numQuestions: exam.numQuestions,
    idDigits: exam.idDigits,
    answerKey: exam.answerKey,
    knownIds,
  });
  return { exam, scans, summary, directoryUsed: knownIds !== null };
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApi("viewReports");
  if (auth.response) return auth.response;
  const { id } = await context.params;

  try {
    const built = await buildSummary(id);
    if (!built) return NextResponse.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });
    const { summary, directoryUsed } = built;
    return NextResponse.json({
      ok: true,
      directoryUsed,
      total: summary.total,
      reviewed: summary.reviewed,
      autoReady: summary.autoReady.length,
      needsPerson: summary.needsPerson.map(({ scan, reasons }) => ({
        id: scan.id,
        filename: scan.filename,
        reasons,
      })),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "검수 요약 오류" },
      { status: 500 },
    );
  }
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApi("createReports");
  if (auth.response) return auth.response;
  const { id } = await context.params;

  try {
    const built = await buildSummary(id);
    if (!built) return NextResponse.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });
    const { summary } = built;

    if (summary.autoReady.length === 0) {
      return NextResponse.json({
        ok: true,
        approved: 0,
        remaining: summary.needsPerson.length,
        message: "자동으로 확인할 수 있는 답안지가 없습니다.",
      });
    }

    // 자동 통과도 누가 언제 넘겼는지 남긴다 — 나중에 성적표를 되짚을 수 있어야 한다.
    let approved = 0;
    for (const scan of summary.autoReady) {
      await updateScan(scan.id, { status: "reviewed", reviewedBy: "auto" });
      approved += 1;
    }

    const scans = await listScans(id);
    return NextResponse.json({
      ok: true,
      approved,
      remaining: summary.needsPerson.length,
      scans,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "자동 검수 오류" },
      { status: 500 },
    );
  }
}
