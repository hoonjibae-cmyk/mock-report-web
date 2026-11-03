/**
 * 답안지 파일의 정체 — 무엇으로 "같은 답안지"를 가르고, 보관함 경로를 어떻게 짓는가.
 *
 * 예전에는 파일명이 열쇠였다. 스캐너는 사람이 달라도 같은 이름(Scan0001.pdf,
 * img001.jpg)을 붙이므로, 여러 직원이 나눠 올리면 서로의 답안지를 덮어썼다.
 * 지금은 **내용의 해시**가 열쇠다. 똑같은 파일을 다시 올리면 같은 행이 갱신되고,
 * 이름만 같은 다른 파일은 다른 답안지로 들어간다. 보관함 경로에도 해시 앞자리를
 * 붙여, 같은 이름의 원본·미리보기·손글씨 칸 이미지가 서로를 덮지 않게 한다.
 */
import { createHash, randomBytes } from "node:crypto";

/** 파일 내용의 SHA-256(16진수) */
export function contentHashOf(bytes: Uint8Array | ArrayBuffer): string {
  const view = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  return createHash("sha256").update(view).digest("hex");
}

/**
 * 판독 결과 한 줄의 해시. PDF 한 파일은 쪽마다 답안지 한 장이 되어
 * "스캔.pdf#p3"처럼 돌아오므로, 파일 해시 뒤에 쪽 번호를 붙여 쪽마다 다르게 한다.
 */
export function pageHash(fileHash: string, resultFilename: string): string {
  const page = resultFilename.match(/#p(\d+)$/);
  return page ? `${fileHash}:p${page[1]}` : fileHash;
}

/** 보관함 경로에 붙이는 짧은 꼬리표 — 해시 앞 10자리. 해시가 없으면 무작위 */
export function hashTag(hash: string | null | undefined): string {
  const clean = String(hash ?? "").replace(/[^0-9a-f]/gi, "").toLowerCase();
  return clean.length >= 10 ? clean.slice(0, 10) : randomTag();
}

/** 브라우저가 직접 올리는 큰 파일처럼 내용을 아직 모를 때 쓰는 꼬리표 */
export function randomTag(): string {
  return randomBytes(5).toString("hex");
}

/**
 * 보관함 경로에 쓰는 파일명 — 영문·숫자·`._-`만 남긴다.
 *
 * Supabase 보관함은 경로에 한글 같은 비ASCII 글자가 있으면 "Invalid key"로 거부한다.
 * 예전에는 한글을 그대로 남겨, 한글 이름의 스캔(신규생을 한 장씩 학생 이름으로 저장한
 * 것 등)은 원본·미리보기·손글씨 칸 이미지가 하나도 저장되지 않았다. 판독은 파일을
 * 직접 받으므로 되었고, 그래서 이미지만 조용히 빠졌다. 경로가 겹치지 않는 것은 앞에
 * 붙는 내용 해시 꼬리표가 보장하므로, 이름은 알아볼 수 있는 만큼만 남으면 된다.
 */
export function safeFilename(name: string): string {
  const ascii = String(name ?? "")
    .normalize("NFKD") // 'é' → 'e' + 결합 부호
    .replace(/[̀-ͯ]/g, "") // 결합 부호를 지워 'e'만 남긴다
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_");
  // 너무 길면 확장자가 있는 뒤쪽을 남긴다
  return (ascii.length > 80 ? ascii.slice(-80) : ascii) || "scan";
}

/**
 * Supabase 보관함이 받아 주는 경로인가 — 보관함 서버의 규칙(isValidKey)을 그대로 옮겼다.
 * 정규식의 \w 는 u 플래그가 없어 ASCII 영숫자만 뜻한다. 경로를 만드는 함수가 모두 이
 * 규칙을 지키는지 테스트가 확인한다.
 */
export function isStorageKeySafe(key: string): boolean {
  return key.length > 0 && /^(\w|\/|!|-|\.|\*|'|\(|\)| |&|\$|@|=|;|:|\+|,|\?)*$/.test(key);
}

/** 원본 스캔 */
export function scanOriginalPath(examId: string, filename: string, tag: string): string {
  return `${examId}/${tag}_${safeFilename(filename)}`;
}

/** 검수 화면 미리보기 */
export function scanPreviewPath(examId: string, filename: string, tag: string): string {
  return `${examId}/previews/${tag}_${safeFilename(filename)}.jpg`;
}

/** 주관식 답안 칸 이미지 — 문항마다 한 장 */
export function essayCropPath(examId: string, filename: string, questionNo: number, tag: string): string {
  return `${examId}/essays/${tag}_${safeFilename(filename)}__q${questionNo}.jpg`;
}
