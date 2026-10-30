// 학생 카드(Student-Card)로 시험 기록 보내기 (v1.58.0, 원장님 2026-10-30).
//
// 성적표를 만들 때마다 학생 카드의 '테스트' 탭에 그 기록이 쌓이도록 보낸다 — Student-Card v1.107.0 의
// POST /api/exams (docs/STUDENT_CARD_API.md 6절). 학생은 성적표의 student_key(수험번호 = 카드번호,
// 신규생은 sc<학생ID>)로 찾는다. 성적표마다 reportId(성적표 id) 하나 — 다시 보내면 덮어쓴다.
// 환경변수는 학생 정보 연동과 같다(STUDENT_API_URL · STUDENT_API_KEY).
//
// 실패해도 예외를 던지지 않는다 — 성적표 생성은 끝난 일이고, 못 보낸 것은 하루 한 번 도는
// 전체 보내기(cron)와 설정 화면의 [시험 기록 전체 보내기]가 다시 채운다(같은 reportId 는 덮어쓴다).

import { isGenericReport } from "@/lib/omr-report-types";
import { EXAM_TYPE_BADGES } from "@/lib/omr-types";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export interface ExamRecord {
  /** 수험번호(= 학생 카드의 카드번호) 또는 `sc<학생ID>` */
  studentKey: string;
  /** 성적표 id — 학생 카드가 같은 성적표를 알아보는 열쇠 */
  reportId: string;
  examId?: string;
  examTitle: string;
  /** 월말평가 · 반배치고사 · 국영수 모의고사 … */
  examKind: string;
  /** YYYY-MM-DD — 학생 카드가 이 날짜로 정렬한다 */
  examDate: string;
  score?: number;
  max?: number;
  rank?: number;
  rankTotal?: number;
  /** 성적표 주소 — 학생 카드에서 줄을 누르면 이 주소가 새 창에 열린다 */
  reportUrl: string;
  /** 시험용 성적표 — 학생 카드가 저장하지 않는다 */
  isTest?: boolean;
}

export interface ReportRowLike {
  id: string;
  student_key?: string | null;
  exam_id?: string | null;
  public_token: string;
  report_data: unknown;
  created_at?: string | null;
  is_active?: boolean | null;
}

export interface ExamSyncResult {
  configured: boolean;
  /** 학생 카드로 보낸 건수 */
  sent: number;
  /** 학생 카드가 저장한 건수 */
  saved: number;
  /** 학생을 못 찾았거나 시험용이라 저장하지 않은 건수 */
  unmatched: number;
  /** 열쇠(student_key)가 없어 보내지 않은 성적표 수 */
  skipped: number;
  error?: string;
}

/** 한 번에 보내는 최대 건수 — 학생 카드 창구의 한도와 같다 */
export const EXAM_SYNC_CHUNK = 200;
const REPORT_COLUMNS = "id,student_key,exam_id,public_token,report_data,created_at,is_active";
/** 시험용 시험 이름 — Student-Card(placementScoreEligibility)와 같은 규칙 */
const TEST_TITLE = /테스트\s*용|(?:부원장|개발|연동|알림)\s*테스트|(?:^|[_\s])(?:dummy|sample|demo)(?:$|[_\s])/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function examSyncConfigured(): boolean {
  return Boolean(process.env.STUDENT_API_URL && process.env.STUDENT_API_KEY);
}

function base(): string {
  return (process.env.STUDENT_API_URL ?? "").replace(/\/$/, "");
}

const finite = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;
const round1 = (value: number): number => Math.round(value * 10) / 10;
const empty = (): ExamSyncResult => ({ configured: examSyncConfigured(), sent: 0, saved: 0, unmatched: 0, skipped: 0 });

/**
 * 성적표 한 줄 → 학생 카드에 보낼 기록. 열쇠가 없는 성적표(옛 모의고사 엑셀)는 학생 카드가 찾을 수 없으니 null.
 * 학생 카드는 점수 ≤ 배점만 받는다 — 환산 점수가 배점을 넘으면 배점은 빼고 보낸다.
 */
