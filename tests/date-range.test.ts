/**
 * 웹 리포트 생성일 기간 — 서버 조건과 화면 필터가 같은 하루 경계를 쓰는가.
 *
 * 실행: npm test
 *
 * 여기서 틀리면 새벽에 만든 성적표가 기간에서 빠지거나, 주소에 이상한 값을
 * 넣었을 때 조회가 깨진다.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { hasRange, inRange, kstDay, parseDateRange, rangeBounds, rangeLabel } from "../lib/date-range";

test("주소의 기간 — 날짜 모양만 받고, 앞뒤가 바뀌면 바로잡는다", () => {
  assert.deepEqual(parseDateRange("2026-10-01", "2026-10-12"), { from: "2026-10-01", to: "2026-10-12" });
  assert.deepEqual(parseDateRange("2026-10-12", "2026-10-01"), { from: "2026-10-01", to: "2026-10-12" });
  assert.deepEqual(parseDateRange(["2026-10-01"], undefined), { from: "2026-10-01", to: null });
  assert.deepEqual(parseDateRange("10/01/2026", "2026-13-40"), { from: null, to: null }, "모양이 다르거나 없는 날짜는 버린다");
  assert.deepEqual(parseDateRange("", null), { from: null, to: null });
  assert.equal(hasRange({ from: null, to: null }), false);
  assert.equal(hasRange({ from: null, to: "2026-10-12" }), true);
  assert.equal(rangeLabel({ from: "2026-10-01", to: null }), "2026-10-01 ~");
});

test("한국 날짜 — UTC 로 저장된 시각을 KST 하루로 읽는다", () => {
  assert.equal(kstDay("2026-10-12T20:30:00.000Z"), "2026-10-13", "한국 시간 새벽 5시 30분은 다음 날");
  assert.equal(kstDay("2026-10-12T10:00:00.000Z"), "2026-10-12");
  assert.equal(kstDay("2026-10-12T14:59:59.000Z"), "2026-10-12");
  assert.equal(kstDay("2026-10-12T15:00:00.000Z"), "2026-10-13");
});

test("서버 조건과 화면 필터가 같은 경계 — 새벽에 만든 성적표가 빠지지 않는다", () => {
  const range = { from: "2026-10-13", to: "2026-10-13" };
  const bounds = rangeBounds(range);
  assert.equal(bounds.gte, "2026-10-12T15:00:00.000Z", "13일 0시 KST");
  assert.equal(bounds.lt, "2026-10-13T15:00:00.000Z", "14일 0시 KST");

  const dawn = "2026-10-12T20:30:00.000Z"; // 13일 새벽 5시 30분 KST
  assert.ok(dawn >= bounds.gte! && dawn < bounds.lt!, "서버 조건에 든다");
  assert.equal(inRange(dawn, range), true, "화면 필터에도 든다");
  assert.equal(inRange("2026-10-12T14:00:00.000Z", range), false, "12일 밤 11시 KST 는 전날");
  assert.equal(inRange("2026-10-12T14:00:00.000Z", { from: null, to: null }), true, "기간이 없으면 다 든다");
  assert.deepEqual(rangeBounds({ from: null, to: null }), { gte: null, lt: null });
});
