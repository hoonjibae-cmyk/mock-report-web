import MyClassView from "@/components/MyClassView";
import { canViewExamType, getCurrentUser, hasPermission } from "@/lib/auth";
import { groupByExam, type ExamGroup } from "@/lib/homeroom";
import { listHomeroomReports, listHomeroomTeachers } from "@/lib/reports";

export const dynamic = "force-dynamic";

/**
 * 담임 선생님의 '내 반'.
 *
 * 성적표에 적힌 담임 이름이 로그인한 직원의 이름(인사 프로그램)과 같은 것만
 * 보인다. 반배치고사는 여기서 열지 않는다(groupByExam 이 거른다).
 *
 * 총괄은 ?teacher=이름 으로 다른 선생님 반을 본다 — 드롭다운이 주소를 바꾼다.
 * 일반 계정은 주소에 이름을 적어도 제 반만 보인다(여기서 무시한다).
 */
export default async function MyClassPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) return null;

  const isAdmin = user.role === "admin";
  const requested = (await searchParams).teacher;
  const requestedName = typeof requested === "string" ? requested.trim().slice(0, 60) : "";
  const teacherName = isAdmin && requestedName ? requestedName : user.displayName;

  let groups: ExamGroup[] = [];
  let teachers: string[] | null = null;
  let setupError = "";
  if (hasPermission(user, "viewReports")) {
    try {
      const [rows, names] = await Promise.all([
        listHomeroomReports(teacherName),
        // 본인은 성적표가 없어도 목록에 있어야 드롭다운의 기본값이 선다
        isAdmin ? listHomeroomTeachers([user.displayName]) : Promise.resolve(null),
      ]);
      groups = groupByExam(rows, canViewExamType(user, "placement"));
      teachers = names;
    } catch (error) {
      setupError = error instanceof Error ? error.message : "Supabase 연결 설정을 확인해 주세요.";
    }
  }

  return (
    <MyClassView
      user={{ username: user.username, displayName: user.displayName, role: user.role }}
      teacherName={teacherName}
      teachers={teachers}
      groups={groups}
      setupError={setupError}
    />
  );
}
