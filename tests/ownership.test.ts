/**
 * 삭제 소유권 규칙을 지키는 테스트.
 *
 * 실행: npm test
 *
 * 여기서 틀리면 다른 선생님의 시험과 성적표 링크가 한 번에 사라진다 — 되돌릴
 * 수 없고, 학부모에게 이미 나간 링크가 죽는다.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { canDeleteOwned, type Deleter } from "../lib/ownership";

const teacher = (username: string, deleteReports = true): Deleter => ({
  username,
  role: "user",
  permissions: { deleteReports },
});
const admin: Deleter = { username: "boss", role: "admin", permissions: { deleteReports: true } };

test("제가 만든 것은 지운다", () => {
  assert.equal(canDeleteOwned(teacher("kim"), "kim"), true);
});

test("남이 만든 것은 삭제 권한이 있어도 못 지운다", () => {
  assert.equal(canDeleteOwned(teacher("kim"), "lee"), false);
});

test("총괄(경영지원)은 누구 것이든 지운다", () => {
  assert.equal(canDeleteOwned(admin, "lee"), true);
  assert.equal(canDeleteOwned(admin, null), true);
});

test("삭제 권한이 꺼진 계정은 제 것도 못 지운다", () => {
  assert.equal(canDeleteOwned(teacher("kim", false), "kim"), false);
});

test("만든 사람을 모르는 옛 자료는 총괄만 지운다", () => {
  // 주인이 없다고 아무나 지우게 두면 그 자료가 제일 위험하다
  assert.equal(canDeleteOwned(teacher("kim"), null), false);
  assert.equal(canDeleteOwned(teacher("kim"), ""), false);
  assert.equal(canDeleteOwned(teacher("kim"), "  "), false);
});
