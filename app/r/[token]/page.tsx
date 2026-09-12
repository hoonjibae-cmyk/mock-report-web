import AcademyLogo from "@/components/AcademyLogo";
import GenericReport, { type ReportComments } from "@/components/GenericReport";
import PinGate from "@/components/PinGate";
import ReportView from "@/components/ReportView";
import { getCurrentUser, hasPermission, hasReportAccess } from "@/lib/auth";
import { getExamOverview, parseTeacherComment } from "@/lib/omr-comments";
import { isGenericReport } from "@/lib/omr-report-types";
import { getReportByToken, recordReportView } from "@/lib/reports";
import { gatePhoneHint } from "@/lib/utils";

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

  // 로그인한 직원은 PIN 없이 연다. PIN은 링크가 밖으로 샜을 때를 막는 자물쇠지
  // 직원을 막는 것이 아니다 — 담임이 제 반 성적표를 보려고 학부모 번호를 알아
  // 와야 한다면 '내 반' 화면은 쓸 수 없다.
  const staff = await getCurrentUser();
  const staffViewing = Boolean(staff && hasPermission(staff, "viewReports"));

  if (row.pin_required && !staffViewing && !(await hasReportAccess(token))) {
    // gatePhoneHint 를 거쳐 넘긴다. 예전 성적표는 뒤 4자리가 드러난 형식으로
    // 저장돼 있는데, 그 네 자리가 곧 열쇠라 그대로 띄우면 안 된다.
    return <PinGate token={token} phoneMasked={gatePhoneHint(row.parent_phone_masked)} />;
  }

  // 열람 횟수는 '학부모가 봤는가'를 뜻한다. 직원이 여는 것은 세지 않는다 —
  // 세면 담임이 한 번 훑어본 성적표가 목록에서 '열람됨'으로 보인다.
  if (!staffViewing) await recordReportView(row.id, row.view_count).catch(() => undefined);
  if (isGenericReport(row.report_data)) {
    // 담임 의견(총평·개별)은 성적표 생성 이후에도 수정되므로 열람 시점에 읽는다.
    const personal = parseTeacherComment(row.teacher_comment);
    const overview = row.exam_id
      ? await getExamOverview(row.exam_id).catch(() => null)
      : null;
    // 초안(draft) 상태는 아직 학부모에게 보일 글이 아니므로 확정된 것만 싣는다.
    const overviewFinal = overview?.status === "final";
    const personalFinal = personal.status === "final";
    const comments: ReportComments = {
      overview: overviewFinal ? overview.final : null,
      style: overview?.style ?? "free",
      areaNotes: overviewFinal ? overview.areaNotes : [],
      personal: personalFinal ? personal.personalFinal : null,
      areaFeedback: personalFinal ? personal.areaFeedback : [],
      keywords: personalFinal ? personal.displayKeywords : [],
    };
    return <GenericReport report={row.report_data} comments={comments} />;
  }
  return <ReportView report={row.report_data} />;
}
