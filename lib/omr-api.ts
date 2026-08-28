// Python OMR API(무상태) 클라이언트.
// 환경변수: OMR_API_URL(예: https://omr-api-xxxx.onrender.com), OMR_API_KEY

import type { OmrSheetSpec } from "@/lib/omr-types";

/** 설정 누락은 사용자가 직접 고칠 수 있으므로, 코드 오류와 구분해 안내한다. */
export class OmrApiNotConfiguredError extends Error {
  constructor() {
    super(
      "OMR 판독 서비스 주소(OMR_API_URL)가 이 배포 환경에 설정되어 있지 않습니다. " +
        "Vercel → Settings → Environment Variables 에서 OMR_API_URL(그리고 OMR_API_KEY)을 " +
        "Production · Preview · Development 세 곳 모두에 추가한 뒤 다시 배포해 주세요.",
    );
    this.name = "OmrApiNotConfiguredError";
  }
}

function apiBase(): string {
  const url = process.env.OMR_API_URL;
  if (!url) throw new OmrApiNotConfiguredError();
  return url.replace(/\/$/, "");
}

function apiHeaders(json = true): Record<string, string> {
  const headers: Record<string, string> = {};
  if (json) headers["Content-Type"] = "application/json";
  const key = process.env.OMR_API_KEY;
  if (key) headers["X-API-Key"] = key;
  return headers;
}

export interface GenerateSheetResult {
  template: unknown;
  pdf_base64: string;
  filename: string;
  preview_png_base64?: string;
}

export async function generateSheet(spec: OmrSheetSpec): Promise<GenerateSheetResult> {
  const res = await fetch(`${apiBase()}/generate`, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify(spec),
  });
  if (!res.ok) {
    throw new Error(`OMR 답안지 생성 실패 (${res.status}): ${await res.text().catch(() => "")}`);
  }
  return (await res.json()) as GenerateSheetResult;
}

export interface ReadResultRow {
  filename: string;
  student_id: string | null;
  student_id_qr: string | null;
  student_id_bubbles: string | null;
  exam_id: string | null;
  /** 답안지 QR에 새겨진 레이아웃 지문(구형 답안지는 null) */
  sheet_layout?: string | null;
  /** 이번 판독에 사용한 시험 설정의 레이아웃 지문 */
  expected_layout?: string | null;
  /** 단일 선택 기준 판독값(중복 표기는 null) */
  answers: Record<string, number | null>;
  /** 칠해진 보기 전부 — '모두 고르기' 문항 채점에 쓴다(구버전 API는 없음) */
  selections?: Record<string, number[]>;
  review_flags: Array<Record<string, unknown>>;
}

export interface ReadScansResult {
  results: ReadResultRow[];
  problems: Array<{ filename: string; error: string }>;
}

// 스캔 이미지 판독. spec(시트 설정)만 넘기면 서버가 템플릿을 재생성한다.
export async function readScans(spec: OmrSheetSpec, files: File[]): Promise<ReadScansResult> {
  const form = new FormData();
  form.append("spec", JSON.stringify(spec));
  for (const file of files) form.append("files", file, file.name);
  const res = await fetch(`${apiBase()}/read`, {
    method: "POST",
    headers: apiHeaders(false),
    body: form,
  });
  if (!res.ok) {
    throw new Error(`OMR 판독 실패 (${res.status}): ${await res.text().catch(() => "")}`);
  }
  return (await res.json()) as ReadScansResult;
}
