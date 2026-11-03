// OMR 스캔 판독 결과(omr_scans) 저장소 — Supabase service-role 경유

import type { EssayFlag, EssayGradeSource } from "@/lib/essay-grading";
import type { ListeningMode } from "@/lib/listening";
import type { MarkValue } from "@/lib/omr-answers";
import {
  essayCropPath,
  randomTag,
  scanOriginalPath,
  scanPreviewPath,
} from "@/lib/scan-identity";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const SCAN_BUCKET = "omr-scans";

/**
 * DB 스키마가 코드보다 뒤처졌을 때(마이그레이션 미실행) 나오는 원문 오류를
 * 무엇을 해야 하는지 알 수 있는 문장으로 바꾼다. 데이터는 그대로 있고 조회만 막힌 상태다.
 */
function describeDbError(message: string): string {
  // Postgres("column x does not exist")와 PostgREST("Could not find the 'x' column … in the schema cache") 둘 다
  const missingColumn =
    message.match(/column [\w.]*?(\w+) does not exist/i) ?? message.match(/Could not find the '(\w+)' column/i);
  if (missingColumn) {
    const column = missingColumn[1];
    const guide: Record<string, string> = {
      essay_scores: "supabase/migration_v4_essay_scores.sql",
      essay_answers: "supabase/migration_v9_essay_transcription.sql",
      essay_crops: "supabase/migration_v9_essay_transcription.sql",
      preview_path: "supabase/migration_v7_scan_preview.sql",
      read_confidence: "supabase/migration_v8_read_confidence.sql",
      reviewed_by: "supabase/migration_v8_read_confidence.sql",
      listening_mode: "supabase/migration_v16_listening_mode.sql",
      uploaded_by: "supabase/migration_v22_scan_uploader.sql",
      content_hash: "supabase/migration_v22_scan_uploader.sql",
      essay_flags: "supabase/migration_v22_scan_uploader.sql",
    };
    const file = guide[column] ?? "supabase 폴더의 최신 migration 파일";
    return `데이터베이스 업데이트가 필요합니다. Supabase → SQL Editor에서 ${file}을 실행해 주세요. (기존 판독 결과는 그대로 보관되어 있으며, 실행 후 바로 다시 보입니다. 누락된 항목: ${column})`;
  }
  if (/relation .* does not exist/i.test(message)) {
    return `데이터베이스 표가 아직 없습니다. Supabase → SQL Editor에서 supabase/migration_v2_omr.sql, migration_v3_omr_scans.sql을 순서대로 실행해 주세요. (원문: ${message})`;
  }
  return message;
}

export type ScanStatus = "pending" | "reviewed";

/**
 * 판독기가 남긴 '얼마나 확실한가' 정보.
 *
 * 판정 자체(answers)와는 별개다. 같은 미표기라도 학생이 안 푼 문항과 연필이
 * 흐려 못 읽은 문항은 다르게 다뤄야 하고, 그 구분이 여기 담긴다.
 */
export interface ReadConfidence {
  /** 판정이 경계에 걸쳐 사람이 눈으로 봐야 하는 문항 번호 */
  uncertain: number[];
  /** 둘 이상 칠해진 문항 — '모두 고르기'면 정상이라 정답과 대조해 판단한다 */
  multiMarked: number[];
  /** 수험번호 자리 중 애매하게 읽힌 곳이 있는가 */
  idUncertain: boolean;
  /** QR과 마킹의 수험번호가 어긋나는가(학생별 답안지에서만 발생) */
  idConflict: boolean;
}

