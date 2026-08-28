// 담임 의견(Phase B) 데이터 계층
// - 시험 총평(응시생 공통): exams.overview_comment jsonb
// - 학생별 개별 코멘트: student_reports.teacher_comment jsonb

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isGenericReport, type GenericReportData } from "@/lib/omr-report-types";

export type CommentStatus = "draft" | "final";

/** 시험 공통 총평 */
export interface OverviewComment {
  aiDraft: string | null;
  final: string | null;
  status: CommentStatus;
  updatedAt: string | null;
}

/** 학생별 개별 코멘트 */
export interface TeacherComment {
  /** 성적표에 칩으로 노출 — 긍정 키워드만 */
  displayKeywords: string[];
  /** 문장에 반영하되 노출하지 않음 — 보완점 포함 가능 */
  weaveKeywords: string[];
  aiDraft: string | null;
  /** 교사 첨삭을 거친 최종 문장 */
  personalFinal: string | null;
  status: CommentStatus;
  editedBy: string | null;
  updatedAt: string | null;
}

export function emptyOverview(): OverviewComment {
  return { aiDraft: null, final: null, status: "draft", updatedAt: null };
}

export function emptyTeacherComment(): TeacherComment {
  return {
    displayKeywords: [],
    weaveKeywords: [],
    aiDraft: null,
    personalFinal: null,
    status: "draft",
    editedBy: null,
    updatedAt: null,
  };
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry).trim()).filter(Boolean).slice(0, 12);
}

export function parseOverview(raw: unknown): OverviewComment {
  if (typeof raw !== "object" || raw === null) return emptyOverview();
  const value = raw as Record<string, unknown>;
  return {
    aiDraft: typeof value.aiDraft === "string" ? value.aiDraft : null,
    final: typeof value.final === "string" ? value.final : null,
    status: value.status === "final" ? "final" : "draft",
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
  };
}

export function parseTeacherComment(raw: unknown): TeacherComment {
  if (typeof raw !== "object" || raw === null) return emptyTeacherComment();
  const value = raw as Record<string, unknown>;
  return {
    displayKeywords: asStringArray(value.displayKeywords),
    weaveKeywords: asStringArray(value.weaveKeywords),
    aiDraft: typeof value.aiDraft === "string" ? value.aiDraft : null,
    personalFinal: typeof value.personalFinal === "string" ? value.personalFinal : null,
    status: value.status === "final" ? "final" : "draft",
    editedBy: typeof value.editedBy === "string" ? value.editedBy : null,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
  };
}

export async function getExamOverview(examId: string): Promise<OverviewComment> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("exams")
    .select("overview_comment")
    .eq("id", examId)
    .maybeSingle();
  if (error) throw new Error(`총평을 불러오지 못했습니다: ${error.message}`);
  return parseOverview(data?.overview_comment);
}

export async function saveExamOverview(
  examId: string,
  overview: OverviewComment,
): Promise<OverviewComment> {
  const supabase = getSupabaseAdmin();
  const payload = { ...overview, updatedAt: new Date().toISOString() };
  const { error } = await supabase
    .from("exams")
    .update({ overview_comment: payload })
    .eq("id", examId);
  if (error) throw new Error(`총평 저장 실패: ${error.message}`);
  return payload;
}

/** 담임 의견 편집 화면용 학생 행 — 같은 student_key는 최신 성적표 하나만 */
export interface CommentStudentRow {
  reportId: string;
  studentKey: string;
  studentName: string;
  school: string;
  createdAt: string;
  /** 점수 요약(코멘트 작성 참고용) */
  summary: {
    raw: number;
    max: number;
    rank: number;
    cohortCount: number;
    standardScore: number;
    weakItems: number[];
    growth: Array<{ date: string; standardScore: number }>;
  } | null;
  comment: TeacherComment;
  reportData: GenericReportData | null;
}

export async function listCommentStudents(examId: string): Promise<CommentStudentRow[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("student_reports")
    .select("id,student_key,student_name,school,report_data,teacher_comment,created_at")
    .eq("exam_id", examId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`학생 목록을 불러오지 못했습니다: ${error.message}`);

  const seen = new Set<string>();
  const rows: CommentStudentRow[] = [];
  for (const row of data ?? []) {
    const key = (row.student_key as string) || row.id;
    if (seen.has(key)) continue;
    seen.add(key);
    const reportData = isGenericReport(row.report_data) ? row.report_data : null;
    rows.push({
      reportId: row.id,
      studentKey: key,
      studentName: row.student_name ?? "",
      school: row.school ?? "",
      createdAt: row.created_at,
      summary: reportData
        ? {
            raw: reportData.score.raw,
            max: reportData.score.max,
            rank: reportData.rank,
            cohortCount: reportData.cohort.count,
            standardScore: reportData.standardScore,
            weakItems: reportData.weakItems,
            growth: reportData.growth.map((point) => ({
              date: point.date,
              standardScore: point.standardScore,
            })),
          }
        : null,
      comment: parseTeacherComment(row.teacher_comment),
      reportData,
    });
  }
  // 이름순 정렬(검수 순서와 무관하게 찾기 쉽게)
  rows.sort((a, b) => a.studentName.localeCompare(b.studentName, "ko"));
  return rows;
}

export async function saveTeacherComment(
  reportId: string,
  comment: TeacherComment,
  editedBy: string,
): Promise<TeacherComment> {
  const supabase = getSupabaseAdmin();
  const payload: TeacherComment = {
    ...comment,
    editedBy,
    updatedAt: new Date().toISOString(),
  };
  const { error } = await supabase
    .from("student_reports")
    .update({ teacher_comment: payload })
    .eq("id", reportId);
  if (error) throw new Error(`개별 코멘트 저장 실패: ${error.message}`);
  return payload;
}
