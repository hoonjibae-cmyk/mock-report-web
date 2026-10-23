import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { getVisibleExam } from "@/lib/exam-access";
import { inferLevel, inferPeriodMonth, levelSiblings, teacherOf } from "@/lib/monthly-cohort";
import { listExams, updateExamCohort } from "@/lib/omr-exams";
import { listScans } from "@/lib/omr-scans";
import { COHORT_MODES, type CohortMode } from "@/lib/omr-types";
import { fetchClassTeacherMap } from "@/lib/student-directory";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * 월말평가 성적표의 비교 집단 — 레벨·시행월·'반 평균/레벨 평균'과, 레벨 평균에
 * 합쳐질 다른 반 시험 목록.
 *
 * GET   지금 값(적힌 값과 유추한 값 모두)과 같은 레벨·같은 달의 다른 시험(포함/제외 이유)
 * PATCH 비교 집단·레벨·시행월을 바꾼다 — 성적표를 다시 만들 때 반영된다
 */
async function describe(examId: string) {
  const exam = await getVisibleExam(examId);
  if (!exam) return null;
  const [all, board] = await Promise.all([listExams(), fetchClassTeacherMap()]);
  const siblings = levelSiblings(exam, all, board);
  const reviewedCounts = await Promise.all(
    siblings.map(async (s) =>
      s.included ? (await listScans(s.exam.id)).filter((scan) => scan.status === "reviewed" && scan.studentId).length : 0,
    ),
  );
  return {
    ok: true,
    cohortMode: exam.cohortMode,
    level: inferLevel(exam),
    levelExplicit: exam.level,
    periodMonth: inferPeriodMonth(exam),
    periodMonthExplicit: exam.periodMonth,
    teacher: teacherOf(exam, board),
    siblings: siblings.map((s, i) => ({
      id: s.exam.id,
      title: s.exam.title,
      classNames: s.exam.classNames,
      included: s.included,
      reason: s.reason ?? null,
      reviewedCount: reviewedCounts[i],
    })),
  };
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApi("viewReports");
  if (auth.response) return auth.response;
  const { id } = await context.params;
  try {
    const info = await describe(id);
    if (!info) return NextResponse.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json(info, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "비교 집단 조회 오류" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApi("createReports");
  if (auth.response) return auth.response;
  const { id } = await context.params;
  try {
    const exam = await getVisibleExam(id);
    if (!exam) return NextResponse.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });
    if (exam.examType !== "monthly") {
      return NextResponse.json({ error: "비교 집단은 월말평가에서만 고를 수 있습니다." }, { status: 400 });
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const patch: { cohortMode?: CohortMode; level?: string | null; periodMonth?: string | null } = {};
    if (body.cohortMode !== undefined) {
      if (!COHORT_MODES.includes(body.cohortMode as CohortMode)) {
        return NextResponse.json({ error: "비교 집단 값이 올바르지 않습니다." }, { status: 400 });
      }
      patch.cohortMode = body.cohortMode as CohortMode;
    }
    if (body.level !== undefined) {
      const level = String(body.level ?? "").trim().slice(0, 40);
      patch.level = level || null;
    }
    if (body.periodMonth !== undefined) {
      const month = String(body.periodMonth ?? "").trim();
      if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
        return NextResponse.json({ error: "시행월은 2026-10 처럼 적어 주세요." }, { status: 400 });
      }
      patch.periodMonth = month || null;
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "바꿀 값이 없습니다." }, { status: 400 });
    }
    await updateExamCohort(id, patch);
    const info = await describe(id);
    return NextResponse.json(info, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "비교 집단 저장 오류" },
      { status: 500 },
    );
  }
}