export interface OmrScan {
  id: string;
  examId: string;
  filename: string;
  scanPath: string | null;
  /** 검수 화면용 미리보기(판독기가 실제로 본 이미지) Storage 경로 */
  previewPath: string | null;
  studentId: string | null;
  studentIdQr: string | null;
  studentIdBubbles: string | null;
  /**
   * {문항번호: 표기} — 키는 문자열(jsonb).
   * 숫자면 보기 하나, 배열이면 여러 개 표기('모두 고르기' 문항 또는 중복 표기).
   */
  answers: Record<string, MarkValue>;
  /** 서술형 문항 점수 {문항번호: 점수} — 자동 채점 또는 채점자가 입력 */
  essayScores: Record<string, number>;
  /**
   * {문항번호: 점수 출처} — 'auto'(자동 채점, 다시 돌리면 바뀔 수 있다) 또는
   * 'teacher'(선생님이 매김, 자동 채점이 건드리지 않는다). 적혀 있지 않은 옛
   * 점수는 선생님이 매긴 것으로 본다.
   */
  essayScoreSources: Record<string, EssayGradeSource>;
  /** {문항번호: 전사된 주관식 답안} — 선생님이 고치면 고친 값이 남는다 */
  essayAnswers: Record<string, string>;
  /**
   * {문항번호: "unclear"} — 손글씨를 읽긴 했지만 확실하지 않아 사람이 봐야 하는 칸.
   * 자동 채점은 이 칸을 0점으로 넘기지 않는다. 선생님이 고치거나 점수를 매기면 지운다.
   */
  essayFlags: Record<string, EssayFlag>;
  /** {문항번호: 보관함 경로} — 주관식 칸을 펴서 잘라낸 이미지(전사 대조용) */
  essayCrops: Record<string, string>;
  reviewFlags: Array<Record<string, unknown>>;
  /** 판독 확신 정보 — 자동 검수 통과 판단용. 이전에 올린 답안지는 null. */
  readConfidence: ReadConfidence | null;
  status: ScanStatus;
  /**
   * 듣기 미응시 처리(토요모의고사) — 'absent' 안 봄(반 평균으로 산출), 'marked' 봤음
   * (마킹한 대로), null 은 아직 안 정함(듣기 문항이 거의 비어 있으면 안 본 것으로 본다)
   */
  listeningMode: ListeningMode | null;
  preferredSchedule?: string | null;
  /**
   * 반배치고사 '재원 구분' 칸 — '재원생' | '신규생' | null(비었거나 못 읽음 → 재원생으로 본다).
   * 신규생은 수험번호(출결번호)가 없어 student_id 칸에 전화번호 뒤 4자리가 들어 있다.
   */
  enrollment?: string | null;
  /**
   * 신규생을 학생 관리 프로그램에서 맞춘 뒤의 학생 열쇠(카드번호, 없으면 sc<학생ID>).
   * 성적표·반배정 요청은 이 열쇠로 학생을 가리킨다. 비어 있으면 student_id가 열쇠다(scanKey).
   */
  studentKey?: string | null;
  /** 'auto' = 시스템 자동 통과, 그 외에는 확인한 사용자 ID */
  reviewedBy: string | null;
  /**
   * 올린 사람(계정 ID). 여러 직원이 나눠 올릴 때 검수·채점 화면이 "내가 올린 답안지"
   * 범위로 좁히는 근거다. 이 기능 전에 올린 답안지는 null.
   */
  uploadedBy: string | null;
  /** 파일 내용의 해시(PDF는 쪽 번호까지). 같은 내용을 다시 올리면 이 행이 갱신된다. 옛 행은 null */
  contentHash: string | null;
  readError: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ScanRow {
  id: string;
  exam_id: string;
  filename: string;
  scan_path: string | null;
  preview_path: string | null;
  student_id: string | null;
  student_id_qr: string | null;
  student_id_bubbles: string | null;
  answers: Record<string, MarkValue> | null;
  essay_scores: Record<string, number> | null;
  essay_score_sources?: Record<string, unknown> | null;
  essay_answers: Record<string, string> | null;
  essay_flags?: Record<string, unknown> | null;
  essay_crops: Record<string, string> | null;
  review_flags: Array<Record<string, unknown>> | null;
  read_confidence: ReadConfidence | null;
  status: ScanStatus;
  reviewed_by: string | null;
  uploaded_by?: string | null;
  content_hash?: string | null;
  listening_mode?: string | null;
  preferred_schedule?: string | null;
  enrollment?: string | null;
  student_key?: string | null;
  read_error: string | null;
  created_at: string;
  updated_at: string;
}

const SELECT =
  "id,exam_id,filename,scan_path,preview_path,student_id,student_id_qr,student_id_bubbles,answers,essay_scores,essay_score_sources,essay_answers,essay_flags,essay_crops,review_flags,read_confidence,status,reviewed_by,uploaded_by,content_hash,listening_mode,preferred_schedule,enrollment,student_key,read_error,created_at,updated_at";

/** 저장된 판독 표시 중 아는 값만 */
function flagsOf(value: Record<string, unknown> | null | undefined): Record<string, EssayFlag> {
  const out: Record<string, EssayFlag> = {};
  for (const [key, flag] of Object.entries(value ?? {})) {
    if (flag === "unclear") out[key] = flag;
  }
  return out;
}

/** 저장된 출처 중 아는 값만 — 엉뚱한 값이 들어 있어도 화면이 죽지 않게 */
function sourcesOf(value: Record<string, unknown> | null | undefined): Record<string, EssayGradeSource> {
  const out: Record<string, EssayGradeSource> = {};
  for (const [key, source] of Object.entries(value ?? {})) {
    if (source === "auto" || source === "teacher") out[key] = source;
  }
  return out;
}

/**
 * 성적표·반배정이 학생을 가리키는 열쇠.
 *
 * 보통은 답안지에 마킹한 수험번호(출결번호)다. 반배치고사 신규생은 그 칸에 전화번호
 * 뒤 4자리를 쓰므로, 학생 관리 프로그램에서 맞춘 열쇠(studentKey)가 있으면 그것이다.
 */
export function scanKey(scan: { studentId: string | null; studentKey?: string | null }): string | null {
  return (scan.studentKey ?? "").trim() || scan.studentId;
}

function mapScan(row: ScanRow): OmrScan {
  return {
    id: row.id,
    examId: row.exam_id,
    filename: row.filename,
    scanPath: row.scan_path,
    previewPath: row.preview_path ?? null,
    studentId: row.student_id,
    preferredSchedule: row.preferred_schedule ?? null,
    enrollment: row.enrollment ?? null,
    studentKey: row.student_key ?? null,
    studentIdQr: row.student_id_qr,
    studentIdBubbles: row.student_id_bubbles,
    answers: row.answers ?? {},
    essayScores: row.essay_scores ?? {},
    essayScoreSources: sourcesOf(row.essay_score_sources),
    essayAnswers: row.essay_answers ?? {},
    essayFlags: flagsOf(row.essay_flags),
    essayCrops: row.essay_crops ?? {},
    reviewFlags: row.review_flags ?? [],
    readConfidence: row.read_confidence ?? null,
    status: row.status,
    reviewedBy: row.reviewed_by ?? null,
    uploadedBy: row.uploaded_by ?? null,
    contentHash: row.content_hash ?? null,
    listeningMode: row.listening_mode === "absent" || row.listening_mode === "marked" ? row.listening_mode : null,
    readError: row.read_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface UpsertScanInput {
  preferredSchedule?:string|null;
  enrollment?: string | null;
  examId: string;
  filename: string;
  /** 파일 내용 해시(PDF는 쪽 번호까지) — 같은 답안지를 가르는 열쇠 */
  contentHash: string;
  /** 올린 사람(계정 ID) */
  uploadedBy: string | null;
  scanPath?: string | null;
  previewPath?: string | null;
  studentId?: string | null;
  studentIdQr?: string | null;
  studentIdBubbles?: string | null;
  answers?: Record<string, MarkValue>;
  reviewFlags?: Array<Record<string, unknown>>;
  readConfidence?: ReadConfidence | null;
  essayCrops?: Record<string, string>;
  status?: ScanStatus;
  readError?: string | null;
}

/**
 * 판독 결과 저장. 같은 (시험, 내용 해시)이면 기존 행을 갱신한다 — 똑같은 파일을
 * 다시 올린 경우다. 이름만 같은 다른 파일은 새 행이 된다(여러 직원의 스캐너가
 * 같은 기본 파일명을 붙여도 서로 덮어쓰지 않는다).
 */
export async function upsertScans(inputs: UpsertScanInput[]): Promise<OmrScan[]> {
  if (inputs.length === 0) return [];
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("omr_scans")
    .upsert(
      inputs.map((input) => ({
        exam_id: input.examId,
        filename: input.filename,
        content_hash: input.contentHash,
        uploaded_by: input.uploadedBy,
        scan_path: input.scanPath ?? null,
        preview_path: input.previewPath ?? null,
        student_id: input.studentId ?? null,
        preferred_schedule: input.preferredSchedule ?? null,
        enrollment: input.enrollment ?? null,
        student_id_qr: input.studentIdQr ?? null,
        student_id_bubbles: input.studentIdBubbles ?? null,
        answers: input.answers ?? {},
        review_flags: input.reviewFlags ?? [],
        read_confidence: input.readConfidence ?? null,
        essay_crops: input.essayCrops ?? {},
        status: input.status ?? "pending",
        read_error: input.readError ?? null,
      })),
      { onConflict: "exam_id,content_hash" },
    )
    .select(SELECT);
  if (error) throw new Error(`판독 결과 저장 실패 — ${describeDbError(error.message)}`);
  return (data as ScanRow[]).map(mapScan);
}

export async function listScans(examId: string): Promise<OmrScan[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("omr_scans")
    .select(SELECT)
    .eq("exam_id", examId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`판독 목록을 불러오지 못했습니다 — ${describeDbError(error.message)}`);
  return (data as ScanRow[]).map(mapScan);
}

export async function getScan(id: string): Promise<OmrScan | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("omr_scans").select(SELECT).eq("id", id).maybeSingle();
  if (error) throw new Error(`판독 결과를 불러오지 못했습니다 — ${describeDbError(error.message)}`);
  return data ? mapScan(data as ScanRow) : null;
}

export interface UpdateScanInput {
  preferredSchedule?:string|null;
  enrollment?: string | null;
  studentKey?: string | null;
  /** 판독 플래그 전체를 갈아 끼운다 — 선호 요일·재원 구분만 다시 읽을 때 쓴다 */
  reviewFlags?: Array<Record<string, unknown>>;
  studentId?: string | null;
  answers?: Record<string, MarkValue>;
  essayScores?: Record<string, number>;
  essayScoreSources?: Record<string, EssayGradeSource>;
  essayAnswers?: Record<string, string>;
  essayFlags?: Record<string, EssayFlag>;
  /** 손글씨 칸 이미지 경로 — 보관된 원본에서 다시 만들었을 때만 바꾼다 */
  essayCrops?: Record<string, string>;
  /** 검수 미리보기 경로 — 보관된 원본에서 다시 만들었을 때만 바꾼다 */
  previewPath?: string | null;
  status?: ScanStatus;
  reviewedBy?: string | null;
  listeningMode?: ListeningMode | null;
  readError?: string | null;
}

/** 검수 결과 반영(수험번호·답안 수정, 확인 처리). */
export async function updateScan(id: string, input: UpdateScanInput): Promise<OmrScan> {
  const supabase = getSupabaseAdmin();
  const patch: Record<string, unknown> = {};
  if (input.studentId !== undefined) patch.student_id = input.studentId;
  if (input.preferredSchedule !== undefined) patch.preferred_schedule = input.preferredSchedule;
  if (input.enrollment !== undefined) patch.enrollment = input.enrollment;
  if (input.studentKey !== undefined) patch.student_key = input.studentKey;
  if (input.reviewFlags !== undefined) patch.review_flags = input.reviewFlags;
  if (input.answers !== undefined) patch.answers = input.answers;
  if (input.essayScores !== undefined) patch.essay_scores = input.essayScores;
  if (input.essayScoreSources !== undefined) patch.essay_score_sources = input.essayScoreSources;
  if (input.essayAnswers !== undefined) patch.essay_answers = input.essayAnswers;
  if (input.essayFlags !== undefined) patch.essay_flags = input.essayFlags;
  if (input.essayCrops !== undefined) patch.essay_crops = input.essayCrops;
  if (input.previewPath !== undefined) patch.preview_path = input.previewPath;
  if (input.status !== undefined) patch.status = input.status;
  if (input.reviewedBy !== undefined) patch.reviewed_by = input.reviewedBy;
  if (input.listeningMode !== undefined) patch.listening_mode = input.listeningMode;
  if (input.readError !== undefined) patch.read_error = input.readError;
  // 사람이 검수해 확인했으면 판독 단계의 경고는 더 이상 표시하지 않는다.
  if (input.status === "reviewed" && input.readError === undefined) patch.read_error = null;

  const { data, error } = await supabase
    .from("omr_scans")
    .update(patch)
    .eq("id", id)
    .select(SELECT)
    .single();
  if (error || !data) {
    throw new Error(`검수 저장 실패 — ${describeDbError(error?.message ?? "알 수 없는 오류")}`);
  }
  return mapScan(data as ScanRow);
}

/** 주관식 칸의 전사·점수·출처·표시를 한 번에 고치는 조각. 적지 않은 열은 그대로다. */
export interface EssayPatch {
  answers?: Record<string, string>;
  flags?: Record<string, EssayFlag | null>;
  scores?: Record<string, number | null>;
  sources?: Record<string, EssayGradeSource | null>;
}

/**
 * 주관식 열을 **방금 읽은 행 위에** 합쳐 저장한다.
 *
 * 전사는 몇 분씩 걸린다. 시작할 때 읽어 둔 행 위에 결과를 얹어 저장하면, 그 사이
 * 다른 사람이 같은 학생의 전사를 고치거나 점수를 매긴 것이 지워진다. 그래서 저장
 * 직전에 행을 다시 읽고 문항 단위로 합친다. null 은 그 문항의 값을 지운다.
 */
export async function patchScanEssay(id: string, patch: EssayPatch): Promise<OmrScan | null> {
  const fresh = await getScan(id);
  if (!fresh) return null;
  const merge = <V,>(current: Record<string, V>, changes: Record<string, V | null> | undefined) => {
    if (!changes) return undefined;
    const next: Record<string, V> = { ...current };
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) delete next[key];
      else next[key] = value;
    }
    return next;
  };
  return updateScan(id, {
    essayAnswers: merge(fresh.essayAnswers, patch.answers),
    essayFlags: merge(fresh.essayFlags, patch.flags),
    essayScores: merge(fresh.essayScores, patch.scores),
    essayScoreSources: merge(fresh.essayScoreSources, patch.sources),
  });
}

