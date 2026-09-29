/**
 * 로그인 뒤 돌아갈 곳을 고르는 규칙.
 *
 * 실행: npm test
 *
 * 여기서 틀리면 두 가지가 생긴다. 슬랙 링크를 누른 사람이 로그인 뒤 메인으로
 * 떨어져 링크를 다시 찾거나, 반대로 아무 주소나 받아 남의 사이트로 넘겨 주는
 * 문(열린 리다이렉트)이 생긴다.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { loginUrlFor, safeNextPath } from "../lib/login-next";

test("사이트 안의 경로는 그대로 돌려준다 — 검토 화면 링크", () => {
  const path = "/admin/omr/61f0e4c6-9359-488b-9b30-f33bcd8b220f/review";
  assert.equal(safeNextPath(path), path);
  assert.equal(safeNextPath("/admin/omr?tab=done"), "/admin/omr?tab=done");
});

test("비어 있으면 관리자 메인", () => {
  assert.equal(safeNextPath(null), "/admin");
  assert.equal(safeNextPath(undefined), "/admin");
  assert.equal(safeNextPath(""), "/admin");
  assert.equal(safeNextPath("   "), "/admin");
});

test("바깥 주소는 받지 않는다 — 열린 리다이렉트 방지", () => {
  assert.equal(safeNextPath("https://evil.example/phish"), "/admin");
  assert.equal(safeNextPath("//evil.example/phish"), "/admin");
  assert.equal(safeNextPath("/\\evil.example"), "/admin");
  assert.equal(safeNextPath("javascript:alert(1)"), "/admin");
  assert.equal(safeNextPath("admin/omr"), "/admin");
  assert.equal(safeNextPath("/admin\r\nSet-Cookie: x=1"), "/admin");
});

test("로그인 화면이나 API 로는 되돌리지 않는다 — 뱅뱅 돌거나 JSON 만 보게 된다", () => {
  assert.equal(safeNextPath("/login"), "/admin");
  assert.equal(safeNextPath("/login?error=x"), "/admin");
  assert.equal(safeNextPath("/api/admin/omr/exams"), "/admin");
});

test("로그인 화면 주소 — 갈 곳이 메인이면 next 를 붙이지 않는다", () => {
  assert.equal(loginUrlFor(null), "/login");
  assert.equal(loginUrlFor("/admin"), "/login");
  assert.equal(
    loginUrlFor("/admin/omr/abc/review"),
    "/login?next=%2Fadmin%2Fomr%2Fabc%2Freview",
  );
  assert.equal(loginUrlFor("https://evil.example"), "/login");
});
