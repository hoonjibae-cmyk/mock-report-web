import { headers } from "next/headers";
import ReportsManager from "@/components/ReportsManager";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { listAdminReports } from "@/lib/reports";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return null;

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