export function examRecordFromReport(row: ReportRowLike, baseUrl: string): ExamRecord | null {
  const studentKey = String(row.student_key ?? "").trim();
  if (!studentKey || !row.id || !row.public_token) return null;
  const reportUrl = `${baseUrl.replace(/\/$/, "")}/r/${row.public_token}`;
  const madeOn = String(row.created_at ?? "").slice(0, 10);
  const data = row.report_data;

  if (isGenericReport(data)) {
    const score = finite(data.score?.raw);
    const max = finite(data.score?.max);
    const rank = finite(data.rank);
    const rankTotal = finite(data.cohort?.count);
    const kind = EXAM_TYPE_BADGES[data.examType]?.label ?? data.examTypeLabel ?? "";
    const examTitle = String(data.examTitle ?? "").trim() || kind || "시험";
    return {
      studentKey,
      reportId: row.id,
      ...(data.examId ? { examId: data.examId } : {}),
      examTitle,
      examKind: kind,
      examDate: DATE.test(String(data.examDate ?? "")) ? String(data.examDate) : madeOn,
      ...(score !== undefined ? { score: round1(Math.max(0, score)) } : {}),
      ...(score !== undefined && max !== undefined && max > 0 && score <= max ? { max } : {}),
      ...(rank !== undefined && rank >= 1 ? { rank: Math.round(rank) } : {}),
      ...(rankTotal !== undefined && rankTotal >= 1 ? { rankTotal: Math.round(rankTotal) } : {}),
      reportUrl,
      ...(TEST_TITLE.test(examTitle) ? { isTest: true } : {}),
    };
  }

  // 옛 모의고사(엑셀) 성적표 — 보통 student_key 가 없어 여기까지 오지 않는다. 오면 제목·날짜·평균 점수만
  const legacy = (typeof data === "object" && data !== null ? data : {}) as {
    reportTitle?: unknown; examLabel?: unknown; overall?: { averageScore?: unknown };
  };
  const examTitle = String(legacy.reportTitle ?? legacy.examLabel ?? "").trim() || "모의고사";
  const average = finite(legacy.overall?.averageScore);
  return {
    studentKey,
    reportId: row.id,
    examTitle,
    examKind: EXAM_TYPE_BADGES.mock.label,
    examDate: madeOn,
    ...(average !== undefined ? { score: round1(average), max: 100 } : {}),
    reportUrl,
    ...(TEST_TITLE.test(examTitle) ? { isTest: true } : {}),
  };
}

function describeFailure(status: number): string {
  if (status === 401 || status === 403) return "학생 관리 프로그램이 인증을 거부했습니다. STUDENT_API_KEY 가 상대 쪽 API_KEY 와 같은지 확인해 주세요.";
  if (status === 404) return "학생 관리 프로그램에 시험 기록 창구(/api/exams)가 아직 없습니다. Student-Card v1.107.0 이상이 필요합니다.";
  return `학생 관리 프로그램이 시험 기록을 받지 못했습니다(${status}).`;
}

function describeError(error: unknown): string {
  const timedOut = error instanceof Error && error.name === "TimeoutError";
  return timedOut
    ? "학생 관리 프로그램이 제때 응답하지 않았습니다(20초)."
    : "학생 관리 프로그램에 연결하지 못했습니다. STUDENT_API_URL 주소를 확인해 주세요.";
}

