// OMR 스캔 판독 결과(omr_scans) 저장소 — Supabase service-role 경유

import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const SCAN_BUCKET = "omr-scans";

export type ScanStatus = "pending" | "reviewed";

export interface OmrScan {
  id: string;
  examId: string;
  filename: string;
  scanPath: string | null;
  studentId: string | null;
  studentIdQr: string | null;
  studentIdBubbles: string | null;
  /** {문항번호: 보기번호 | null} — 키는 문자열(jsonb) */
  answers: Record<string, number | null>;
  /** 서술형 문항 점수 {문항번호: 점수} — 채점자가 입력 */
  essayScores: Record<string, number>;
  reviewFlags: Array<Record<string, unknown>>;
  status: ScanStatus;
  readError: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ScanRow {
  id: string;
  exam_id: string;
  filename: string;
  scan_path: string | null;
  student_id: string | null;
  student_id_qr: string | null;
  student_id_bubbles: string | null;
  answers: Record<string, number | null> | null;
  essay_scores: Record<string, number> | null;
  review_flags: Array<Record<string, unknown>> | null;
  status: ScanStatus;
  read_error: string | null;
  created_at: string;
  updated_at: string;
}

const SELECT =
  "id,exam_id,filename,scan_path,student_id,student_id_qr,student_id_bubbles,answers,essay_scores,review_flags,status,read_error,created_at,updated_at";

function mapScan(row: ScanRow): OmrScan {
  return {
    id: row.id,
    examId: row.exam_id,
    filename: row.filename,
    scanPath: row.scan_path,
    studentId: row.student_id,
    studentIdQr: row.student_id_qr,
    studentIdBubbles: row.student_id_bubbles,
    answers: row.answers ?? {},
    essayScores: row.essay_scores ?? {},
    reviewFlags: row.review_flags ?? [],
    status: row.status,
    readError: row.read_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface UpsertScanInput {
  examId: string;
  filename: string;
  scanPath?: string | null;
  studentId?: string | null;
  studentIdQr?: string | null;
  studentIdBubbles?: string | null;
  answers?: Record<string, number | null>;
  reviewFlags?: Array<Record<string, unknown>>;
  status?: ScanStatus;
  readError?: string | null;
}

/** 판독 결과 저장. 같은 (시험, 파일명)이면 기존 행을 덮어쓴다(재업로드 대응). */
export async function upsertScans(inputs: UpsertScanInput[]): Promise<OmrScan[]> {
  if (inputs.length === 0) return [];
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("omr_scans")
    .upsert(
      inputs.map((input) => ({
        exam_id: input.examId,
        filename: input.filename,
        scan_path: input.scanPath ?? null,
        student_id: input.studentId ?? null,
        student_id_qr: input.studentIdQr ?? null,
        student_id_bubbles: input.studentIdBubbles ?? null,
        answers: input.answers ?? {},
        review_flags: input.reviewFlags ?? [],
        status: input.status ?? "pending",
        read_error: input.readError ?? null,
      })),
      { onConflict: "exam_id,filename" },
    )
    .select(SELECT);
  if (error) throw new Error(`판독 결과 저장 실패: ${error.message}`);
  return (data as ScanRow[]).map(mapScan);
}

export async function listScans(examId: string): Promise<OmrScan[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("omr_scans")
    .select(SELECT)
    .eq("exam_id", examId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`판독 목록을 불러오지 못했습니다: ${error.message}`);
  return (data as ScanRow[]).map(mapScan);
}

export async function getScan(id: string): Promise<OmrScan | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("omr_scans").select(SELECT).eq("id", id).maybeSingle();
  if (error) throw new Error(`판독 결과를 불러오지 못했습니다: ${error.message}`);
  return data ? mapScan(data as ScanRow) : null;
}

export interface UpdateScanInput {
  studentId?: string | null;
  answers?: Record<string, number | null>;
  essayScores?: Record<string, number>;
  status?: ScanStatus;
}

/** 검수 결과 반영(수험번호·답안 수정, 확인 처리). */
export async function updateScan(id: string, input: UpdateScanInput): Promise<OmrScan> {
  const supabase = getSupabaseAdmin();
  const patch: Record<string, unknown> = {};
  if (input.studentId !== undefined) patch.student_id = input.studentId;
  if (input.answers !== undefined) patch.answers = input.answers;
  if (input.essayScores !== undefined) patch.essay_scores = input.essayScores;
  if (input.status !== undefined) patch.status = input.status;

  const { data, error } = await supabase
    .from("omr_scans")
    .update(patch)
    .eq("id", id)
    .select(SELECT)
    .single();
  if (error || !data) throw new Error(`검수 저장 실패: ${error?.message ?? "알 수 없는 오류"}`);
  return mapScan(data as ScanRow);
}

export async function deleteScan(id: string): Promise<void> {
  const scan = await getScan(id);
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("omr_scans").delete().eq("id", id);
  if (error) throw new Error(`판독 결과 삭제 실패: ${error.message}`);
  if (scan?.scanPath) {
    // 원본 파일도 함께 정리(실패해도 삭제 자체는 성공으로 둔다)
    await supabase.storage.from(SCAN_BUCKET).remove([scan.scanPath]).catch(() => undefined);
  }
}

/**
 * 스캔 원본을 Storage에 저장하고 경로를 돌려준다.
 * 버킷이 없거나 업로드가 실패해도 판독은 계속되어야 하므로 null을 반환한다.
 */
export async function uploadScanFile(
  examId: string,
  filename: string,
  bytes: ArrayBuffer,
  contentType: string,
): Promise<string | null> {
  const safe = filename.replace(/[^\w가-힣.-]+/g, "_");
  const path = `${examId}/${safe}`;
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
 * 브라우저가 Storage로 직접 올릴 수 있는 서명 URL을 발급한다.
 * Vercel 서버리스 함수의 요청 본문 제한(4.5MB)을 우회하기 위한 경로다.
 */
export async function createSignedScanUpload(
  examId: string,
  filename: string,
): Promise<{ path: string; signedUrl: string; token: string } | null> {
  const safe = filename.replace(/[^\w가-힣.-]+/g, "_");
  const path = `${examId}/${safe}`;
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
