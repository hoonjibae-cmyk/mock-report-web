import { headers } from "next/headers";
import ReportsManager from "@/components/ReportsManager";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { listAdminReports } from "@/lib/reports";
import { EXAM_TYPE_LABELS, type ExamType } from "@/lib/omr-types";

export const dynamic = "force-dynamic";

/** ?type=monthly 같은 하위 메뉴 선택을 읽는다(모르는 값이면 전체) */
function parseType(value: string | string[] | undefined): ExamType | null {
  const key = Array.isArray(value) ? value[0] : value;
  return key && key in EXAM_TYPE_LABELS ? (key as ExamType) : null;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return null;
  const activeType = parseType((await searchParams).type);

  let reports: Awaited<ReturnType<typeof listAdminReports>> = [];
  let setupError = "";
  if (hasPermission(currentUser, "viewReports")) {
    try {
      reports = await listAdminReports();
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
