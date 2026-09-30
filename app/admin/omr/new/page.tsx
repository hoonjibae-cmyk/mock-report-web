import { redirect } from "next/navigation";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { homeroomKey } from "@/lib/homeroom";
import { fetchClassBoard } from "@/lib/student-directory";
import OmrExamForm from "@/components/OmrExamForm";

export const dynamic = "force-dynamic";

export default async function NewOmrExamPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!hasPermission(user, "createReports")) redirect("/admin/omr");

  // 월말평가의 '반 선택'에 보일 반 — 로그인한 선생님이 담임인 반만. 담임 이름은
  // 학생 관리 프로그램의 것이고 계정 이름은 인사 프로그램의 것이라 이름 열쇠로
  // 잇는다('내 반'과 같은 규칙). 담당 반이 없으면(경영지원 등) 전체 반을 보인다.
  const board = await fetchClassBoard();
  const myKey = homeroomKey(user.displayName);
  const mine = board.classes.filter((c) => homeroomKey(c.teacher) === myKey);
  const classOptions = (mine.length > 0 ? mine : board.classes).sort((a, b) =>
    a.className.localeCompare(b.className, "ko"),
  );
  return (
    <OmrExamForm
      classOptions={classOptions}
      classesMine={mine.length > 0}
      classesError={board.error ?? null}
    />
  );
}
