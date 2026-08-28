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
      // 답안지 생성·스캔 판독은 Render의 OMR 서비스를 호출한다. 주소가 없으면
      // 버튼을 눌러야 알 수 있으므로, 목록 화면에서 미리 알려 준다.
      omrServiceReady={Boolean(process.env.OMR_API_URL)}
      canCreate={hasPermission(user, "createReports")}
      canDelete={hasPermission(user, "deleteReports")}
      currentUser={{
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      }}
    />
  );
}
