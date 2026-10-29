import ReviewQueueView from "@/components/ReviewQueueView";
import { canViewExamType, getCurrentUser, hasPermission } from "@/lib/auth";
import { listExamSummaries } from "@/lib/omr-exams";
import { canApproveReview } from "@/lib/review";
import { reviewQueue, type ReviewQueue } from "@/lib/review-queue";

export const dynamic = "force-dynamic";

/**
 * 운영진 검토 — 검토 올라온 월말평가를 프로그램 안에서 찾아 들어가는 곳.
 * 슬랙 알림의 링크는 시험 하나로 가지만, 여기서는 기다리는 건·컨펌된 건을 모두 본다.
 */
export default async function ReviewQueuePage() {
  const user = await getCurrentUser();
  if (!user) return null;

  let queue: ReviewQueue = { requested: [], approved: [], pending: [] };
  let setupError = "";
  if (hasPermission(user, "viewReports")) {
    try {
      const exams = (await listExamSummaries()).filter((exam) => canViewExamType(user, exam.examType));
      queue = reviewQueue(exams);
    } catch (error) {
      setupError = error instanceof Error ? error.message : "Supabase 연결 설정을 확인해 주세요.";
    }
  }

  return (
    <ReviewQueueView
      user={{ username: user.username, displayName: user.displayName, role: user.role }}
      queue={queue}
      canApprove={canApproveReview(user)}
      setupError={setupError}
    />
  );
}
