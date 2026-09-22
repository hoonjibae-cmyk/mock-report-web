import { notFound } from "next/navigation";
import ReviewPanel from "@/components/ReviewPanel";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getVisibleExam } from "@/lib/exam-access";
import { getExamOverview } from "@/lib/omr-comments";
import { listReviewStudents } from "@/lib/reports";

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

  return (
    <ReviewPanel
      exam={exam}
      students={students}
      overview={{ status: overview?.status === "final" ? "final" : "draft", text: overview?.final ?? null }}
      canApprove={user.role === "admin"}
    />
  );
}
