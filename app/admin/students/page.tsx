import StudentHistoryView, { type StudentHistory } from "@/components/StudentHistoryView";
import { canViewExamType, getCurrentUser, hasPermission } from "@/lib/auth";
import { homeroomKey, sameTeacher } from "@/lib/homeroom";
import { listHomeroomTeachers, listStudentReports, searchStudentReports } from "@/lib/reports";
import {
  candidatesFrom,
  groupHistory,
  nameKey,
  studentHeader,
  visibleExamType,
  type StudentCandidate,
  type StudentReport,
} from "@/lib/student-history";

export const dynamic = "force-dynamic";

/**
 * 학생별 시험 이력.
 *
 * 담임은 성적표에 담임으로 적힌 제 학생을 이름(또는 수험번호)으로 찾고, 그 학생이
 * OMR 리포트로 본 시험을 모두 본다 — 담임이 바뀌기 전의 것까지. 총괄은 모든 학생을
 * 찾을 수 있고, ?teacher=이름 으로 한 선생님의 학생만 좁힐 수 있다.
 *
 *   ?q=이름        검색
 *   ?key=수험번호   이 학생의 이력
 *   ?name=&school= 수험번호가 없는 옛 성적표의 학생
 */
export default async function StudentHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) return null;

  const params = await searchParams;
  const str = (value: string | string[] | undefined, max: number) =>
    (typeof value === "string" ? value : "").trim().slice(0, max);
  const query = str(params.q, 40);
  const key = str(params.key, 80);
  const name = str(params.name, 40);
  const school = str(params.school, 60);

  const isAdmin = user.role === "admin";
  const requestedTeacher = str(params.teacher, 60);
  // 일반 계정은 주소에 다른 이름을 적어도 제 학생만 보인다
  const teacherName = isAdmin ? requestedTeacher : user.displayName;
  const scopeKey = teacherName ? homeroomKey(teacherName) : null;
  const canSeePlacement = canViewExamType(user, "placement");
  const visible = (row: StudentReport) => visibleExamType(row.examType, canSeePlacement);

  let teachers: string[] | null = null;
  let candidates: StudentCandidate[] | null = null;
  let history: StudentHistory | null = null;
  let forbidden = false;
  let setupError = "";

  if (hasPermission(user, "viewReports")) {
    try {
      teachers = isAdmin ? await listHomeroomTeachers([user.displayName]) : null;

      if (query) {
        const rows = await searchStudentReports(query, { homeroomKey: scopeKey });
        candidates = candidatesFrom(rows.filter(visible), query);
      }

      if (key || name) {
        const rows = key
          ? await listStudentReports(key)
          : (await searchStudentReports(name)).filter(
              (row) =>
                !(row.studentKey ?? "").trim() &&
                nameKey(row.studentName) === nameKey(name) &&
                row.school.trim() === school,
            );
        // 담임은 제 학생만 — 어느 성적표에서든 담임으로 적혀 있어야 한다
        if (!isAdmin && !rows.some((row) => sameTeacher(row.teacher, user.displayName))) {
          forbidden = rows.length > 0;
        } else {
          const alive = rows.filter((row) => row.active);
          const shown = alive.filter(visible);
          const student = studentHeader(alive) ?? studentHeader(rows);
          if (student) {
            history = { student, groups: groupHistory(shown), hiddenCount: alive.length - shown.length };
          }
        }
      }
    } catch (error) {
      setupError = error instanceof Error ? error.message : "Supabase 연결 설정을 확인해 주세요.";
    }
  }

  return (
    <StudentHistoryView
      user={{ username: user.username, displayName: user.displayName, role: user.role }}
      teacherName={teacherName}
      teachers={teachers}
      query={query}
      candidates={candidates}
      history={history}
      forbidden={forbidden}
      setupError={setupError}
    />
  );
}
