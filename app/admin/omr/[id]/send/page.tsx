import { notFound } from "next/navigation";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getExam } from "@/lib/omr-exams";
import OmrSendPanel from "@/components/OmrSendPanel";

export const dynamic = "force-dynamic";

export default async function OmrSendPage(context: { params: Promise<{ id: string }> }) {
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
    <OmrSendPanel
      exam={exam}
      // 발송은 되돌릴 수 없으므로 성적표를 만들 수 있는 권한과 같은 선에 둔다.
      canSend={hasPermission(user, "createReports")}
      setupError={setupError}
    />
  );
}
