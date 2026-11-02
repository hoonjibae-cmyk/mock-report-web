/**
 * 답안지 파일의 정체 — 같은 이름의 다른 파일이 서로를 덮어쓰지 않는가.
 *
 * 실행: npm test
 *
 * 스캐너는 사람이 달라도 같은 파일명(Scan0001.pdf)을 붙인다. 여기서 틀리면 다른
 * 직원이 올린 답안지가 내 답안지 행과 이미지를 덮어쓴다 — 서술형이 빈칸으로
 * 읽히던 사고의 원인이다.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  contentHashOf,
  essayCropPath,
  hashTag,
  pageHash,
  randomTag,
  safeFilename,
  scanOriginalPath,
  scanPreviewPath,
} from "../lib/scan-identity";

test("내용 해시 — 같은 내용은 같고, 한 바이트라도 다르면 다르다", () => {
  const a = contentHashOf(new TextEncoder().encode("answer sheet A"));
  const b = contentHashOf(new TextEncoder().encode("answer sheet B"));
  assert.equal(a, contentHashOf(new TextEncoder().encode("answer sheet A")));
  assert.notEqual(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
  // ArrayBuffer 로 줘도 같다(브라우저 File.arrayBuffer 결과)
  assert.equal(contentHashOf(new TextEncoder().encode("answer sheet A").buffer), a);
});

test("PDF 쪽 결과는 파일 해시에 쪽 번호가 붙어 쪽마다 다르다", () => {
  assert.equal(pageHash("abc", "scan.pdf#p3"), "abc:p3");
  assert.equal(pageHash("abc", "scan.pdf#p12"), "abc:p12");
  assert.equal(pageHash("abc", "scan.jpg"), "abc");
  assert.notEqual(pageHash("abc", "scan.pdf#p1"), pageHash("abc", "scan.pdf#p2"));
});

test("꼬리표 — 해시 앞 10자리, 해시가 없으면 무작위", () => {
  const hash = "0123456789abcdef".repeat(4);
  assert.equal(hashTag(hash), "0123456789");
  assert.equal(hashTag(`${hash}:p3`), "0123456789");
  assert.match(hashTag(null), /^[0-9a-f]{10}$/);
  assert.notEqual(randomTag(), randomTag());
});

test("보관함 경로 — 같은 파일명이라도 꼬리표가 다르면 다른 경로", () => {
  const a = scanOriginalPath("e1", "Scan0001.pdf", "aaaaaaaaaa");
  const b = scanOriginalPath("e1", "Scan0001.pdf", "bbbbbbbbbb");
  assert.notEqual(a, b);
  assert.equal(a, "e1/aaaaaaaaaa_Scan0001.pdf");
  assert.equal(scanPreviewPath("e1", "scan.pdf#p3", "aaaaaaaaaa"), "e1/previews/aaaaaaaaaa_scan.pdf_p3.jpg");
  assert.equal(essayCropPath("e1", "scan.pdf#p3", 26, "aaaaaaaaaa"), "e1/essays/aaaaaaaaaa_scan.pdf_p3__q26.jpg");
});

test("파일명은 보관함이 받는 글자만 남긴다", () => {
  assert.equal(safeFilename("답안지 (1).jpg"), "답안지_1_.jpg");
  assert.equal(safeFilename("a/b\\c.png"), "a_b_c.png");
});
