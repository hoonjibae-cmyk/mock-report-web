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

/** 보관함이 받아 주는 글자만 남긴 파일명 */
export function safeFilename(name: string): string {
  return String(name ?? "").replace(/[^\w가-힣.-]+/g, "_");
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
