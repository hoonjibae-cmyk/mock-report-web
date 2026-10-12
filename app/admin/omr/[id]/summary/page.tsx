import { notFound } from "next/navigation";
import ExamSummary from "@/components/ExamSummary";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getVisibleExam } from "@/lib/exam-access";
import { buildSummaryRows, summaryQuestions, type ExamSummaryData, type SummaryStudent } from "@/lib/exam-summary";
import { listScans } from "@/lib/omr-scans";
import { essayCountOf, maxScore, scoreExam, type ScoreExamResult } from "@/lib/omr-scoring";
import { EXAM_TYPE_LABELS } from "@/lib/omr-types";
import { listReviewStudents } from "@/lib/reports";
import { directoryConfigured, lookupStudents } from "@/lib/student-directory";

export const dynamic = "force-dynamic";

const EMPTY_RESULT: ScoreExamResult = {
  cohort: { count: 0, mean: 0, stdev: 0, max: 0, min: 0 },
  itemRates: {},
  scored: [],
  listening: null,
};

/**
 * 시험 결과 요약 — 응시생 전원을 한 페이지에.
 *
 * 저장해 두는 보고서가 아니다. 열 때마다 지금 검수 완료된 답안지를 그 자리에서
 * 채점한다. 그래서 답안지를 더 판독하면 다음에 열 때 저절로 들어 있고, 성적표를
 * 아직 안 만들었어도 점수는 보인다. 이름은 성적표가 있으면 거기서, 없으면 학생
 * 관리 프로그램에서 가져온다.
 */
export default async function ExamSummaryPage(context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!hasPermission(user, "viewReports")) return null;

  const { id } = await context.params;
  const exam = await getVisibleExam(id);
  if (!exam) notFound();

  const [scans, reports] = await Promise.all([listScans(id), listReviewStudents(id)]);
  const reviewed = scans.filter((scan) => scan.status === "reviewed" && scan.studentId);

  // 이름·반 — 성적표가 있는 학생은 거기 적힌 대로(학부모에게 나간 그 이름)
  const students = new Map<string, SummaryStudent>();
  for (const r of reports) {
    if (!r.studentKey) continue;
    students.set(r.studentKey, {
      name: r.studentName,
      school: r.school,
      className: r.className,
      reportToken: r.token,
    });
  }
  // 성적표가 아직 없는 학생은 학생 관리 프로그램에서 이름만 — 연락처는 쓰지 않는다
  const missing = [...new Set(reviewed.map((scan) => scan.studentId as string).filter((key) => !students.has(key)))];
  let directoryError: string | null = null;
  if (missing.length > 0 && directoryConfigured()) {
    const looked = await lookupStudents(missing);
    directoryError = looked.error ?? null;
    for (const [key, info] of looked.students) {
      students.set(key, {
        name: info.name,
        school: [info.school, info.grade].filter(Boolean).join(" "),
        className: info.className,
        reportToken: null,
      });
    }
  }

  const result = reviewed.length > 0 ? scoreExam(exam, reviewed) : EMPTY_RESULT;
  const max = maxScore(exam);
  const data: ExamSummaryData = {
    examId: exam.id,
    title: exam.title,
    typeLabel: EXAM_TYPE_LABELS[exam.examType],
    examDate: exam.examDate,
    numQuestions: exam.numQuestions,
    essayCount: essayCountOf(exam),
    max,
    classNames: exam.classNames,
    cohort: result.cohort,
    questions: summaryQuestions(exam, result.itemRates),
    rows: buildSummaryRows(result.scored, students, max),
    pendingScans: scans.length - reviewed.length,
    reportCount: reports.length,
    listening: result.listening,
    answerKeyComplete: Object.keys(exam.answerKey ?? {}).length >= exam.numQuestions,
    directoryError,
    generatedAt: new Date().toISOString(),
  };

  return <ExamSummary data={data} canExport={hasPermission(user, "exportReports")} />;
}
