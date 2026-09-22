import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { homeroomKey, type HomeroomReport } from "@/lib/homeroom";
import { parseTeacherComment } from "@/lib/omr-comments";
import { isGenericReport } from "@/lib/omr-report-types";
import { EXAM_TYPE_LABELS, type ExamType } from "@/lib/omr-types";
import type { ReportDbRow } from "@/lib/types";

export interface AdminReportListItem {
  id: string;
  batchId: string;
  batchTitle: string;
  examLabel: string;
  token: string;
  studentName: string;
  school: string;
  grade: string;
  active: boolean;
  pinRequired: boolean;
  viewCount: number;
  lastViewedAt: string | null;
  createdAt: string;
  createdByName: string;
  /** 묶음을 만든 계정 — 삭제는 만든 사람과 총괄만 할 수 있다 */
  createdByUsername: string | null;
  /**
   * 이 성적표가 속한 OMR 시험의 유형. 전국 모의고사 엑셀로 만든 성적표는
   * 연결된 시험이 없어(exam_id null) 국영수 모의고사로 본다.
   */
  examType: ExamType;
}

function examTypeOf(value: unknown): ExamType {
  const row = Array.isArray(value) ? value[0] : value;
  const key = (row as { exam_type?: unknown } | null | undefined)?.exam_type;
  return typeof key === "string" && key in EXAM_TYPE_LABELS ? (key as ExamType) : "mock";
}

export async function listAdminReports(limit = 300): Promise<AdminReportListItem[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("student_reports")
    .select(
      "id,batch_id,public_token,student_name,school,grade,is_active,pin_required,view_count,last_viewed_at,created_at,report_batches(title,exam_label,created_by_name,created_by_username),exams(exam_type)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`성적표 목록 조회 실패: ${error.message}`);

  return (data ?? []).map((row: any) => ({
    id: row.id,
    batchId: row.batch_id,
    batchTitle: row.report_batches?.title ?? "성적표",
    examLabel: row.report_batches?.exam_label ?? "",
    token: row.public_token,
    studentName: row.student_name,
    school: row.school ?? "",
    grade: row.grade ?? "3",
    active: row.is_active,
    pinRequired: row.pin_required,
    viewCount: row.view_count ?? 0,
    lastViewedAt: row.last_viewed_at,
    createdAt: row.created_at,
    createdByName: row.report_batches?.created_by_name ?? "관리자",
    createdByUsername: row.report_batches?.created_by_username ?? null,
    // PostgREST는 관계를 객체 또는 배열로 돌려줄 수 있어 둘 다 받는다.
    // 연결된 시험이 없는 성적표(전국 모의고사 엑셀)는 국영수로 본다.
    examType: examTypeOf(row.exams),
  }));
}

export async function getReportByToken(publicToken: string): Promise<ReportDbRow | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("student_reports")
    .select("*")
    .eq("public_token", publicToken)
    .maybeSingle();

  if (error) throw new Error(`성적표 조회 실패: ${error.message}`);
  return data as ReportDbRow | null;
}

export async function recordReportView(id: string, currentCount: number): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase
    .from("student_reports")
    .update({ view_count: currentCount + 1, last_viewed_at: new Date().toISOString() })
    .eq("id", id);
}

/**
 * 담임 선생님의 '내 반' 성적표 — 성적표에 적힌 담임 이름이 이 직원의 이름과 같은 것.
 *
 * 비교는 공백·대소문자를 뺀 열쇠(homeroom_key, DB 생성 컬럼)로 한다. 성적표 본문
 * (report_data)에서 화면에 필요한 값만 추린다 — 본문 전체를 화면으로 내려보내지
 * 않기 위해서다. 유형별 열람 제한(반배치고사 제외)은 groupByExam 이 건다.
 */
