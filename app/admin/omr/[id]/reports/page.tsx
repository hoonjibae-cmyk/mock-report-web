import { notFound } from "next/navigation";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getExam } from "@/lib/omr-exams";
import { listScans, type OmrScan } from "@/lib/omr-scans";
import OmrReportBuilder from "@/components/OmrReportBuilder";

export const dynamic = "force-dynamic";

export default async function OmrReportsPage(context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!hasPermission(user, "viewReports")) return null;

  const { id } = await context.params;

  let scans: OmrScan[] = [];
  let setupError = "";
  const exam = await getExam(id).catch((error) => {
    setupError = error instanceof Error ? error.message : "Supabase 연결 설정을 확인해 주세요.";
    return null;
  });
  if (!exam && !setupError) notFound();

  if (exam) {
    try {
      scans = await listScans(id);
    } catch (error) {
      setupError = error instanceof Error ? error.message : "판독 목록을 불러오지 못했습니다.";
    }
  }

  return (
    <OmrReportBuilder
      exam={exam}
      initialScans={scans}
      setupError={setupError}
      canCreate={hasPermission(user, "createReports")}
    />
  );
}
