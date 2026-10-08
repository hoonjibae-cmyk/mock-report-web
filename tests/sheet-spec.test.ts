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
import { EMPTY_REVIEW } from "../lib/review";
import {
  SATURDAY_SHEET,
  applyFixedSheet,
  defaultPerColumn,
  defaultSheetTitle,
  type ExamType,
  type OmrConfig,
  type OmrExam,
} from "../lib/omr-types";

function exam(over: Partial<OmrExam> = {}, cfg: OmrConfig = {}): OmrExam {
  return {
    id: "exam-1",
    examType: "monthly",
    reportFamily: "C_generic",
    title: "9월 월말평가",
    subject: null,
    examDate: "2026-09-12",
    classNames: [],
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
    createdByUsername: "teacher",
    review: EMPTY_REVIEW,
    createdAt: "2026-09-08T01:00:00.000Z",
    ...over,
  };
}

/** 토요모의고사 시험 — 회차마다 제목·설정이 제각각이어도 답안지는 같아야 한다 */
function saturday(over: Partial<OmrExam> = {}, cfg: OmrConfig = {}): OmrExam {
  return exam({ examType: "saturday", reportFamily: "B_english", title: "9월 11일 토모 코어", ...over }, cfg);
}

test("답안지 제목을 정해 두면 시험 제목 대신 그것이 찍힌다", () => {
  const spec = sheetSpecFor(exam({}, { sheet_title: "월말평가 공통 답안지" }));
  assert.equal(spec.title, "월말평가 공통 답안지");
});

test("답안지 제목이 없으면 예전처럼 시험 제목이 찍힌다", () => {
  // 이 규칙이 깨지면 이미 만들어 둔 시험의 답안지가 조용히 바뀐다
  assert.equal(sheetSpecFor(exam()).title, "9월 월말평가");
  assert.equal(sheetSpecFor(exam({}, { sheet_title: "   " })).title, "9월 월말평가");
});

test("토요모의고사 답안지는 어느 시험에서 뽑아도 똑같다 — 제목·설정이 달라도", () => {
  // 미리 대량으로 뽑아 두고 어느 주에나 쓰는 종이다. 시험 제목, 따로 적은 답안지
  // 제목, 교시·영역, 열당 개수가 제각각이어도 종이는 하나여야 한다.
  const a = sheetSpecFor(saturday({ id: "exam-1", title: "9월 11일 토모 코어" }, { sheet_title: "9월 둘째 주 토모", per_column: 20, period: "3", subject_label: "영어 영역" }));
  const b = sheetSpecFor(saturday({ id: "exam-2", title: "10월 2일 토모 심화" }, {}));
  assert.deepEqual(a, b, "두 토모 시험의 답안지 스펙이 다르면 종이도 달라진다");
});

test("토요모의고사 답안지에는 '목동유쌤영어 토모'와 '영어영역'만 찍힌다", () => {
  const spec = sheetSpecFor(saturday({ title: "9월 11일 토모 코어" }, { sheet_title: "아무 제목" }));
  assert.equal(spec.title, "목동유쌤영어 토모");
  assert.equal(spec.subject_label, "영어영역");
  assert.equal(spec.period, "", "교시 동그라미가 들어가면 안 된다");
  assert.equal(spec.title_suffix, false, "판독 서버가 ' 답안지'를 덧붙이면 '목동유쌤영어 토모 답안지'가 된다");
  assert.ok(!/\d/.test(spec.title), "숫자가 들어가면 특정 회차를 가리키게 되어 미리 뽑아 둔 종이를 다음 주에 못 쓴다");
});

test("토요모의고사 QR 의 시험 코드는 시험 id 가 아니라 고정값이다", () => {
  // QR 에 시험마다 다른 id 가 들어가면 종이가 시험마다 달라진다
  assert.equal(sheetSpecFor(saturday({ id: "exam-1" })).exam_id, SATURDAY_SHEET.examId);
  assert.equal(sheetSpecFor(saturday({ id: "exam-2" })).exam_id, SATURDAY_SHEET.examId);
  assert.notEqual(SATURDAY_SHEET.examId, "exam-1");
});

test("토요모의고사 열당 개수는 저장된 값과 상관없이 15 — 45문항이 세 열로 고르게", () => {
  assert.equal(sheetSpecFor(saturday({}, { per_column: 20 })).per_column, 15);
  assert.equal(sheetSpecFor(saturday({}, {})).per_column, 15);
  assert.equal(45 % SATURDAY_SHEET.perColumn, 0, "나머지가 생기면 마지막 열만 휑해진다");
});

test("다른 유형은 시험 id 가 QR 에 그대로 들어가고 공통 양식을 타지 않는다", () => {
  const spec = sheetSpecFor(exam({ id: "exam-9" }, { period: "2", subject_label: "영어 영역" }));
  assert.equal(spec.exam_id, "exam-9");
  assert.equal(spec.period, "2");
  assert.equal(spec.subject_label, "영어 영역");
  assert.equal(spec.title_suffix, undefined, "다른 유형은 예전처럼 판독 서버가 ' 답안지'를 덧붙인다");
  const same = { ...spec };
  assert.deepEqual(applyFixedSheet(spec, "monthly"), same);
});

test("토요모의고사 기본 답안지 제목은 공통 양식 제목과 같다", () => {
  assert.equal(defaultSheetTitle("saturday"), SATURDAY_SHEET.title);
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

test("이미 만든 시험의 열당 개수는 저장된 값을 그대로 쓴다 (공통 양식이 없는 유형)", () => {
  // 기본값이 바뀌어도 예전 시험의 답안지 배치는 움직이면 안 된다.
  // 배치가 달라지면 그 시험으로 뽑아 둔 답안지를 판독하지 못한다.
  assert.equal(sheetSpecFor(exam({}, { per_column: 20 })).per_column, 20);
  assert.equal(sheetSpecFor(exam({}, { per_column: 25 })).per_column, 25);
});

test("답안지 제목은 판독 호환에 영향을 주는 값이 아니다", () => {
  // 판독 호환은 배치 지문(문항 수·보기 수·자리수·열당 개수·스타일·서술형 수)
  // 으로만 판단한다. 제목만 다른 두 답안지는 서로 호환돼야 한다.
  const a = sheetSpecFor(exam({}, { sheet_title: "월말평가 공통 답안지", per_column: 15 }));
  const b = sheetSpecFor(exam({ id: "exam-2", title: "10월 월말평가" }, { per_column: 15 }));
  for (const key of ["num_questions", "num_choices", "id_digits", "per_column", "style", "essay_count"] as const) {
    assert.equal(a[key], b[key], `${key}가 다르면 미리 뽑아 둔 답안지를 못 쓴다`);
  }
  assert.notEqual(a.title, b.title, "제목은 달라도 된다");
});
