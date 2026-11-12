import { notFound } from "next/navigation";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getVisibleExam } from "@/lib/exam-access";
import { listScans, scanKey, type OmrScan } from "@/lib/omr-scans";
import { listReviewStudents } from "@/lib/reports";
import { directoryConfigured, lookupStudents } from "@/lib/student-directory";
import { loadUploaderNames } from "@/lib/uploader-names";
import OmrScanReview from "@/components/OmrScanReview";

export const dynamic = "force-dynamic";

/** 학생 관리 프로그램이 느릴 때 검수 화면을 이만큼 넘게 기다리게 하지 않는다 */
const DIRECTORY_DEADLINE_MS = 2500;

/**
 * 답안지 목록에 적을 학생 이름 — 수험번호(또는 학생 열쇠) → 이름.
 *
 * 이미 만든 성적표의 이름이 먼저(학부모에게 나간 그 이름), 나머지는 학생 관리 프로그램에서.
 * 이름으로 찾기 위한 것이라 어느 쪽이 안 되더라도 화면은 그대로 열린다 — 연락처는 가져오지 않는다.
 */
async function loadStudentNames(examId: string, scans: OmrScan[]): Promise<Record<string, string>> {
  const names: Record<string, string> = {};
  try {
    for (const row of await listReviewStudents(examId)) {
      if (row.studentKey && row.studentName) names[row.studentKey] = row.studentName;
    }
  } catch {
    // 성적표 목록을 못 읽어도 이름 없이 간다
  }
  // 학생 관리 프로그램에는 수험번호(카드번호)로만 물을 수 있다 — sc<학생ID> 열쇠는 뺀다
  const missing = [
    ...new Set(
      scans
        .map((scan) => (scanKey(scan) ?? "").trim())
        .filter((key) => key && !names[key] && !/^sc\d+$/.test(key)),
    ),
  ];
  if (missing.length === 0 || !directoryConfigured()) return names;
  const looked = await Promise.race([
    lookupStudents(missing).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), DIRECTORY_DEADLINE_MS)),
  ]);
  if (looked) {
    for (const [key, info] of looked.students) if (info.name) names[key] = info.name;
  }
  return names;
}

export default async function OmrScansPage(context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!hasPermission(user, "viewReports")) return null;

  const { id } = await context.params;

  let scans: OmrScan[] = [];
  let setupError = "";
  const exam = await getVisibleExam(id).catch((error) => {
    setupError = error instanceof Error ? error.message : "Supabase 연결 설정을 확인해 주세요.";
    return null;
  });
  if (!exam && !setupError) notFound();

  let uploaderNames: Record<string, string> = {};
  let studentNames: Record<string, string> = {};
  if (exam) {
    try {
      [scans, uploaderNames] = await Promise.all([listScans(id), loadUploaderNames()]);
      studentNames = await loadStudentNames(id, scans);
    } catch (error) {
      setupError = error instanceof Error ? error.message : "판독 목록을 불러오지 못했습니다.";
    }
  }

  return (
    <OmrScanReview
      exam={exam}
      initialScans={scans}
      setupError={setupError}
      canEdit={hasPermission(user, "createReports")}
      me={user.username}
      uploaderNames={uploaderNames}
      studentNames={studentNames}
    />
  );
}
