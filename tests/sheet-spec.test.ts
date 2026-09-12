/**
 * 답안지에 무엇이 찍히는지를 지키는 테스트.
 *
 * 실행: npm test
 *
 * 토요모의고사는 답안지를 미리 넉넉히 뽑아 두고 몇 주에 걸쳐 나눠 쓴다.
 * 종이에 회차 이름이 찍혀 버리면 그 종이 전부가 한 주짜리가 된다 — 이미
 * 인쇄한 뒤에는 되돌릴 방법이 없다.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { sheetSpecFor } from "../lib/omr-exams";
import {
  defaultPerColumn,
  defaultSheetTitle,
  type ExamType,
  type OmrConfig,
  type OmrExam,
} from "../lib/omr-types";

function exam(over: Partial<OmrExam> = {}, cfg: OmrConfig = {}): OmrExam {
  return {
    id: "exam-1",
    examType: "saturday",
    reportFamily: "B_english",
    title: "9월 11일 토모 코어",
    subject: null,
    examDate: "2026-09-12",
    numQuestions: 45,
    numChoices: 5,
    idDigits: 5,
    omrStyle: "exam",
    omrConfig: cfg,
    answerKey: {},
    points: {},
    questionMeta: {},
    mockReference: null,
    gradeCuts: [],
    useTeacherComment: false,
    createdByName: "김선생",
    createdAt: "2026-09-08T01:00:00.000Z",
    ...over,
  };
}

test("답안지 제목을 정해 두면 시험 제목 대신 그것이 찍힌다", () => {
  const spec = sheetSpecFor(exam({}, { sheet_title: "토요모의고사 OMR 답안지" }));
  assert.equal(spec.title, "토요모의고사 OMR 답안지");
});

test("답안지 제목이 없으면 예전처럼 시험 제목이 찍힌다", () => {
  // 이 규칙이 깨지면 이미 만들어 둔 시험의 답안지가 조용히 바뀐다
  assert.equal(sheetSpecFor(exam()).title, "9월 11일 토모 코어");
  assert.equal(sheetSpecFor(exam({}, { sheet_title: "   " })).title, "9월 11일 토모 코어");
});

test("토요모의고사 기본 답안지 제목에는 회차를 알 수 있는 말이 없다", () => {
  const title = defaultSheetTitle("saturday");
  assert.equal(title, "토요모의고사 OMR 답안지");
  assert.ok(
    !/\d/.test(title),
    "숫자가 들어가면 특정 회차를 가리키게 되어 미리 뽑아 둔 종이를 다음 주에 못 쓴다",
  );
});

test("답안지 제목을 따로 정하지 않는 유형은 빈 값이다", () => {
  for (const type of ["mock", "monthly", "placement", "inclass"] as ExamType[]) {
    assert.equal(defaultSheetTitle(type), "", `${type}는 시험 제목을 그대로 써야 한다`);
  }
});

test("토요모의고사 45문항은 열당 15개 — 세 열이 고르게 나뉜다", () => {
  const per = defaultPerColumn("saturday");
  assert.equal(per, 15);
  assert.equal(45 % per, 0, "나머지가 생기면 마지막 열만 휑해진다");
  assert.equal(45 / per, 3);
});

test("나머지 유형의 열당 개수는 예전 그대로 20이다", () => {
  for (const type of ["mock", "monthly", "placement", "inclass"] as ExamType[]) {
    assert.equal(defaultPerColumn(type), 20);
  }
});

test("이미 만든 시험의 열당 개수는 저장된 값을 그대로 쓴다", () => {
  // 기본값이 바뀌어도 예전 시험의 답안지 배치는 움직이면 안 된다.
  // 배치가 달라지면 그 시험으로 뽑아 둔 답안지를 판독하지 못한다.
  assert.equal(sheetSpecFor(exam({}, { per_column: 20 })).per_column, 20);
  assert.equal(sheetSpecFor(exam({}, { per_column: 25 })).per_column, 25);
});

test("답안지 제목은 판독 호환에 영향을 주는 값이 아니다", () => {
  // 판독 호환은 배치 지문(문항 수·보기 수·자리수·열당 개수·스타일·서술형 수)
  // 으로만 판단한다. 제목만 다른 두 답안지는 서로 호환돼야 한다.
  const a = sheetSpecFor(exam({}, { sheet_title: "토요모의고사 OMR 답안지", per_column: 15 }));
  const b = sheetSpecFor(exam({ id: "exam-2", title: "9월 18일 토모" }, { per_column: 15 }));
  for (const key of ["num_questions", "num_choices", "id_digits", "per_column", "style", "essay_count"] as const) {
    assert.equal(a[key], b[key], `${key}가 다르면 미리 뽑아 둔 답안지를 못 쓴다`);
  }
  assert.notEqual(a.title, b.title, "제목은 달라도 된다");
});
