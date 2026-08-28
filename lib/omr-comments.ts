// 담임 의견(Phase B) 데이터 계층
// - 시험 총평(응시생 공통): exams.overview_comment jsonb
// - 학생별 개별 코멘트: student_reports.teacher_comment jsonb

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isGenericReport, type GenericReportData } from "@/lib/omr-report-types";

export type CommentStatus = "draft" | "final";

/**
 * 영역별 성취 등급.
 *
 * 성취율에서 자동으로 제안하고 선생님이 고칠 수 있다. 절대 기준(성취율)으로
 * 매기는 것은 학부모에게 설명하기 쉬워야 하기 때문이다 — 성적표에는 반 평균이
 * 바로 옆에 함께 실리므로, 시험이 어려웠는지는 그 숫자로 읽힌다.
 */
export type AreaRating = "매우 우수" | "우수" | "보통" | "보완 필요";

export const AREA_RATINGS: AreaRating[] = ["매우 우수", "우수", "보통", "보완 필요"];

/** 성취율(%)에서 등급을 제안한다. 선생님이 그대로 두거나 바꾼다. */
export function suggestRating(rate: number): AreaRating {
  if (rate >= 85) return "매우 우수";
  if (rate >= 65) return "우수";
  if (rate >= 45) return "보통";
  return "보완 필요";
}

/** 영역 하나에 대한 개별 피드백 — 등급 + 서술 */
export interface AreaFeedback {
  area: string;
  rating: AreaRating;
  /** 선생님 서술. 비어 있으면 성적표에 등급만 실린다 */
  text: string;
}

function parseAreaFeedback(value: unknown): AreaFeedback[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      if (typeof raw !== "object" || raw === null) return null;
      const entry = raw as Record<string, unknown>;
      const area = String(entry.area ?? "").trim();
      if (!area) return null;
      const rating = AREA_RATINGS.find((r) => r === entry.rating) ?? "보통";
      return { area: area.slice(0, 40), rating, text: String(entry.text ?? "").trim().slice(0, 1200) };
    })
    .filter((entry): entry is AreaFeedback => entry !== null)
    .slice(0, 20);
}

/** 시험 안내에서 영역마다 '무엇을 확인했는지' 적는 칸 */
export interface AreaNote {
  area: string;
  text: string;
}

function parseAreaNotes(value: unknown): AreaNote[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      if (typeof raw !== "object" || raw === null) return null;
      const entry = raw as Record<string, unknown>;
      const area = String(entry.area ?? "").trim();
      if (!area) return null;
      return { area: area.slice(0, 40), text: String(entry.text ?? "").trim().slice(0, 1200) };
    })
    .filter((entry): entry is AreaNote => entry !== null)
    .slice(0, 20);
}

/** 시험 공통 총평 */
export interface OverviewComment {
  aiDraft: string | null;
  final: string | null;
  /**
   * 영역별 출제 안내 — '이번 시험에서 이 영역의 무엇을 확인했는가'.
   * 응시생 전원의 성적표에 똑같이 실리므로 시험당 한 번만 쓴다.
   */
  areaNotes: AreaNote[];
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
  /** 교사 첨삭을 거친 최종 문장(종합 평가) */
  personalFinal: string | null;
  /** 영역별 평가 — 등급 + 서술. 종합 평가만으로는 어디가 약한지 안 보인다 */
  areaFeedback: AreaFeedback[];
  status: CommentStatus;
  editedBy: string | null;
  updatedAt: string | null;
}

export function emptyOverview(): OverviewComment {
  return { aiDraft: null, final: null, areaNotes: [], status: "draft", updatedAt: null };
}

export function emptyTeacherComment(): TeacherComment {
  return {
    displayKeywords: [],
    weaveKeywords: [],
    aiDraft: null,
    personalFinal: null,
    areaFeedback: [],
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
    areaNotes: parseAreaNotes(value.areaNotes),
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
    areaFeedback: parseAreaFeedback(value.areaFeedback),
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
    /**
     * 영역별 성취 — 등급을 제안하고 어느 영역에 서술을 써야 하는지 알려 준다.
     * 성적표 전체를 화면으로 내려보내지 않기 위해 필요한 값만 추린다.
     */
    areas: Array<{ area: string; earned: number; possible: number; rate: number; cohortRate: number }>;
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
            areas: reportData.areas.map((a) => ({
              area: a.area,
              earned: a.earned,
              possible: a.possible,
              rate: a.rate,
              cohortRate: a.cohortRate,
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
