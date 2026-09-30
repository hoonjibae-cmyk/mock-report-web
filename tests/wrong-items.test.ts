/**
 * 틀린 문항 한 줄 — 담임 의견 화면의 참고 정보.
 *
 * 실행: npm test
 *
 * 여기서 틀리면 담임이 "3번을 골라 틀렸다"고 믿고 코멘트를 쓰는데 실제로는
 * 안 푼 문항이거나, 맞힌 문항이 틀린 것으로 나온다.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { GenericItemResult } from "../lib/omr-report-types";
import { wrongItemsOf } from "../lib/wrong-items";

function item(over: Partial<GenericItemResult> & { no: number }): GenericItemResult {
  return {
    essay: false, answer: 1, marked: 1, correct: true, earned: 2, point: 2,
    correctRate: 50, difficulty: "보통", difficultySpecified: false, area: "문법", content: null,
    ...over,
  };
}

test("틀린 문항만 번호순으로, 영역·고른 답·정답이 함께", () => {
  const out = wrongItemsOf([
    item({ no: 7, correct: false, answer: 2, marked: 3, area: "독해", content: "내용일치" }),
    item({ no: 3, correct: false, answer: 4, marked: 1, area: "문법", content: "시제" }),
    item({ no: 1, correct: true }),
  ]);
  assert.deepEqual(out, [
    { no: 3, area: "문법", content: "시제", marked: "1", answer: "4" },
    { no: 7, area: "독해", content: "내용일치", marked: "3", answer: "2" },
  ]);
});

test("안 푼 문항은 무응답, 모두 고르기는 번호를 쉼표로, 서술형은 받은 점수", () => {
  const out = wrongItemsOf([
    item({ no: 2, correct: false, marked: null }),
    item({ no: 5, correct: false, answer: [2, 4], marked: [2] }),
    item({ no: 9, correct: false, essay: true, answer: null, marked: null, earned: 1, point: 3 }),
  ]);
  assert.equal(out[0].marked, "무응답");
  assert.equal(out[1].marked, "2");
  assert.equal(out[1].answer, "2,4");
  assert.equal(out[2].marked, "1/3점");
  assert.equal(out[2].answer, "서술");
});

test("영역을 안 적어 둔 시험이면 영역은 빈 문자열, 전부 맞히면 빈 목록", () => {
  assert.equal(wrongItemsOf([item({ no: 1, correct: false, area: null, marked: 2 })])[0].area, "");
  assert.deepEqual(wrongItemsOf([item({ no: 1 }), item({ no: 2 })]), []);
});
