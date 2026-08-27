import { getCurrentUser, hasPermission } from "@/lib/auth";
import { listExams } from "@/lib/omr-exams";
import OmrDashboard from "@/components/OmrDashboard";
import type { OmrExam } from "@/lib/omr-types";

export const dynamic = "force-dynamic";

export default async function OmrExamsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  let exams: OmrExam[] = [];
  let setupError = "";
  if (hasPermission(user, "viewReports")) {
    try {
      exams = await listExams();
    } catch (error) {
      setupError = error instanceof Error ? error.message : "Supabase 연결 설정을 확인해 주세요.";
    }
  }

  return (
    <OmrDashboard
      initialExams={exams}
      setupError={setupError}
      canCreate={hasPermission(user, "createReports")}
      canDelete={hasPermission(user, "deleteReports")}
    />
  );
}
