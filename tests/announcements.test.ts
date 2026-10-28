/**
 * 새 기능 안내 팝업 — 무엇을 띄우고, 언제 띄우지 않는가.
 *
 * 실행: npm test
 */
import assert from "node:assert/strict";
import test from "node:test";

import { ANNOUNCEMENTS, parseIds, pickAnnouncement, type Announcement } from "../lib/announcements";

const LIST: Announcement[] = [
  { id: "old", date: "2026-09-01", title: "옛 안내", items: [] },
  { id: "new", date: "2026-10-26", title: "새 안내", items: [] },
];

test("가장 최근 안내 하나만 띄운다", () => {
  assert.equal(pickAnnouncement([], [], LIST)?.id, "new");
});

test("'다시 보지 않기'나 '확인'으로 닫은 안내는 다시 띄우지 않는다", () => {
  assert.equal(pickAnnouncement(["new"], [], LIST), null, "다시 보지 않기");
  assert.equal(pickAnnouncement([], ["new"], LIST), null, "이번 세션에 확인");
  assert.equal(pickAnnouncement(["old"], ["old"], LIST)?.id, "new", "옛 안내를 닫았어도 새 안내는 보인다");
});

test("안내가 없으면 null", () => {
  assert.equal(pickAnnouncement([], [], []), null);
});

test("저장소 값은 깨져 있어도 안전하게 읽는다", () => {
  assert.deepEqual(parseIds('["a","b"]'), ["a", "b"]);
  assert.deepEqual(parseIds('["a", 3, null]'), ["a"]);
  assert.deepEqual(parseIds("not json"), []);
  assert.deepEqual(parseIds(null), []);
  assert.deepEqual(parseIds('{"x":1}'), []);
});

test("실제 안내 목록 — id가 겹치지 않고 링크가 관리자 화면·가이드 안이다", () => {
  const ids = ANNOUNCEMENTS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const a of ANNOUNCEMENTS) {
    assert.match(a.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(a.items.length > 0);
    for (const item of a.items) {
      if (item.href) assert.match(item.href, /^\/(admin|guide)/);
    }
  }
  assert.equal(pickAnnouncement([], [])?.id, "2026-10-28-report-refresh");
  // 지난 안내를 닫았던 사람에게도 새 안내는 보인다
  assert.equal(pickAnnouncement(["2026-10-26-student-history"], [])?.id, "2026-10-28-report-refresh");
});
