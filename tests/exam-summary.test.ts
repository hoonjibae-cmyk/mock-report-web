/**
 * 시험 결과 요약의 재료·정렬·집계 규칙.
 *
 * 실행: npm test
 *
 * 여기서 틀리면 선생님이 한눈에 보는 표가 거짓을 말한다 — 이름이 엉뚱한 학생에
 * 붙거나, 점수순이 뒤섞이거나, 분포 칸의 합이 인원과 다르거나, 어려운 문항이
 * 쉬운 문항으로 나온다.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  areasOf,
  buildSummaryRows,
  duplicateKeys,
  hardestQuestions,
  markText,
  scoreBins,
  sortRows,
  summaryQuestions,
  type SummaryQuestion,
  type SummaryRow,
  type SummaryStudent,
} from "../lib/exam-summary";
import type { GenericItemResult } from "../lib/omr-report-types";
import type { ScoredScan } from "../lib/omr-scoring";
import type { OmrExam } from "../lib/omr-types";
import { EMPTY_REVIEW } from "../lib/review";

function item(no: number, over: Partial<GenericItemResult> = {}): GenericItemResult {
  return {
    no, essay: false, answer: 1, marked: 1, correct: true, earned: 2, point: 2,
    correctRate: 50, difficulty: "보통", difficultySpecified: false, area: "문법", content: null,
    ...over,
  };
}

function scored(key: string, raw: number, items: GenericItemResult[], over: Partial<ScoredScan> = {}): ScoredScan {
  return {
    scanId: `scan-${key}`, studentKey: key, raw, objectiveRaw: raw, essayRaw: 0,
    correctCount: items.filter((i) => i.correct).length, wrongCount: items.filter((i) => !i.correct).length, blankCount: 0,
    rank: 1, topPercent: 50, standardScore: 100, grade: null, items, weakItems: [],
    areas: [{ area: "문법", earned: raw, possible: 100, rate: raw, cohortRate: 70, cohortEarned: 70 }], contents: [],
    ...over,
  };
}

function row(key: string, name: string, raw: number, max = 100): SummaryRow {
  return {
    studentKey: key, name, school: "", className: "", raw, max, objectiveRaw: raw, essayRaw: 0,
    rank: 1, topPercent: 50, standardScore: 100, grade: null, correctCount: 0, wrongCount: 0, blankCount: 0,
    areas: [], items: [], reportToken: null,
  };
}

test("채점 결과에 이름·반·성적표 링크가 수험번호로 붙는다 — 없으면 빈 이름", () => {
  const students = new Map<string, SummaryStudent>([
    ["10231", { name: "김하늘", school: "목운중 2", className: "중2A", reportToken: "tok-1" }],
  ]);
  const rows = buildSummaryRows(
    [scored("10231", 86, [item(2, { correct: false, marked: 3 }), item(1)]), scored("10232", 70, [item(1)])],
    students,
    100,
  );
  assert.equal(rows[0].name, "김하늘");
  assert.equal(rows[0].className, "중2A");
  assert.equal(rows[0].reportToken, "tok-1");
  assert.equal(rows[0].max, 100);
  assert.deepEqual(rows[0].items.map((i) => i.no), [1, 2], "문항은 번호순");
  assert.equal(rows[0].items[1].marked, "3", "틀린 문항에는 고른 번호");
  assert.equal(rows[1].name, "", "성적표도 학생 관리 프로그램에도 없으면 빈 이름 — 화면이 수험번호로 보인다");
  assert.equal(rows[1].reportToken, null);
});

test("고른 것 표기 — 보기 하나, 모두 고르기, 무응답, 서술형", () => {
  assert.equal(markText(3), "3");
  assert.equal(markText([2, 4]), "2,4");
  assert.equal(markText(null), "");
  assert.equal(markText(undefined), "");
  const rows = buildSummaryRows(
    [scored("1", 0, [item(1, { correct: false, marked: null }), item(2, { essay: true, answer: null, marked: null, correct: false, earned: 1, point: 3 })])],
    new Map(),
    100,
  );
  assert.equal(rows[0].items[0].marked, "", "무응답은 빈 값 — 화면이 점으로 그린다");
  assert.equal(rows[0].items[1].marked, "", "서술형은 고른 번호가 없다");
  assert.equal(rows[0].items[1].earned, 1);
});

test("문항 줄 — 정답·영역·배점·정답률이 번호순으로, 서술형은 '서술'", () => {
  const exam = {
    id: "e", examType: "monthly", numQuestions: 3, numChoices: 5, idDigits: 5, omrStyle: "exam",
    omrConfig: { essay_count: 1 }, answerKey: { "1": 2, "2": [2, 4], "3": "", "4": "answer" }, points: {},
    questionMeta: { "1": { area: "듣기" }, "2": { area: "독해" } }, mockReference: null, gradeCuts: [],
    useTeacherComment: false, createdByName: null, createdByUsername: null, createdAt: "", classNames: [],
    reportFamily: "C_generic", title: "t", subject: null, examDate: null, review: EMPTY_REVIEW,
  } as unknown as OmrExam;
  const qs = summaryQuestions(exam, { 1: 83.3, 2: 40, 4: 55 });
  assert.deepEqual(qs.map((q) => q.no), [1, 2, 3, 4]);
  assert.equal(qs[0].answer, "2");
  assert.equal(qs[1].answer, "2,4");
  assert.equal(qs[3].answer, "서술");
  assert.equal(qs[3].essay, true);
  assert.deepEqual(qs.map((q) => q.rate), [83, 40, 0, 55], "정답률은 정수로, 없으면 0");
  assert.deepEqual(areasOf(qs), ["듣기", "독해"], "영역은 처음 나온 문항 순서");
});

test("정렬 — 점수순은 높은 점수부터, 이름순은 이름 없는 줄이 맨 뒤, 수험번호순은 숫자처럼", () => {
  const rows = [row("10", "박새롬", 70), row("9", "", 90), row("100", "강여울", 90), row("2", "최다솜", 80)];
  assert.deepEqual(sortRows(rows, "score").map((r) => r.studentKey), ["100", "9", "2", "10"], "같은 점수면 이름순, 이름 없는 줄은 뒤");
  assert.deepEqual(sortRows(rows, "name").map((r) => r.studentKey), ["100", "10", "2", "9"]);
  assert.deepEqual(sortRows(rows, "key").map((r) => r.studentKey), ["2", "9", "10", "100"]);
  assert.equal(rows[0].studentKey, "10", "원본은 그대로");
});

test("점수 분포 — 만점 대비 비율로 다섯 칸, 합은 인원과 같다", () => {
  const rows = [row("1", "a", 95), row("2", "b", 90), row("3", "c", 89), row("4", "d", 70), row("5", "e", 59), row("6", "f", 40, 50)];
  const bins = scoreBins(rows);
  assert.deepEqual(bins.map((b) => `${b.label}:${b.count}`), ["90% 이상:2", "80~89%:2", "70~79%:1", "60~69%:0", "60% 미만:1"]);
  assert.equal(bins.reduce((n, b) => n + b.count, 0), rows.length);
});

test("어려운 문항 — 정답률 낮은 순, 같으면 번호순, n개만", () => {
  const qs: SummaryQuestion[] = [
    { no: 1, essay: false, answer: "1", area: "", point: 2, rate: 90 },
    { no: 2, essay: false, answer: "1", area: "", point: 2, rate: 40 },
    { no: 3, essay: false, answer: "1", area: "", point: 2, rate: 40 },
    { no: 4, essay: false, answer: "1", area: "", point: 2, rate: 10 },
  ];
  assert.deepEqual(hardestQuestions(qs, 3).map((q) => q.no), [4, 2, 3]);
  assert.deepEqual(hardestQuestions([], 3), []);
});

test("같은 수험번호가 두 번 들어오면 표시한다 — 집단 인원이 부푼다", () => {
  const dup = duplicateKeys([row("1", "a", 1), row("2", "b", 1), row("1", "a", 2)]);
  assert.deepEqual([...dup], ["1"]);
});
