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
  isStorageKeySafe,
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

test("파일명은 보관함이 받는 글자(영문·숫자·._-)만 남긴다 — 한글은 보관함이 거부한다", () => {
  assert.equal(safeFilename("답안지 (1).jpg"), "_1_.jpg");
  assert.equal(safeFilename("a/b\\c.png"), "a_b_c.png");
  assert.equal(safeFilename("권세빈.pdf#p1"), "_.pdf_p1");
  assert.equal(safeFilename("Café résumé.jpg"), "Cafe_resume.jpg");
  assert.equal(safeFilename(""), "scan");
  // 너무 긴 이름은 확장자 쪽을 남긴다
  const long = safeFilename(`${"a".repeat(200)}.pdf`);
  assert.equal(long.length, 80);
  assert.ok(long.endsWith(".pdf"));
});

test("보관함 규칙 — 한글이 든 경로는 거부되고, 만드는 경로는 모두 통과한다", () => {
  // 이 규칙 때문에 한글 이름의 스캔은 원본·미리보기·손글씨 칸 이미지가 저장되지 않았다
  assert.ok(!isStorageKeySafe("e1/abc_권세빈.pdf"));
  assert.ok(isStorageKeySafe("e1/abc_scan.pdf"));
  const names = [
    "권세빈.pdf",
    "권세빈.pdf#p1",
    "스캔 2026. 11. 3. 오후 5:40.pdf#p12",
    "예비중3_반배치고사(신규).jpg",
    "Café résumé.jpg",
    "😀.png",
    "",
  ];
  const tag = "0123456789";
  for (const name of names) {
    for (const path of [
      scanOriginalPath("3f2a9c1e-0000-4000-8000-000000000001", name, tag),
      scanPreviewPath("3f2a9c1e-0000-4000-8000-000000000001", name, tag),
      essayCropPath("3f2a9c1e-0000-4000-8000-000000000001", name, 26, tag),
    ]) {
      assert.ok(isStorageKeySafe(path), `보관함이 거부할 경로: ${path}`);
    }
  }
});
