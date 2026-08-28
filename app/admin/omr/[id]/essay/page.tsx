import { notFound } from "next/navigation";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getExam } from "@/lib/omr-exams";
import { essayCountOf } from "@/lib/omr-scoring";
import EssayGrader from "@/components/EssayGrader";

export const dynamic = "force-dynamic";

export default async function OmrEssayPage(context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!hasPermission(user, "viewReports")) return null;

  const { id } = await context.params;

  let setupError = "";
  const exam = await getExam(id).catch((error) => {
    setupError = error instanceof Error ? error.message : "Supabase 연결 설정을 확인해 주세요.";
    return null;
  });
  if (!exam && !setupError) notFound();
  if (exam && essayCountOf(exam) === 0) {
    setupError =
      "이 시험에는 주관식 문항이 없습니다. 시험을 만들 때 ‘서술형 문항 수’를 지정하면 이 화면을 쓸 수 있습니다.";
  }

  return (
    <EssayGrader
      exam={exam}
      setupError={setupError}
      canEdit={hasPermission(user, "createReports")}
    />
  );
}
