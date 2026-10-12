import { headers } from "next/headers";
import ReportsManager from "@/components/ReportsManager";
import { canViewExamType, getCurrentUser, hasPermission } from "@/lib/auth";
import { EMPTY_RANGE, parseDateRange, type DateRange } from "@/lib/date-range";
import { listAdminReports, REPORT_LIST_CAP, type AdminReportListItem } from "@/lib/reports";
import { EXAM_TYPE_LABELS, type ExamType } from "@/lib/omr-types";

export const dynamic = "force-dynamic";

/** ?type=monthly 같은 하위 메뉴 선택을 읽는다(모르는 값이면 전체) */
function parseType(value: string | string[] | undefined): ExamType | null {
  const key = Array.isArray(value) ? value[0] : value;
  return key && key in EXAM_TYPE_LABELS ? (key as ExamType) : null;
}

/**
 * 웹 리포트 목록.
 *
 * 기본은 최근 것부터 상한(REPORT_LIST_CAP)까지. ?from=&to= 로 생성일 기간을 주면
 * 그 기간만 서버에서 잘라 가져온다 — 상한 너머의 오래된 성적표는 이 길로 본다.
 * 화면의 생성일 칸이 이 주소를 바꾼다.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return null;
  const params = await searchParams;
  const activeType = parseType(params.type);
  const range: DateRange = parseDateRange(params.from, params.to) ?? EMPTY_RANGE;

  let reports: AdminReportListItem[] = [];
  let truncated = false;
  let setupError = "";
  if (hasPermission(currentUser, "viewReports")) {
    try {
      const result = await listAdminReports({ range });
      // 반배치고사 성적표는 볼 수 있는 사람에게만 — 하위 메뉴의 '반배치고사'는 남지만 비어 보인다
      reports = result.items.filter((report) => canViewExamType(currentUser, report.examType));
      truncated = result.truncated;
    } catch (error) {
      setupError = error instanceof Error ? error.message : "Supabase 연결 설정을 확인해 주세요.";
    }
  }

  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || `${protocol}://${host}`).replace(/\/$/, "");

  return (
    <ReportsManager
      initialReports={reports}
      activeType={activeType}
      range={range}
      truncated={truncated}
      cap={REPORT_LIST_CAP}
      baseUrl={baseUrl}
      setupError={setupError}
      currentUser={{
        username: currentUser.username,
        displayName: currentUser.displayName,
        role: currentUser.role,
        permissions: currentUser.permissions,
      }}
    />
  );
}
