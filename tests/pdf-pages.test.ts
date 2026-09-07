/**
 * 여러 장이 든 PDF 경고 테스트.
 *
 * 실행: npm test
 *
 * 여기서 틀리면 두 가지로 나쁘다. 못 잡으면 60쪽짜리를 통과시켜 놓고 5분 뒤에
 * 실패를 보게 되고(올린 것은 전부 사라진다), 과하게 잡으면 멀쩡한 30쪽짜리마다
 * 경고가 떠서 아무도 안 읽게 된다.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  PDF_PAGE_LIMIT,
  PDF_SIZE_LIMIT,
  countPdfPages,
  pdfSplitWarning,
  type PickedPdf,
} from "../lib/pdf-pages";

/** 쪽 수만 맞춘 가짜 PDF 바이트 */
function fakePdf(pages: number, { compressed = false } = {}): Uint8Array {
  const body = compressed
    ? "%PDF-1.7\n<</Type/ObjStm/N 12>>stream\n\nendstream"
    : `%PDF-1.4\n1 0 obj<</Type /Pages /Kids[] /Count ${pages}>>endobj\n` +
      Array.from(
        { length: pages },
        (_, i) => `${i + 2} 0 obj<</Type /Page /Parent 1 0 R>>endobj\n`,
      ).join("");
  return new TextEncoder().encode(body);
}

function pdf(over: Partial<PickedPdf> = {}): PickedPdf {
  return { name: "scan.pdf", size: 5 * 1024 * 1024, pages: 10, ...over };
}

test("쪽수를 센다 — 쪽을 묶는 마디(/Pages)는 빼고", () => {
  assert.equal(countPdfPages(fakePdf(1)), 1);
  assert.equal(countPdfPages(fakePdf(30)), 30);
  assert.equal(countPdfPages(fakePdf(60)), 60);
});

test("셀 수 없으면 0이 아니라 '모름'을 답한다", () => {
  // 이것이 이 함수의 핵심이다. 모르면서 0쪽이라고 하면, 60쪽짜리를
  // 안전하다고 통과시켜 놓고 5분 뒤에 실패를 보게 된다.
  assert.equal(countPdfPages(fakePdf(0, { compressed: true })), null);
  assert.equal(countPdfPages(new TextEncoder().encode("")), null);
  assert.equal(countPdfPages(new TextEncoder().encode("%PDF-1.7\n쪽 표시 없음")), null);
});

test("큰 파일도 끝까지 훑는다", () => {
  // 바이트를 글자로 옮길 때 한 번에 넘기면 인자 수 한계에 걸려 터진다.
  // 쪽 표시가 파일 뒤쪽에 몰려 있는 PDF에서 이 문제가 드러난다.
  const filler = new TextEncoder().encode("A".repeat(400_000));
  const tail = fakePdf(40);
  const big = new Uint8Array(filler.length + tail.length);
  big.set(filler, 0);
  big.set(tail, filler.length);
  assert.equal(countPdfPages(big), 40);
});

test("한계를 넘는 PDF만 경고한다", () => {
  assert.equal(pdfSplitWarning([]), null);
  assert.equal(pdfSplitWarning([pdf({ pages: 1 })]), null);
  assert.equal(
    pdfSplitWarning([pdf({ pages: PDF_PAGE_LIMIT })]),
    null,
    "딱 한계까지는 통과시켜야 한다 — 여기서 과하면 아무도 경고를 안 읽는다",
  );

  const warned = pdfSplitWarning([pdf({ name: "3반.pdf", pages: PDF_PAGE_LIMIT + 1 })]);
  assert.match(warned ?? "", /3반\.pdf/, "어느 파일인지 말해야 한다");
  assert.match(warned ?? "", /31쪽/, "몇 쪽인지 말해야 한다");
  assert.match(warned ?? "", /JPG|끊어/, "무엇을 하라는 것인지 말해야 한다");
});

test("여러 개가 걸리면 가장 큰 것을 앞세우고 나머지 개수를 밝힌다", () => {
  const warned = pdfSplitWarning([
    pdf({ name: "a.pdf", pages: 45 }),
    pdf({ name: "b.pdf", pages: 80 }),
    pdf({ name: "c.pdf", pages: 5 }),
  ]);
  assert.match(warned ?? "", /b\.pdf/);
  assert.match(warned ?? "", /80쪽/);
  assert.match(warned ?? "", /외 1개/, "나머지도 손봐야 한다는 것을 알려야 한다");
});

test("쪽수를 모르면 크기로 판단한다", () => {
  // 크기만으로는 확신할 수 없으므로 문장도 단정하지 않아야 한다.
  assert.equal(
    pdfSplitWarning([pdf({ pages: null, size: PDF_SIZE_LIMIT })]),
    null,
    "한계 이하는 통과",
  );
  const warned = pdfSplitWarning([
    pdf({ name: "묶음.pdf", pages: null, size: PDF_SIZE_LIMIT + 1 }),
  ]);
  assert.match(warned ?? "", /묶음\.pdf/);
  assert.match(warned ?? "", /확인하지 못했습니다/, "모른다는 것을 밝혀야 한다");
  assert.match(warned ?? "", /수 있습니다/, "단정하면 안 된다");
});

test("쪽수를 셌으면 크기는 보지 않는다", () => {
  // 300dpi로 곱게 뜬 20쪽짜리는 20MB를 넘을 수 있다. 쪽수를 아는데도
  // 크기로 겁을 주면, 나눌 필요 없는 것을 나누게 만든다.
  assert.equal(
    pdfSplitWarning([pdf({ pages: 20, size: PDF_SIZE_LIMIT * 3 })]),
    null,
  );
});
