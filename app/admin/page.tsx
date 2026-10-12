import AdminHome from "@/components/AdminHome";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { listExams } from "@/lib/omr-exams";
import { listAdminReports } from "@/lib/reports";
import type { OmrExam } from "@/lib/omr-types";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return null;

  let exams: OmrExam[] = [];
  let reports: Awaited<ReturnType<typeof listAdminReports>>["items"] = [];
  let setupError = "";
  if (hasPermission(currentUser, "viewReports")) {
    try {
      // 홈은 최근 성적표 몇 건만 보여 준다 — 전체를 끌어올 이유가 없다
      const [examList, recent] = await Promise.all([listExams(), listAdminReports({ cap: 50 })]);
      exams = examList;
      reports = recent.items;
    } catch (error) {
      setupError = error instanceof Error ? error.message : "Supabase 연결 설정을 확인해 주세요.";
    }
  }

  return (
    <AdminHome
      currentUser={{
        username: currentUser.username,
        displayName: currentUser.displayName,
        role: currentUser.role,
      }}
      exams={exams}
      reports={reports}
      setupError={setupError}
      canCreate={hasPermission(currentUser, "createReports")}
    />
  );
}