export async function deleteScan(id: string): Promise<void> {
  const scan = await getScan(id);
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("omr_scans").delete().eq("id", id);
  if (error) throw new Error(`판독 결과 삭제 실패: ${error.message}`);
  // 원본·미리보기·주관식 크롭도 함께 정리(실패해도 삭제 자체는 성공으로 둔다)
  const paths = [
    scan?.scanPath,
    scan?.previewPath,
    ...Object.values(scan?.essayCrops ?? {}),
  ].filter((p): p is string => Boolean(p));
  if (paths.length > 0) {
    await supabase.storage.from(SCAN_BUCKET).remove(paths).catch(() => undefined);
  }
}

/**
 * 스캔 원본을 Storage에 저장하고 경로를 돌려준다.
 * 버킷이 없거나 업로드가 실패해도 판독은 계속되어야 하므로 null을 반환한다.
 * tag 는 내용 해시 꼬리표 — 같은 이름의 다른 파일이 서로 덮어쓰지 않게 한다.
 */
export async function uploadScanFile(
  examId: string,
  filename: string,
  bytes: ArrayBuffer,
  contentType: string,
  tag: string,
): Promise<string | null> {
  const path = scanOriginalPath(examId, filename, tag);
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.storage
      .from(SCAN_BUCKET)
      .upload(path, Buffer.from(bytes), { contentType, upsert: true });
    if (error) {
      console.warn(`스캔 원본 저장 실패(${filename}): ${error.message}`);
      return null;
    }
    return path;
  } catch (error) {
    console.warn(`스캔 원본 저장 실패(${filename})`, error);
    return null;
  }
}