export async function listHomeroomReports(teacherName: string, limit = 600): Promise<HomeroomReport[]> {
  const key = homeroomKey(teacherName);
  if (!key) return [];

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("student_reports")
    // supabase-js는 select 문자열을 그대로 읽어 행 타입을 만든다. 변수로 빼면
    // 타입이 무너지므로 문자열을 여기 직접 적는다.
    .select(
      "id,public_token,student_name,school,class_name,student_key,is_active,view_count,created_at,exam_id,report_data,exams(exam_type,title,exam_date)",
    )
    .eq("homeroom_key", key)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`내 반 성적표 조회 실패: ${error.message}`);

  const out: HomeroomReport[] = [];
  for (const row of data ?? []) {
    const body = row.report_data;
    // 국영수 엑셀로 만든 옛 성적표(schemaVersion 1)는 담임을 모른다 — 여기 오지 않는다
    if (!isGenericReport(body)) continue;
    const exam = Array.isArray(row.exams) ? row.exams[0] : row.exams;
    out.push({
      reportId: row.id,
      token: row.public_token,
      examId: (row.exam_id as string | null) ?? null,
      examType: examTypeOf(row.exams),
      examTitle: body.examTitle || (exam as { title?: string } | null)?.title || "성적표",
      examDate: body.examDate ?? (exam as { exam_date?: string | null } | null)?.exam_date ?? null,
      studentKey: (row.student_key as string | null) ?? body.student.key ?? null,
      studentName: row.student_name,
      school: row.school ?? "",
      className: (row.class_name as string | null) ?? "",
      raw: body.score.raw,
      max: body.score.max,
      standardScore: body.standardScore,
      rank: body.rank,
      cohortCount: body.cohort.count,
      cohortMean: body.cohort.mean,
      areas: body.areas ?? [],
      active: Boolean(row.is_active),
      viewCount: row.view_count ?? 0,
      createdAt: row.created_at,
    });
  }
  return out;
}

/** 운영진 검토 화면의 한 줄 — 성적표 본문은 싣지 않고, 열어 볼 목차만 */
export interface ReviewStudentRow {
  reportId: string;
  token: string;
  studentKey: string | null;
  studentName: string;
  school: string;
  className: string;
  raw: number;
  max: number;
  commentStatus: "final" | "draft" | "none";
  /** 확정된 개별 의견의 앞부분 — 표에서 훑을 수 있게 */
  commentPreview: string | null;
  viewCount: number;
  createdAt: string;
}

/**
 * 이 시험의 성적표를 학생별로(다시 만든 학생은 마지막 것만) 이름순으로.
 * 운영진이 컨펌 전에 훑는 목차다.
 */
export async function listReviewStudents(examId: string): Promise<ReviewStudentRow[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("student_reports")
    .select("id,public_token,student_key,student_name,school,class_name,is_active,view_count,created_at,report_data,teacher_comment")
    .eq("exam_id", examId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`검토 목록 조회 실패: ${error.message}`);

  const seen = new Set<string>();
  const out: ReviewStudentRow[] = [];
  for (const row of data ?? []) {
    if (row.is_active === false) continue;
    const key = (row.student_key as string | null) ?? `#${row.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const body = row.report_data;
    const comment = parseTeacherComment(row.teacher_comment);
    const text = (comment.personalFinal ?? "").trim();
    out.push({
      reportId: row.id as string,
      token: row.public_token as string,
      studentKey: (row.student_key as string | null) ?? null,
      studentName: (row.student_name as string) ?? "",
      school: (row.school as string | null) ?? "",
      className: (row.class_name as string | null) ?? "",
      raw: isGenericReport(body) ? body.score.raw : 0,
      max: isGenericReport(body) ? body.score.max : 0,
      commentStatus: text ? (comment.status === "final" ? "final" : "draft") : "none",
      commentPreview: text ? (text.length > 40 ? `${text.slice(0, 40)}…` : text) : null,
      viewCount: (row.view_count as number) ?? 0,
      createdAt: row.created_at as string,
    });
  }
  return out.sort((a, b) => a.studentName.localeCompare(b.studentName, "ko"));
}

/** 이 시험의 성적표 학생 수(다시 만든 학생은 한 번만) */
export async function countExamStudents(examId: string): Promise<number> {
  return (await listReviewStudents(examId)).length;
}