function call(path: string, init: RequestInit): Promise<Response> {
  return fetch(`${base()}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", "x-api-key": process.env.STUDENT_API_KEY ?? "" },
    signal: AbortSignal.timeout(20_000),
  });
}

/** 기록을 200건씩 보낸다. 한 묶음이 실패하면 거기서 멈추고 까닭을 돌려준다(던지지 않는다). */
export async function pushExamRecords(records: ExamRecord[]): Promise<ExamSyncResult> {
  const out = empty();
  if (!out.configured || records.length === 0) return out;
  for (let from = 0; from < records.length; from += EXAM_SYNC_CHUNK) {
    const part = records.slice(from, from + EXAM_SYNC_CHUNK);
    try {
      const res = await call("/api/exams", { method: "POST", body: JSON.stringify({ exams: part }) });
      if (!res.ok) {
        out.error = describeFailure(res.status);
        return out;
      }
      const data = (await res.json().catch(() => ({}))) as { results?: Array<{ saved?: boolean }> };
      out.sent += part.length;
      for (const r of data.results ?? []) {
        if (r?.saved) out.saved += 1;
        else out.unmatched += 1;
      }
    } catch (error) {
      out.error = describeError(error);
      return out;
    }
  }
  return out;
}

/** 지운(또는 중지한) 성적표의 기록을 학생 카드에서 거둔다. 없다는 답(404)은 이미 없는 것이니 그대로 둔다. */
export async function removeExamRecords(reportIds: string[]): Promise<{ configured: boolean; removed: number; error?: string }> {
  const out = { configured: examSyncConfigured(), removed: 0 } as { configured: boolean; removed: number; error?: string };
  if (!out.configured) return out;
  for (const id of [...new Set(reportIds.filter(Boolean))]) {
    try {
      const res = await call(`/api/exams/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (res.ok) out.removed += 1;
      else if (res.status !== 404) out.error = describeFailure(res.status);
    } catch (error) {
      out.error = describeError(error);
    }
  }
  return out;
}

/**
 * 성적표 id 로 다시 읽어 보낸다 — 새로 만든 것 · 갱신한 것 · 다시 켠 것. 중지된 성적표는 거둔다.
 * 성적표 생성 창구가 응답을 돌려주기 전에 부른다(서버리스라 응답 뒤에는 멈출 수 있다).
 */
export async function syncReportsById(reportIds: string[], baseUrl: string): Promise<ExamSyncResult> {
  const ids = [...new Set(reportIds.filter(Boolean))];
  const out = empty();
  if (!out.configured || ids.length === 0) return out;
  const supabase = getSupabaseAdmin();
  const records: ExamRecord[] = [];
  const gone: string[] = [];
  for (let from = 0; from < ids.length; from += EXAM_SYNC_CHUNK) {
    const { data, error } = await supabase.from("student_reports").select(REPORT_COLUMNS).in("id", ids.slice(from, from + EXAM_SYNC_CHUNK));
    if (error) return { ...out, error: `성적표를 다시 읽지 못했습니다: ${error.message}` };
    for (const row of (data ?? []) as ReportRowLike[]) {
      if (row.is_active === false) { gone.push(row.id); continue; }
      const record = examRecordFromReport(row, baseUrl);
      if (record) records.push(record);
      else out.skipped += 1;
    }
  }
  if (gone.length > 0) await removeExamRecords(gone);
  const pushed = await pushExamRecords(records);
  return { ...pushed, skipped: out.skipped };
}

/**
 * 살아 있는 성적표 전부를 보낸다 — 처음 연동할 때 지난 성적표를 채우고, 그 뒤로는 하루 한 번 돌며 빠진 것을 메운다.
 * 같은 reportId 는 학생 카드가 덮어쓰므로 여러 번 보내도 늘지 않는다.
 */
export async function backfillAllReports(baseUrl: string): Promise<ExamSyncResult & { scanned: number }> {
  const out = { ...empty(), scanned: 0 };
  if (!out.configured) return out;
  const supabase = getSupabaseAdmin();
  const PAGE = 500;
  const records: ExamRecord[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("student_reports")
      .select(REPORT_COLUMNS)
      .eq("is_active", true)
      .not("student_key", "is", null)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return { ...out, error: `성적표를 읽지 못했습니다: ${error.message}` };
    const rows = (data ?? []) as ReportRowLike[];
    out.scanned += rows.length;
    for (const row of rows) {
      const record = examRecordFromReport(row, baseUrl);
      if (record) records.push(record);
      else out.skipped += 1;
    }
    if (rows.length < PAGE) break;
  }
  const pushed = await pushExamRecords(records);
  return { ...pushed, skipped: out.skipped, scanned: out.scanned };
}
