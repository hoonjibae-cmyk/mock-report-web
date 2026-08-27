import { notFound } from "next/navigation";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getExam } from "@/lib/omr-exams";
import OmrAnswerKey from "@/components/OmrAnswerKey";

export const dynamic = "force-dynamic";

export default async function OmrAnswerKeyPage(context: { params: Promise<{ id: string }> }) {
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

  return (
    <OmrAnswerKey exam={exam} setupError={setupError} canEdit={hasPermission(user, "createReports")} />
  );
}
