import { notFound } from "next/navigation";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getVisibleExam } from "@/lib/exam-access";
import { listScans, type OmrScan } from "@/lib/omr-scans";
import { fetchClassRosters } from "@/lib/student-directory";
import OmrReportBuilder from "@/components/OmrReportBuilder";

export const dynamic = "force-dynamic";

export default async function OmrReportsPage(context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!hasPermission(user, "viewReports")) return null;

  const { id } = await context.params;

  let scans: OmrScan[] = [];
  let setupError = "";
  // 반 인원 대비 응시 현황 — 담임이 시험을 만들 때 고른 반의 지금 재원생 명단
  let rosters: Array<{ className: string; students: Array<{ examNumber: string; name: string }> }> = [];
  let rosterError: string | null = null;
  const exam = await getVisibleExam(id).catch((error) => {
    setupError = error instanceof Error ? error.message : "Supabase 연결 설정을 확인해 주세요.";
    return null;
  });
  if (!exam && !setupError) notFound();

  if (exam) {
    try {
      scans = await listScans(id);
      if (exam.classNames.length > 0) {
        const roster = await fetchClassRosters(exam.classNames);
        rosterError = roster.error ?? null;
        rosters = [...roster.rosters.entries()].map(([className, students]) => ({ className, students }));
      }
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
      canExport={hasPermission(user, "exportReports")}
      rosters={rosters}
      rosterError={rosterError}
    />
  );
}
