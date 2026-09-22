/**
 * 운영진 검토 흐름의 규칙을 지키는 테스트.
 *
 * 실행: npm test
 *
 * 여기서 틀리면 컨펌 전 성적표가 학부모에게 나가거나(되돌릴 수 없다),
 * 컨펌이 끝난 시험을 담임이 영영 못 보낸다.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  EMPTY_REVIEW,
  canApproveReview,
  formatWhen,
  reviewRequired,
  sendAllowed,
  transition,
  type ExamReview,
} from "../lib/review";
import type { ExamType } from "../lib/omr-types";

const teacher = { username: "kim", displayName: "김선생" };
const boss = { username: "boss", displayName: "경영지원" };

test("월말평가만 운영진 검토를 거친다", () => {
  assert.equal(reviewRequired("monthly"), true);
  for (const type of ["mock", "saturday", "placement", "inclass"] as ExamType[]) {
    assert.equal(reviewRequired(type), false, `${type}는 검토 없이 나간다`);
  }
});

test("월말평가는 컨펌 전에는 보낼 수 없고, 컨펌되면 보낼 수 있다", () => {
  assert.equal(sendAllowed({ examType: "monthly", review: { status: "none" } }), false);
  assert.equal(sendAllowed({ examType: "monthly", review: { status: "requested" } }), false);
  assert.equal(sendAllowed({ examType: "monthly", review: { status: "approved" } }), true);
});

test("검토가 필요 없는 유형은 상태와 무관하게 보낸다", () => {
  assert.equal(sendAllowed({ examType: "saturday", review: { status: "none" } }), true);
});

test("요청 → 컨펌 순서로 간다", () => {
  const r1 = transition(EMPTY_REVIEW, "request", teacher, "2026-09-22T01:00:00.000Z");
  assert.ok("review" in r1);
  assert.equal(r1.review.status, "requested");
  assert.equal(r1.review.requestedByName, "김선생");

  const r2 = transition(r1.review, "approve", boss, "2026-09-22T02:00:00.000Z");
  assert.ok("review" in r2);
  assert.equal(r2.review.status, "approved");
  assert.equal(r2.review.approvedByName, "경영지원");
  assert.equal(r2.review.requestedByName, "김선생", "누가 요청했는지는 남아야 한다");
});

test("요청이 없으면 컨펌할 수 없다 — 담임이 아직 쓰는 중일 수 있다", () => {
  const r = transition(EMPTY_REVIEW, "approve", boss);
  assert.ok("error" in r);
});

test("이미 컨펌된 시험은 다시 컨펌하지 않는다", () => {
  const approved: ExamReview = { ...EMPTY_REVIEW, status: "approved", approvedBy: "boss" };
  const r = transition(approved, "approve", boss);
  assert.ok("error" in r);
});

test("컨펌 뒤에 다시 요청하면 컨펌이 풀린다 — 의견을 고쳤으면 다시 봐야 한다", () => {
  const approved: ExamReview = {
    status: "approved",
    requestedBy: "kim",
    requestedByName: "김선생",
    requestedAt: "2026-09-22T01:00:00.000Z",
    approvedBy: "boss",
    approvedByName: "경영지원",
    approvedAt: "2026-09-22T02:00:00.000Z",
  };
  const r = transition(approved, "request", teacher, "2026-09-22T03:00:00.000Z");
  assert.ok("review" in r);
  assert.equal(r.review.status, "requested");
  assert.equal(r.review.approvedBy, null);
  assert.equal(sendAllowed({ examType: "monthly", review: r.review }), false);
});

test("시각 표기는 로케일과 무관하게 한국 시간 'YYYY-MM-DD HH:mm' 이다", () => {
  // 서버와 브라우저가 '오전/AM'을 다르게 찍으면 화면이 다시 그려진다(hydration)
  assert.equal(formatWhen("2026-09-22T01:10:00.000Z"), "2026-09-22 10:10");
  assert.equal(formatWhen(null), "");
  assert.equal(formatWhen("garbage"), "");
});

test("컨펌은 총괄이거나 '월말평가 검토 컨펌'이 켜진 사람만", () => {
  assert.equal(canApproveReview({ role: "admin", permissions: { approveReview: false } }), true);
  assert.equal(canApproveReview({ role: "user", permissions: { approveReview: true } }), true, "교수부장");
  assert.equal(canApproveReview({ role: "user", permissions: { approveReview: false } }), false);
});
