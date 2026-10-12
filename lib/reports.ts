import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  lastSentAt,
  sendStateOf,
  summarizeByReport,
  type MessageStatus,
  type RecipientType,
  type ReportMessage,
  type SendState,
  type SendSummary,
} from "@/lib/report-messages";
import { EMPTY_RANGE, rangeBounds, type DateRange } from "@/lib/date-range";
import { homeroomKey, mergeTeacherNames, type HomeroomReport } from "@/lib/homeroom";
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
  /** 연결된 OMR 시험 — 없으면 null(전국 모의고사 엑셀 성적표) */
  examId: string | null;
  /** 알림톡 발송 상태 — 학부모·학생 어느 쪽이든 성공했으면 sent */
  sendState: SendState;
  sentParent: boolean;
  sentStudent: boolean;
  /** 마지막으로 성공한 발송 시각 */
  lastSentAt: string | null;
  /** 성공이 없을 때 마지막 실패 사유 */
  sendError: string | null;
}

function examTypeOf(value: unknown): ExamType {
  const row = Array.isArray(value) ? value[0] : value;
  const key = (row as { exam_type?: unknown } | null | undefined)?.exam_type;
  return typeof key === "string" && key in EXAM_TYPE_LABELS ? (key as ExamType) : "mock";
}

/**
 * 한 번에 불러오는 상한. 예전에는 300건이라 3주만 지나도 오래된 성적표가 조용히
 * 사라졌다. 이 상한에 닿으면 '더 있다'고 알리고, 그 뒤는 생성일 기간으로 잘라
 * 가져온다 — 전부를 한 화면에 내려보내면 몇 해 뒤 페이지가 무거워진다.
 */
export const REPORT_LIST_CAP = 5000;
/** PostgREST 가 한 요청에 주는 최대 행 수 */
const REPORT_PAGE = 1000;

export interface ListAdminReportsOptions {
  /** 생성일 기간(한국 시간 하루 기준) — 없으면 최근 것부터 */
  range?: DateRange;
  cap?: number;
}

export interface AdminReportListResult {
  items: AdminReportListItem[];
  /** 상한에 걸려 더 오래된 성적표를 두고 왔는가 */
  truncated: boolean;
  cap: number;
}

export async function listAdminReports(options: ListAdminReportsOptions = {}): Promise<AdminReportListResult> {
  const cap = Math.max(1, options.cap ?? REPORT_LIST_CAP);
  const bounds = rangeBounds(options.range ?? EMPTY_RANGE);
  const supabase = getSupabaseAdmin();

  // 생성일 내림차순으로 1000행씩 끊어 읽는다. 상한보다 하나 더 읽어 '더 있는가'를
  // 정확히 안다. 같은 묶음의 성적표는 created_at 이 같을 수 있어 id 로 순서를 고정한다
  // — 그래야 페이지 경계에서 행이 빠지거나 겹치지 않는다.
  const budget = cap + 1;
  const rows: any[] = [];
  for (let offset = 0; offset < budget; offset += REPORT_PAGE) {
    const size = Math.min(REPORT_PAGE, budget - offset);
    let query = supabase
      .from("student_reports")
      .select(
        "id,batch_id,public_token,student_name,school,grade,is_active,pin_required,view_count,last_viewed_at,created_at,report_batches(title,exam_label,created_by_name,created_by_username),exams(exam_type),exam_id",
      )
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    if (bounds.gte) query = query.gte("created_at", bounds.gte);
    if (bounds.lt) query = query.lt("created_at", bounds.lt);
    const { data, error } = await query.range(offset, offset + size - 1);
    if (error) throw new Error(`성적표 목록 조회 실패: ${error.message}`);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < size) break;
  }
  const truncated = rows.length > cap;
  const data = truncated ? rows.slice(0, cap) : rows;

  // 발송 기록 — 성적표마다 "보냈는가"를 목록에서 바로 보이게. 기록 표가 없어도 목록은 나와야 한다.
  const sendByReport = await sendSummariesFor(data.map((row: any) => row.id as string)).catch(() => new Map());

  const items: AdminReportListItem[] = data.map((row: any) => ({
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
    examId: (row.exam_id as string | null) ?? null,
    ...sendFieldsOf(sendByReport.get(row.id as string)),
  }));
  return { items, truncated, cap };
}

