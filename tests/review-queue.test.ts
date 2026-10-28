/**
 * 운영진 검토 대기열 — 상태별로 나누고 순서를 정한다.
 *
 * 실행: npm test
 */
import assert from "node:assert/strict";
import test from "node:test";

import { reviewQueue, waitingText } from "../lib/review-queue";
import type { OmrExam } from "../lib/omr-types";
import { EMPTY_REVIEW, type ExamReview } from "../lib/review";

function exam(id: string, over: Omit<Partial<OmrExam>, "review"> & { review?: Partial<ExamReview> } = {}): OmrExam {
  const { review, ...rest } = over;
  return {
    id, examType: "monthly", reportFamily: "C_generic", title: id, subject: null, examDate: null, numQuestions: 25,
    numChoices: 5, idDigits: 5, omrStyle: "exam", omrConfig: {}, answerKey: {}, points: {}, questionMeta: {},
    mockReference: null, gradeCuts: [], useTeacherComment: true, createdByName: "김선생", createdByUsername: "kim",
    createdAt: "2026-10-20T00:00:00.000Z", classNames: [], level: null, periodMonth: null, cohortMode: "class",
    review: { ...EMPTY_REVIEW, ...review }, ...rest,
  } as OmrExam;
}

test("월말평가만 들어가고, 기다리는 것은 오래된 요청이 위, 컨펌된 것은 최근 컨펌이 위", () => {
  const q = reviewQueue([
    exam("tomo", { examType: "saturday", review: { status: "requested", requestedAt: "2026-10-01T00:00:00.000Z" } }),
    exam("r-new", { review: { status: "requested", requestedAt: "2026-10-27T01:00:00.000Z" } }),
    exam("r-old", { review: { status: "requested", requestedAt: "2026-10-24T03:10:00.000Z" } }),
    exam("a-old", { review: { status: "approved", approvedAt: "2026-10-20T00:00:00.000Z" } }),
    exam("a-new", { review: { status: "approved", approvedAt: "2026-10-27T07:53:00.000Z" } }),
    exam("p-old", { createdAt: "2026-10-10T00:00:00.000Z" }),
    exam("p-new", { createdAt: "2026-10-26T00:00:00.000Z" }),
  ]);
  assert.deepEqual(q.requested.map((e) => e.id), ["r-old", "r-new"]);
  assert.deepEqual(q.approved.map((e) => e.id), ["a-new", "a-old"]);
  assert.deepEqual(q.pending.map((e) => e.id), ["p-new", "p-old"]);
});

test("기다린 날수 문구", () => {
  const now = new Date("2026-10-28T09:00:00.000Z");
  assert.equal(waitingText("2026-10-28T01:00:00.000Z", now), "오늘 요청");
  assert.equal(waitingText("2026-10-27T01:00:00.000Z", now), "어제 요청");
  assert.equal(waitingText("2026-10-24T03:10:00.000Z", now), "4일째 기다리는 중");
  assert.equal(waitingText(null, now), "");
  assert.equal(waitingText("not a date", now), "");
});