/**
 * 검수용 미리보기를 보관한다. 파일명이 겹치지 않도록 previews/ 아래에 둔다.
 * 실패해도 판독 자체는 성공으로 두므로 null을 반환한다.
 */
export async function uploadScanPreview(
  examId: string,
  filename: string,
  bytes: Uint8Array,
  tag: string,
): Promise<string | null> {
  const path = scanPreviewPath(examId, filename, tag);
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.storage
      .from(SCAN_BUCKET)
      .upload(path, Buffer.from(bytes), { contentType: "image/jpeg", upsert: true });
    if (error) {
      console.warn(`미리보기 저장 실패(${filename}): ${error.message}`);
      return null;
    }
    return path;
  } catch (error) {
    console.warn(`미리보기 저장 실패(${filename})`, error);
    return null;
  }
}

/**
 * 주관식 칸 이미지를 보관한다. 문항마다 한 장이므로 경로에 문항번호를 넣는다.
 * 실패해도 판독 자체는 성공으로 두므로 null을 반환한다.
 */
export async function uploadEssayCrop(
  examId: string,
  filename: string,
  questionNo: number,
  bytes: Uint8Array,
  tag: string,
): Promise<string | null> {
  const path = essayCropPath(examId, filename, questionNo, tag);
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.storage
      .from(SCAN_BUCKET)
      .upload(path, Buffer.from(bytes), { contentType: "image/jpeg", upsert: true });
    if (error) {
      console.warn(`주관식 이미지 저장 실패(${filename} ${questionNo}번): ${error.message}`);
      return null;
    }
    return path;
  } catch (error) {
    console.warn(`주관식 이미지 저장 실패(${filename} ${questionNo}번)`, error);
    return null;
  }
}