interface SendFields {
  sendState: SendState;
  sentParent: boolean;
  sentStudent: boolean;
  lastSentAt: string | null;
  sendError: string | null;
}

function sendFieldsOf(entry: { parent: SendSummary | null; student: SendSummary | null } | undefined): SendFields {
  const parent = entry?.parent ?? null;
  const student = entry?.student ?? null;
  const state = sendStateOf(parent, student);
  return {
    sendState: state,
    sentParent: Boolean(parent?.sent),
    sentStudent: Boolean(student?.sent),
    lastSentAt: lastSentAt(parent, student),
    sendError: state === "failed" ? (parent?.lastError ?? student?.lastError ?? null) : null,
  };
}

/** 성적표 id 들의 발송 요약 — 수신자(학부모/학생)별로 */
async function sendSummariesFor(
  reportIds: string[],
): Promise<Map<string, { parent: SendSummary | null; student: SendSummary | null }>> {
  const out = new Map<string, { parent: SendSummary | null; student: SendSummary | null }>();
  if (reportIds.length === 0) return out;
  const supabase = getSupabaseAdmin();
  const messages: ReportMessage[] = [];
  for (let i = 0; i < reportIds.length; i += 200) {
    const { data, error } = await supabase
      .from("report_messages")
      .select("id,report_id,exam_id,recipient_type,phone_masked,status,channel,provider_message_id,error,sent_by,created_at")
      .in("report_id", reportIds.slice(i, i + 200))
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      messages.push({
        id: row.id as string,
        reportId: row.report_id as string,
        examId: (row.exam_id as string | null) ?? null,
        recipientType: row.recipient_type as RecipientType,
        phoneMasked: (row.phone_masked as string) ?? "",
        status: row.status as MessageStatus,
        channel: (row.channel as string | null) ?? null,
        providerMessageId: (row.provider_message_id as string | null) ?? null,
        error: (row.error as string | null) ?? null,
        sentBy: (row.sent_by as string | null) ?? null,
        createdAt: row.created_at as string,
      });
    }
  }
  // 여러 묶음을 합쳤으니 최신순을 다시 맞춘다 — summarizeByReport 는 그 순서에 기댄다
  messages.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const summary = summarizeByReport(messages);
  for (const [key, value] of summary) {
    const [reportId, type] = key.split(":");
    const entry = out.get(reportId) ?? { parent: null, student: null };
    if (type === "parent") entry.parent = value;
    else entry.student = value;
    out.set(reportId, entry);
  }
  return out;
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

/**
 * 성적표에 담임으로 적힌 선생님 이름들 — 총괄이 '내 반'에서 다른 선생님 반을
 * 고를 때의 목록. 살아 있는 성적표만 보고, 표기가 다른 같은 이름은 하나로 합친다.
 *
 * PostgREST 에는 distinct 가 없어 담임 칸 하나만 페이지로 끊어 읽는다 — 글자
 * 한 칸뿐이라 수천 행도 가볍다. 상한을 두어 표가 아주 커져도 끝없이 읽지 않는다.
 */
export async function listHomeroomTeachers(include: string[] = []): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  const PAGE = 1000;
  const MAX_PAGES = 30;
  const names: string[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data, error } = await supabase
      .from("student_reports")
      .select("homeroom_teacher")
      .not("homeroom_key", "is", null)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(`담임 목록 조회 실패: ${error.message}`);
    for (const row of data ?? []) names.push(String(row.homeroom_teacher ?? ""));
    if (!data || data.length < PAGE) break;
  }
  return mergeTeacherNames(names, include);
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
  /** 개별 의견 전문(확정·초안 모두) — 검수자가 그 자리에서 고칠 때 쓴다 */
  commentText: string | null;
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
      commentText: text || null,
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
