import MyClassView from "@/components/MyClassView";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { groupByExam, type ExamGroup } from "@/lib/homeroom";
import { listHomeroomReports } from "@/lib/reports";

export const dynamic = "force-dynamic";

/**
 * 담임 선생님의 '내 반'.
 *
 * 성적표에 적힌 담임 이름이 로그인한 직원의 이름(인사 프로그램)과 같은 것만
 * 보인다. 반배치고사는 여기서 열지 않는다(groupByExam 이 거른다).
 */
export default async function MyClassPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  let groups: ExamGroup[] = [];
  let setupError = "";
  if (hasPermission(user, "viewReports")) {
    try {
      groups = groupByExam(await listHomeroomReports(user.displayName));
    } catch (error) {
      setupError = error instanceof Error ? error.message : "Supabase 연결 설정을 확인해 주세요.";
    }
  }

  return (
    <MyClassView
      user={{ username: user.username, displayName: user.displayName, role: user.role }}
      groups={groups}
      setupError={setupError}
    />
  );
}