/** 보관된 주관식 칸 이미지를 서버로 내려받는다(전사 요청용). */
export async function downloadEssayCrop(path: string): Promise<Buffer | null> {
  return downloadScanFile(path);
}

/** 검수 화면에서 이미지를 띄우기 위한 임시 열람 주소(기본 10분) */
export async function createSignedViewUrl(
  path: string,
  expiresInSeconds = 600,
): Promise<string | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.storage
      .from(SCAN_BUCKET)
      .createSignedUrl(path, expiresInSeconds);
    if (error || !data) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

/**
 * 브라우저가 Storage로 직접 올릴 수 있는 서명 URL을 발급한다.
 * Vercel 서버리스 함수의 요청 본문 제한(4.5MB)을 우회하기 위한 경로다.
 */
export async function createSignedScanUpload(
  examId: string,
  filename: string,
): Promise<{ path: string; signedUrl: string; token: string } | null> {
  // 내용을 아직 모르므로 무작위 꼬리표로 경로를 유일하게 한다 — 같은 이름의 파일을
  // 다른 사람이 동시에 올려도 보관함에서 서로를 덮어쓰지 않는다.
  const path = scanOriginalPath(examId, filename, randomTag());
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.storage
      .from(SCAN_BUCKET)
      .createSignedUploadUrl(path, { upsert: true });
    if (error || !data) {
      console.warn(`서명 업로드 URL 발급 실패(${filename}): ${error?.message}`);
      return null;
    }
    return { path, signedUrl: data.signedUrl, token: data.token };
  } catch (error) {
    console.warn(`서명 업로드 URL 발급 실패(${filename})`, error);
    return null;
  }
}

/** Storage에 올라간 스캔 원본을 서버로 내려받는다(판독 전달용). */
export async function downloadScanFile(path: string): Promise<Buffer | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.storage.from(SCAN_BUCKET).download(path);
    if (error || !data) {
      console.warn(`스캔 원본 다운로드 실패(${path}): ${error?.message}`);
      return null;
    }
    return Buffer.from(await data.arrayBuffer());
  } catch (error) {
    console.warn(`스캔 원본 다운로드 실패(${path})`, error);
    return null;
  }
}

/** 보관 기간(일) 지난 스캔 원본 정리용 — Phase D 크론에서 사용. */
export const SCAN_RETENTION_DAYS = 7;
