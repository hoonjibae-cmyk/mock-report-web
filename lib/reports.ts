import { getSupabaseAdmin } from "@/lib/supabase-admin";
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
      "id,batch_id,public_token,student_name,school,grade,is_active,pin_required,view_count,last_viewed_at,created_at,report_batches(title,exam_label,created_by_name),exams(exam_type)",
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
