import Link from "next/link";
import { notFound } from "next/navigation";
import A4GenericReport from "@/components/A4GenericReport";
import A4PrintShell from "@/components/A4PrintShell";
import { planA4Report } from "@/lib/a4-report-plan";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getVisibleExam } from "@/lib/exam-access";
import { getExamOverview } from "@/lib/omr-comments";
import { EXAM_TYPE_LABELS } from "@/lib/omr-types";
import { publishedComments } from "@/lib/report-comments";
import { listExamReportRows } from "@/lib/reports";

export const dynamic = "force-dynamic";

/**
 * 시험 전체 A4 인쇄 — 응시생 전원의 성적표를 한 문서로 이어 붙여 인쇄·PDF 저장한다.
 *
 * 학생마다 새 쪽에서 시작하고 바닥글에 시험명·학생 이름이 찍힌다. `?class=반이름`으로 한 반만,
 * `?students=열쇠,열쇠`로 고른 학생만 뽑을 수 있다. 담임 의견은 공개 성적표와 같은 규칙으로
 * 확정한 글만 싣는다. 반배치고사는 반별 출력 링크(Where’s My Class?)를 쓰므로 여기서 다루지 않는다.
 */
export default async function OmrPrintPage(context: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ class?: string; students?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!hasPermission(user, "viewReports")) return null;

  const { id } = await context.params;
  const query = await context.searchParams;
  const exam = await getVisibleExam(id);
  if (!exam) notFound();
  const base = `/admin/omr/${exam.id}`;

  if (exam.examType === "placement") {
    return (
      <main className="admin-shell">
        <section className="panel">
          <h2>반배치고사는 반별 출력 링크를 씁니다</h2>
          <p className="subtle">
            반배치고사 성적표는 배정된 반의 평균으로 만들어지므로, 성적표 생성 화면의 ‘반배정 요청 · 성적표 출력’에서
            반마다 나오는 출력 링크를 눌러 주세요.
          </p>
          <Link className="button secondary" href={`${base}/reports`}>
            성적표 생성으로 이동
          </Link>
        </section>
      </main>
    );
  }

  const [rows, overview] = await Promise.all([listExamReportRows(id), getExamOverview(id).catch(() => null)]);
  const wantClass = (query.class ?? "").trim();
  const wantStudents = new Set(
    (query.students ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
  const selected = rows.filter(
    (row) =>
      (!wantClass || row.className === wantClass) &&
      (wantStudents.size === 0 || wantStudents.has(row.id) || (row.studentKey !== null && wantStudents.has(row.studentKey))),
  );
  const prepared = selected.map((row) => ({ row, comments: publishedComments(overview, row.teacherComment) }));
  const pageCount = prepared.reduce((sum, entry) => sum + planA4Report(entry.row.report, entry.comments).pages.length, 0);
  const classNames = [...new Set(rows.map((row) => row.className).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));

  return (
    <A4PrintShell
      title={exam.title}
      subtitle={`${EXAM_TYPE_LABELS[exam.examType]}${exam.examDate ? ` · ${exam.examDate}` : ""}`}
      count={prepared.length}
      pageCount={pageCount}
      backHref={`${base}/reports`}
      summaryHref={`${base}/summary`}
      printHref={`${base}/print`}
      classNames={classNames}
      activeClass={wantClass || null}
    >
      {prepared.length === 0 ? (
        <p className="a4-print-empty">
          {rows.length === 0
            ? "아직 이 시험의 성적표가 없습니다. 성적표 생성 화면에서 먼저 만들어 주세요."
            : "고른 조건에 맞는 성적표가 없습니다. 위에서 ‘전체’를 눌러 모두 보세요."}
        </p>
      ) : (
        <div className="a4-report-root a4-batch" aria-label="시험 전체 A4 성적표">
          {prepared.map(({ row, comments }) => (
            <A4GenericReport key={row.id} report={row.report} comments={comments} />
          ))}
        </div>
      )}
    </A4PrintShell>
  );
}
