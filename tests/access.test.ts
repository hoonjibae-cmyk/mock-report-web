/**
 * 반배치고사 열람 권한의 기본값을 지키는 테스트.
 *
 * 실행: npm test
 *
 * 반배치고사는 반을 새로 짜는 자료다. 기본값이 한 부서만 잘못 열려 있어도
 * 편성 전에 결과가 새고, 잘못 닫혀 있으면 편성하는 사람이 제 일을 못 한다.
 * 둘 다 화면에서는 '그냥 목록이 비었네' 로만 보인다.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_USER_PERMISSIONS, defaultPermissionsFor, normalizePermissions } from "../lib/access";

test("경영지원·교육운영팀은 반배치고사가 기본으로 열려 있다", () => {
  assert.equal(defaultPermissionsFor("경영지원").viewPlacement, true);
  assert.equal(defaultPermissionsFor("교육운영팀").viewPlacement, true);
});

test("교수부·조교팀·모르는 부서는 기본으로 닫혀 있다", () => {
  assert.equal(defaultPermissionsFor("교수부").viewPlacement, false);
  assert.equal(defaultPermissionsFor("조교팀").viewPlacement, false);
  assert.equal(defaultPermissionsFor(null).viewPlacement, false, "부서를 모르면 닫는다");
  assert.equal(defaultPermissionsFor("").viewPlacement, false);
});

test("부서 기본값이 달라도 다른 권한은 그대로 전부 켜져 있다", () => {
  const p = defaultPermissionsFor("교수부");
  for (const key of ["viewReports", "createReports", "manageReports", "deleteReports", "exportReports", "downloadTemplate"] as const) {
    assert.equal(p[key], true, `${key}는 부서와 무관하게 켜져 있어야 한다`);
  }
});

test("저장된 값이 없으면 부서 기본값을, 있으면 저장된 값을 따른다", () => {
  // 교수부 계정 — 정한 적 없으면 닫힘
  assert.equal(normalizePermissions({}, defaultPermissionsFor("교수부")).viewPlacement, false);
  // 교수부 계정에 계정 관리에서 열어 준 경우 — 저장된 값이 이긴다
  assert.equal(normalizePermissions({ viewPlacement: true }, defaultPermissionsFor("교수부")).viewPlacement, true);
  // 교육운영팀 계정을 일부러 닫은 경우 — 역시 저장된 값이 이긴다
  assert.equal(normalizePermissions({ viewPlacement: false }, defaultPermissionsFor("교육운영팀")).viewPlacement, false);
});

test("예전 권한들은 지금까지처럼 '적혀 있지 않으면 켜짐' 이다", () => {
  // 이 규칙이 바뀌면 모든 계정의 권한이 조용히 달라진다
  const p = normalizePermissions({ viewReports: false });
  assert.equal(p.viewReports, false);
  assert.equal(p.createReports, true);
  assert.equal(p.exportReports, true);
});

test("fallback 을 주지 않으면 반배치고사는 닫힌다", () => {
  assert.equal(DEFAULT_USER_PERMISSIONS.viewPlacement, false);
  assert.equal(normalizePermissions({}).viewPlacement, false);
});
