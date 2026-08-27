import { notFound } from "next/navigation";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getExam } from "@/lib/omr-exams";
import {
  getExamOverview,
  listCommentStudents,
  emptyOverview,
  type CommentStudentRow,
  type OverviewComment,
} from "@/lib/omr-comments";
import OmrCommentsEditor from "@/components/OmrCommentsEditor";

export const dynamic = "force-dynamic";

export default async function OmrCommentsPage(context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!hasPermission(user, "viewReports")) return null;

  const { id } = await context.params;

  let setupError = "";
  let overview: OverviewComment = emptyOverview();
  let students: Array<Omit<CommentStudentRow, "reportData">> = [];

  const exam = await getExam(id).catch((error) => {
    setupError = error instanceof Error ? error.message : "Supabase 연결 설정을 확인해 주세요.";
    return null;
  });
  if (!exam && !setupError) notFound();

  if (exam) {
    try {
      const [ov, rows] = await Promise.all([getExamOverview(id), listCommentStudents(id)]);
      overview = ov;
      students = rows.map(({ reportData: _omit, ...rest }) => rest);
    } catch (error) {
      setupError = error instanceof Error ? error.message : "담임 의견을 불러오지 못했습니다.";
    }
  }

  return (
    <OmrCommentsEditor
      exam={exam}
      initialOverview={overview}
      initialStudents={students}
      setupError={setupError}
      canEdit={hasPermission(user, "createReports")}
      aiEnabled={Boolean(process.env.OPENAI_API_KEY)}
    />
  );
}
