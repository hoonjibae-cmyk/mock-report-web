/**
 * A4 쪽 나누기 — 덩어리를 순서대로 담고, 안 들어가면 다음 쪽.
 *
 * 실행: npm test
 */
import assert from "node:assert/strict";
import test from "node:test";

import { estimateLines, estimateTextHeight, packA4Pages, textWidthUnits } from "../lib/a4-layout";

const keys = (pages: Array<Array<{ key: string }>>) => pages.map((page) => page.map((block) => block.key));

test("순서대로 담고, 다음 덩어리가 안 들어가면 새 쪽을 연다", () => {
  const blocks = [
    { key: "a", height: 100 },
    { key: "b", height: 100 },
    { key: "c", height: 60 },
    { key: "d", height: 10 },
  ];
  // 100 + 4 + 100 + 4 + 60 = 268 → 딱 들어간다. d 는 다음 쪽
  assert.deepEqual(keys(packA4Pages(blocks, 268, 4)), [["a", "b", "c"], ["d"]]);
  // 용량이 1mm 모자라면 c 부터 다음 쪽
  assert.deepEqual(keys(packA4Pages(blocks, 267, 4)), [["a", "b"], ["c", "d"]]);
});

test("혼자 한 쪽을 넘는 덩어리도 쪼개지 않고 제 쪽을 차지한다", () => {
  const pages = packA4Pages(
    [
      { key: "a", height: 50 },
      { key: "big", height: 400 },
      { key: "b", height: 50 },
    ],
    268,
  );
  assert.deepEqual(keys(pages), [["a"], ["big"], ["b"]]);
});

test("빈 목록은 빈 쪽 목록", () => {
  assert.deepEqual(packA4Pages([]), []);
});

test("한글은 전각 1, 영문·숫자·공백은 반각으로 센다", () => {
  assert.equal(textWidthUnits("가나다"), 3);
  assert.ok(Math.abs(textWidthUnits("ab 1") - 2.2) < 1e-9);
});

test("줄 수 — 문단마다 적어도 한 줄, 빈 글은 0줄", () => {
  assert.equal(estimateLines("", 10), 0);
  assert.equal(estimateLines("   ", 10), 0);
  assert.equal(estimateLines(null, 10), 0);
  assert.equal(estimateLines("가".repeat(25), 10), 3);
  // 빈 줄도 한 줄을 차지한다(pre-wrap 으로 그리므로)
  assert.equal(estimateLines("가\n나\n\n다", 10), 4);
});

test("글 높이 = 줄 수 × 줄 높이 + 제목·여백, 빈 글은 0", () => {
  assert.equal(estimateTextHeight("가".repeat(20), { unitsPerLine: 10, lineMm: 4, extraMm: 5 }), 13);
  assert.equal(estimateTextHeight(null, { unitsPerLine: 10, lineMm: 4, extraMm: 5 }), 0);
});
