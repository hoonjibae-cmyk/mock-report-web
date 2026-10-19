/**
 * 담임 '내 반' 화면의 규칙을 지키는 테스트.
 *
 * 실행: npm test
 *
 * 여기서 틀리면 담임이 남의 반을 보거나, 제 반을 못 보거나, 반배치고사 결과가
 * 편성 전에 새어 나간다. 셋 다 화면만 봐서는 잘못됐는지 알기 어렵다.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  classItemRates,
  compactItems,
  groupByExam,
  homeroomKey,
  latestPerStudent,
  mergeTeacherNames,
  questionsOf,
  sameTeacher,
  summarizeClass,
  teacherCanSeeExamType,
  type HomeroomReport,
} from "../lib/homeroom";
import type { GenericItemResult } from "../lib/omr-report-types";
import type { ExamType } from "../lib/omr-types";

function report(over: Partial<HomeroomReport> = {}): HomeroomReport {
  return {
    reportId: over.reportId ?? `r-${Math.random().toString(36).slice(2, 8)}`,
    token: "t",
    examId: "exam-1",
    examType: "saturday",
    examTitle: "9월 토요모의고사",
    examDate: "2026-09-12",
    studentKey: "10301",
    studentName: "강여울",
    school: "목운중 2",
    className: "중2 코어",
    raw: 80,
    max: 100,
    standardScore: 110,
    rank: 3,
    cohortCount: 24,
    cohortMean: 70,
    areas: [
      { area: "독해", earned: 50, possible: 62.2, rate: 80, cohortRate: 74, cohortEarned: 46 },
      { area: "듣기", earned: 30, possible: 37.8, rate: 79, cohortRate: 81, cohortEarned: 30.6 },
    ],
    wrongCount: 2,
    blankCount: 0,
    listeningAbsent: false,
    items: [],
    active: true,
    viewCount: 0,
    createdAt: "2026-09-12T10:00:00.000Z",
    ...over,
  };
}

function genericItem(no: number, over: Partial<GenericItemResult> = {}): GenericItemResult {
  return {
    no, essay: false, answer: 2, marked: 2, correct: true, earned: 2, point: 2,
    correctRate: 70.4, difficulty: "보통", difficultySpecified: false, area: "독해", content: null,
    ...over,
  };
}

test("이름 열쇠 — 공백과 대소문자 차이는 같은 사람으로 본다", () => {
  assert.equal(homeroomKey("김 선생"), homeroomKey("김선생"));
  assert.equal(homeroomKey(" Kim Teacher "), homeroomKey("kimteacher"));
  assert.notEqual(homeroomKey("김선생"), homeroomKey("이선생"));
  assert.equal(homeroomKey(null), "", "담임이 비어 있으면 아무하고도 맞지 않아야 한다");
});

test("선생님 목록 — 표기가 다른 같은 이름은 하나로, 많이 쓰인 표기로, 가나다순", () => {
  const names = ["이선생", "김 선생", "김선생", "김선생", null, "", "  ", "박선생"];
  assert.deepEqual(mergeTeacherNames(names), ["김선생", "박선생", "이선생"]);
});

test("선생님 목록 — 본인은 성적표가 없어도 들어가고, 본인 표기(인사 프로그램)가 우선한다", () => {
  const merged = mergeTeacherNames(["김 선생", "김 선생", "이선생"], ["김선생", "배지훈"]);
  assert.deepEqual(merged, ["김선생", "배지훈", "이선생"]);
  assert.equal(sameTeacher("김 선생", "김선생"), true);
  assert.equal(sameTeacher("", ""), false, "빈 이름끼리는 같은 사람이 아니다");
  assert.equal(sameTeacher("김선생", "이선생"), false);
});

test("반배치고사만 담임에게 닫혀 있고 토요모의고사는 열려 있다", () => {
  assert.equal(teacherCanSeeExamType("placement"), false);
  assert.equal(teacherCanSeeExamType("saturday"), true);
  for (const type of ["mock", "monthly", "inclass"] as ExamType[]) {
    assert.equal(teacherCanSeeExamType(type), true, `${type}는 담임이 볼 수 있어야 한다`);
  }
});

test("시험별로 묶을 때 반배치고사는 통째로 빠진다", () => {
  const groups = groupByExam([
    report({ examId: "sat", examType: "saturday" }),
    report({ examId: "place", examType: "placement", examTitle: "9월 반배치고사" }),
  ]);
  assert.deepEqual(groups.map((g) => g.examId), ["sat"]);
});

test("'반배치고사 열람'이 열린 계정은 내 반의 반배치고사도 본다", () => {
  const rows = [
    report({ examId: "sat", examType: "saturday" }),
    report({ examId: "place", examType: "placement", examTitle: "9월 반배치고사" }),
  ];
  assert.deepEqual(groupByExam(rows, false).map((g) => g.examId), ["sat"]);
  assert.deepEqual(groupByExam(rows, true).map((g) => g.examId).sort(), ["place", "sat"]);
});

test("중지된 성적표는 반 목록에 나오지 않는다", () => {
  const groups = groupByExam([
    report({ studentKey: "1", studentName: "강여울" }),
    report({ studentKey: "2", studentName: "김하늘", active: false }),
  ]);
  assert.deepEqual(groups[0].students.map((s) => s.studentName), ["강여울"]);
});

test("같은 시험에서 성적표를 다시 만든 학생은 마지막 것만 센다", () => {
  const kept = latestPerStudent([
    report({ studentKey: "1", raw: 60, createdAt: "2026-09-12T10:00:00.000Z" }),
    report({ studentKey: "1", raw: 85, createdAt: "2026-09-12T15:00:00.000Z" }),
  ]);
  assert.equal(kept.length, 1, "두 줄로 나오면 반 평균부터 틀린다");
  assert.equal(kept[0].raw, 85);
});

test("반 요약 — 평균·최고·최저와 전체 평균 이상 인원", () => {
  const s = summarizeClass([
    report({ studentKey: "1", raw: 90 }),
    report({ studentKey: "2", raw: 70 }),
    report({ studentKey: "3", raw: 50 }),
  ]);
  assert.equal(s.count, 3);
  assert.equal(s.mean, 70);
  assert.equal(s.max, 90);
  assert.equal(s.min, 50);
  assert.equal(s.cohortMean, 70);
  assert.equal(s.aboveCohort, 2, "70점은 전체 평균(70)과 같으므로 '이상'에 든다");
});

test("반 요약 영역 — 학생별 성취율의 평균, 이름순으로 고정", () => {
  const s = summarizeClass([
    report({
      studentKey: "1",
      areas: [
        { area: "독해", earned: 0, possible: 0, rate: 80, cohortRate: 74, cohortEarned: 0 },
        { area: "듣기", earned: 0, possible: 0, rate: 60, cohortRate: 81, cohortEarned: 0 },
      ],
    }),
    report({
      studentKey: "2",
      // 성적표 안에서는 성취율 낮은 순이라 학생마다 순서가 다르다
      areas: [
        { area: "듣기", earned: 0, possible: 0, rate: 100, cohortRate: 81, cohortEarned: 0 },
        { area: "독해", earned: 0, possible: 0, rate: 60, cohortRate: 74, cohortEarned: 0 },
      ],
    }),
  ]);
  assert.deepEqual(s.areas, [
    { area: "독해", rate: 70, cohortRate: 74 },
    { area: "듣기", rate: 80, cohortRate: 81 },
  ]);
});

test("빈 반은 0으로 채운 요약을 돌려준다 — 화면이 죽지 않게", () => {
  const s = summarizeClass([]);
  assert.equal(s.count, 0);
  assert.deepEqual(s.areas, []);
});

test("문항별 정오 — 성적표 본문을 '내 반' 칸으로: 고른 번호·모두 고르기·무응답·서술형·미응시", () => {
  const items = compactItems([
    genericItem(3, { answer: [2, 4], marked: [2, 4], correct: true }),
    genericItem(1, { marked: 3, correct: false, earned: 0 }),
    genericItem(2, { marked: null, correct: false, earned: 0 }),
    genericItem(4, { essay: true, answer: null, marked: null, correct: false, earned: 1.5, point: 3, area: null }),
    genericItem(5, { absent: true, marked: null, correct: false, earned: 0, area: "듣기" }),
  ]);
  assert.deepEqual(items.map((i) => i.no), [1, 2, 3, 4, 5], "번호순");
  assert.deepEqual(items.map((i) => i.marked), ["3", "", "2,4", "", ""]);
  assert.deepEqual(items.map((i) => i.correct), [false, false, true, false, false]);
  assert.equal(items[3].earned, 1.5, "서술형은 받은 점수");
  assert.equal(items[4].absent, true);
});

test("시험의 문항 정보 — 정답·영역·배점·전체 정답률, 서술형은 '서술'", () => {
  const qs = questionsOf([
    genericItem(2, { answer: [1, 3], area: "듣기", correctRate: 83.3 }),
    genericItem(1, { answer: 4, correctRate: 49.5 }),
    genericItem(3, { essay: true, answer: null, point: 3, area: null, correctRate: 55 }),
  ]);
  assert.deepEqual(qs.map((q) => [q.no, q.answer, q.area, q.point, q.rate]), [
    [1, "4", "독해", 2, 50],
    [2, "1,3", "듣기", 2, 83],
    [3, "서술", "", 3, 55],
  ]);
  assert.equal(qs[2].essay, true);
});

test("우리 반 정답률 — 맞힌 비율, 미응시는 분모에서 빼고, 서술형은 평균 득점률", () => {
  const qs = questionsOf([
    genericItem(1), genericItem(2, { area: "듣기" }), genericItem(3, { essay: true, answer: null, point: 4 }),
  ]);
  const students = [
    report({ studentKey: "1", items: [{ no: 1, marked: "2", correct: true, earned: 2, absent: false }, { no: 2, marked: "2", correct: true, earned: 2, absent: false }, { no: 3, marked: "", correct: false, earned: 4, absent: false }] }),
    report({ studentKey: "2", items: [{ no: 1, marked: "3", correct: false, earned: 0, absent: false }, { no: 2, marked: "", correct: false, earned: 0, absent: true }, { no: 3, marked: "", correct: false, earned: 2, absent: false }] }),
    report({ studentKey: "3", items: [{ no: 1, marked: "2", correct: true, earned: 2, absent: false }, { no: 2, marked: "1", correct: false, earned: 0, absent: false }, { no: 3, marked: "", correct: false, earned: 0, absent: false }] }),
  ];
  const rates = classItemRates(students, qs);
  assert.equal(rates[1], 67, "3명 중 2명");
  assert.equal(rates[2], 50, "듣기 미응시 학생은 빼고 2명 중 1명");
  assert.equal(rates[3], 50, "서술형: (4+2+0)/(3×4)");
  assert.deepEqual(classItemRates([], qs), { 1: 0, 2: 0, 3: 0 }, "학생이 없으면 0");
});

test("시험별로 묶을 때 문항 정보는 시험으로 올리고 학생에서는 뺀다", () => {
  const qs = questionsOf([genericItem(1), genericItem(2)]);
  const groups = groupByExam([
    report({ studentKey: "1", questions: qs, items: [{ no: 1, marked: "2", correct: true, earned: 2, absent: false }, { no: 2, marked: "1", correct: false, earned: 0, absent: false }] }),
    report({ studentKey: "2", questions: [], items: [] }), // 문항이 비어 온 옛 성적표
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].questions.map((q) => q.no), [1, 2], "문항이 있는 성적표에서 가져온다");
  assert.deepEqual(groups[0].classRates, { 1: 100, 2: 0 });
  for (const s of groups[0].students) assert.equal("questions" in s, false, "학생 줄에는 문항 정보가 없다");
});

test("시험은 최근 것이 위, 학생은 석차 순", () => {
  const groups = groupByExam([
    report({ examId: "aug", examTitle: "8월", examDate: "2026-08-08", studentKey: "1" }),
    report({ examId: "sep", examTitle: "9월", examDate: "2026-09-12", studentKey: "1", rank: 5, studentName: "박새롬" }),
    report({ examId: "sep", examTitle: "9월", examDate: "2026-09-12", studentKey: "2", rank: 1, studentName: "강여울" }),
    report({ examId: "sep", examTitle: "9월", examDate: "2026-09-12", studentKey: "3", rank: 5, studentName: "김하늘" }),
  ]);
  assert.deepEqual(groups.map((g) => g.examTitle), ["9월", "8월"]);
  assert.deepEqual(groups[0].students.map((s) => s.studentName), ["강여울", "김하늘", "박새롬"]);
});
