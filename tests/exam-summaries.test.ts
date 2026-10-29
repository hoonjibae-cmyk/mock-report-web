/**
 * 목록용 가벼운 시험 행 → OmrExam.
 *
 * 실행: npm test
 *
 * 목록 화면은 무거운 열(문항분류표·문항 정보·배점·설정 전체)을 읽지 않는다. 그래도
 * 화면이 보는 값(정답 입력 여부·서술형 수·검토 상태·반)은 그대로 있어야 한다.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { summaryRowToExam, type ExamSummaryRow } from "../lib/omr-exams";

const ROW: ExamSummaryRow = {
  id: "e1", exam_type: "monthly", report_family: "C_generic", title: "10월 월말평가", subject: null, exam_date: "2026-10-22",
  num_questions: 25, num_choices: 5, id_digits: 5, omr_style: "exam", answer_key: { "1": 3, "2": [2, 4] }, grade_cuts: [],
  use_teacher_comment: true, created_by_name: "김선생", created_by_username: "kim", created_at: "2026-10-20T00:00:00.000Z",
  review_status: "requested", review_requested_by: "kim", review_requested_by_name: "김선생", review_requested_at: "2026-10-24T03:10:00.000Z",
  review_approved_by: null, review_approved_by_name: null, review_approved_at: null, class_names: ["M7B 화목 L", ""],
  level: "M7B", period_month: "2026-10", cohort_mode: "level",
  cfg_essay_count: 3, cfg_per_column: 20, cfg_sheet_title: "10월 월말평가 답안지", cfg_classfit_workspace_id: null,
};

test("목록 행에서 화면이 보는 값은 그대로, 무거운 열은 비어 있다", () => {
  const exam = summaryRowToExam(ROW);
  assert.equal(exam.id, "e1");
  assert.equal(exam.examType, "monthly");
  assert.deepEqual(exam.answerKey, { "1": 3, "2": [2, 4] });
  assert.deepEqual(exam.classNames, ["M7B 화목 L"]);
  assert.equal(exam.review.status, "requested");
  assert.equal(exam.review.requestedByName, "김선생");
  assert.deepEqual(exam.review.edits, []);
  assert.equal(exam.level, "M7B");
  assert.equal(exam.cohortMode, "level");
  assert.deepEqual(exam.omrConfig, { essay_count: 3, per_column: 20, sheet_title: "10월 월말평가 답안지" });
  assert.equal(exam.mockReference, null);
  assert.deepEqual(exam.questionMeta, {});
  assert.deepEqual(exam.points, {});
});

test("설정 열쇠가 없거나 모양이 다르면 빼고, 반편성 회차는 문자열일 때만", () => {
  const exam = summaryRowToExam({ ...ROW, cfg_essay_count: null, cfg_per_column: "20", cfg_sheet_title: "", cfg_classfit_workspace_id: "ws-1" });
  assert.deepEqual(exam.omrConfig, { classfit_workspace_id: "ws-1" });
});
