/**
 * 저장 상태 칩 — 정답 입력 화면의 '정답 저장' 옆에 적는 글.
 *
 * 실행: npm test
 *
 * 여기서 틀리면 저장이 실패했는데 '저장됨'이 뜨거나, 고친 뒤에도 '변경 없음'이
 * 떠서 사람이 저장 없이 떠난다.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { clockLabel, saveStateOf } from "../lib/save-state";

const ok = { ok: true, at: "14:02", text: "정답 45/45 저장 완료" };
const fail = { ok: false, at: "14:05", text: "정답을 저장하지 못했습니다." };

test("우선순위 — 저장 중 > 실패 > 변경 있음 > 저장됨 > 변경 없음", () => {
  assert.equal(saveStateOf({ saving: true, dirty: true, lastSave: fail }).kind, "saving");
  assert.equal(saveStateOf({ saving: false, dirty: true, lastSave: fail }).kind, "failed", "실패는 고친 뒤에도 다시 저장할 때까지 보인다");
  assert.equal(saveStateOf({ saving: false, dirty: true, lastSave: ok }).kind, "dirty", "저장 뒤 고쳤으면 변경 있음");
  assert.equal(saveStateOf({ saving: false, dirty: false, lastSave: ok }).kind, "saved");
  assert.equal(saveStateOf({ saving: false, dirty: false, lastSave: null }).kind, "clean");
});

test("글 — 시각과 설명이 들어간다", () => {
  assert.equal(saveStateOf({ saving: false, dirty: false, lastSave: ok }).label, "14:02 저장됨 · 정답 45/45 저장 완료");
  assert.match(saveStateOf({ saving: false, dirty: false, lastSave: fail }).label, /^저장 실패 — 정답을 저장하지 못했습니다\./);
  assert.equal(saveStateOf({ saving: false, dirty: true, lastSave: null }).label, "저장되지 않은 변경이 있습니다");
});

test("시각 표기 — 두 자리", () => {
  assert.equal(clockLabel(new Date(2026, 9, 20, 9, 5)), "09:05");
  assert.equal(clockLabel(new Date(2026, 9, 20, 14, 2)), "14:02");
});
