import AcademyLogo from "@/components/AcademyLogo";
import PinGate from "@/components/PinGate";
import ReportView from "@/components/ReportView";
import { hasReportAccess } from "@/lib/auth";
import { getReportByToken, recordReportView } from "@/lib/reports";

export const dynamic = "force-dynamic";

function Unavailable({ title, message }: { title: string; message: string }) {
  return (
    <main className="login-shell report-gate-shell">
      <section className="login-card report-gate-card">
        <div className="brand-lockup centered"><AcademyLogo /><div><strong>목동유쌤영어학원</strong><span>개인 성적표</span></div></div>
        <h1>{title}</h1><p>{message}</p>
      </section>
    </main>
  );
}

export default async function PublicReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let row;
  try {
    row = await getReportByToken(token);
  } catch {
    return <Unavailable title="성적표를 불러오지 못했습니다" message="잠시 후 다시 시도하거나 학원으로 문의해 주세요." />;
  }

  if (!row) return <Unavailable title="성적표를 찾을 수 없습니다" message="링크 주소를 다시 확인해 주세요." />;
  if (!row.is_active) return <Unavailable title="현재 열람할 수 없는 성적표입니다" message="학원에서 링크를 중지했거나 새 링크로 교체했습니다." />;

  if (row.pin_required && !(await hasReportAccess(token))) {
    return <PinGate token={token} phoneMasked={row.parent_phone_masked ?? ""} />;
  }

  await recordReportView(row.id, row.view_count).catch(() => undefined);
  return <ReportView report={row.report_data} />;
}
