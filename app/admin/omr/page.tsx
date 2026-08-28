import { getCurrentUser, hasPermission } from "@/lib/auth";
import { listExams } from "@/lib/omr-exams";
import OmrDashboard from "@/components/OmrDashboard";
import { EXAM_TYPE_LABELS, type ExamType, type OmrExam } from "@/lib/omr-types";

export const dynamic = "force-dynamic";

/** ?type=monthly 같은 하위 메뉴 선택을 읽는다(모르는 값이면 전체) */
function parseType(value: string | string[] | undefined): ExamType | null {
  const key = Array.isArray(value) ? value[0] : value;
  return key && key in EXAM_TYPE_LABELS ? (key as ExamType) : null;
}

export default async function OmrExamsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) return null;
  const activeType = parseType((await searchParams).type);

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
      activeType={activeType}
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
