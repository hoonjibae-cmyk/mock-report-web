/**
 * 시험일 입력값 정리.
 *
 * 실행: npm test
 */
import assert from "node:assert/strict";
import test from "node:test";

import { normalizeExamDate } from "../lib/exam-date";

test("비우면 null, 제대로 된 날짜는 그대로", () => {
  assert.deepEqual(normalizeExamDate(null), { ok: true, value: null });
  assert.deepEqual(normalizeExamDate(""), { ok: true, value: null });
  assert.deepEqual(normalizeExamDate("  "), { ok: true, value: null });
  assert.deepEqual(normalizeExamDate(" 2026-10-24 "), { ok: true, value: "2026-10-24" });
  assert.deepEqual(normalizeExamDate("2028-02-29"), { ok: true, value: "2028-02-29" }, "윤년");
});

test("모양이 다르거나 달력에 없는 날은 거절한다", () => {
  assert.equal(normalizeExamDate("2026/10/24").ok, false);
  assert.equal(normalizeExamDate("20261024").ok, false);
  assert.equal(normalizeExamDate("2026-13-01").ok, false);
  assert.equal(normalizeExamDate("2026-02-30").ok, false);
  assert.equal(normalizeExamDate("1999-01-01").ok, false);
  assert.equal(normalizeExamDate(20261024).ok, false);
});
