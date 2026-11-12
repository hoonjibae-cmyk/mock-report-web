/**
 * 답안지 찾기 — 이름·수험번호 검색과 올린 날짜 묶기.
 *
 * 실행: npm test
 */
import assert from "node:assert/strict";
import test from "node:test";

import { dayLabel, matchesScanQuery, normalizeQuery, onDay, summarizeScanDays } from "../lib/scan-filter";

test("검색어는 공백을 무시하고 대소문자를 가리지 않는다", () => {
  assert.equal(normalizeQuery("  김 예시 "), "김예시");
  assert.equal(normalizeQuery("Scan_01.PDF"), "scan_01.pdf");
  assert.equal(normalizeQuery(null), "");
});

test("이름·수험번호·파일명·학교 어느 것으로든 찾는다 — 일부만 쳐도 된다", () => {
  const fields = { name: "김예시", studentId: "12345", filename: "토모_001.jpg", school: "목동중 2" };
  assert.ok(matchesScanQuery(fields, "예시"));
  assert.ok(matchesScanQuery(fields, "김 예"));
  assert.ok(matchesScanQuery(fields, "234"));
  assert.ok(matchesScanQuery(fields, "001"));
  assert.ok(matchesScanQuery(fields, "목동중"));
  assert.ok(!matchesScanQuery(fields, "박"));
  // 빈 검색어는 모두 통과, 이름을 모르는 답안지도 번호로는 찾힌다
  assert.ok(matchesScanQuery(fields, "   "));
  assert.ok(matchesScanQuery({ studentId: "99887", name: null }, "988"));
  assert.ok(!matchesScanQuery({ studentId: "99887", name: null }, "김"));
});

test("올린 날짜는 한국 시간으로 묶는다 — UTC 자정 전후가 같은 날", () => {
  const days = summarizeScanDays([
    { createdAt: "2026-11-07T01:10:00.000Z", status: "reviewed" }, // 11/7 10:10 KST
    { createdAt: "2026-11-07T14:59:00.000Z", status: "pending" }, // 11/7 23:59 KST
    { createdAt: "2026-11-07T15:30:00.000Z", status: "reviewed" }, // 11/8 00:30 KST
    { createdAt: "2026-11-09T03:00:00.000Z", status: "reviewed" },
  ]);
  assert.deepEqual(
    days.map((d) => [d.key, d.total, d.reviewed]),
    [
      ["2026-11-07", 2, 1],
      ["2026-11-08", 1, 1],
      ["2026-11-09", 1, 1],
    ],
  );
  assert.equal(days[0].label, "11월 7일 (토)");
  assert.equal(days[2].label, "11월 9일 (월)");
});

test("날짜를 못 읽는 답안지는 묶음에 들어가지 않고, 빈 목록은 빈 묶음", () => {
  assert.deepEqual(summarizeScanDays([]), []);
  assert.deepEqual(summarizeScanDays([{ createdAt: "", status: "pending" }]), []);
});

test("날짜 칩 — null 이면 모두, 아니면 그 날(한국 시간)에 올린 것만", () => {
  const scan = { createdAt: "2026-11-07T15:30:00.000Z" }; // 11/8 KST
  assert.ok(onDay(scan, null));
  assert.ok(onDay(scan, "2026-11-08"));
  assert.ok(!onDay(scan, "2026-11-07"));
});

test("날짜 이름표", () => {
  assert.equal(dayLabel("2026-01-03"), "1월 3일 (토)");
  assert.equal(dayLabel("이상한값"), "이상한값");
});
