import { notFound } from "next/navigation";
import ReviewPanel from "@/components/ReviewPanel";
import { attendanceByClass, classNamesOf } from "@/lib/attendance";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getVisibleExam } from "@/lib/exam-access";
import { getExamOverview } from "@/lib/omr-comments";
import { listReviewStudents } from "@/lib/reports";
import { canApproveReview } from "@/lib/review";
import { fetchClassRosters } from "@/lib/student-directory";

export const dynamic = "force-dynamic";

/** 운영진 검토 — 슬랙 운영진 채널의 링크가 여기로 온다 */
export default async function OmrReviewPage(context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!hasPermission(user, "viewReports")) return null;

  const { id } = await context.params;
  const exam = await getVisibleExam(id);
  if (!exam) notFound();

  const [students, overview] = await Promise.all([
    listReviewStudents(id),
    getExamOverview(id).catch(() => null),
  ]);

  // 반 명단과 맞춰 미응시자를 가려낸다 — 검수하는 지금 시점의 재원생 기준이다.
  // 명단을 못 가져오면 화면에 그 까닭만 보이고 검수는 그대로 진행된다.
  const classNames = classNamesOf(students);
  const roster = classNames.length > 0 ? await fetchClassRosters(classNames) : null;
  const attendance = roster ? attendanceByClass(students, roster.rosters) : [];

  return (
    <ReviewPanel
      exam={exam}
      students={students}
      overview={{ status: overview?.status === "final" ? "final" : "draft", text: overview?.final ?? null }}
      canApprove={canApproveReview(user)}
      attendance={attendance}
      attendanceError={roster?.error ?? (classNames.length === 0 ? "성적표에 반 이름이 없어 반 명단과 맞춰 볼 수 없습니다." : null)}
    />
  );
}
