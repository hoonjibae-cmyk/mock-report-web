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
  groupByExam,
  homeroomKey,
  latestPerStudent,
  summarizeClass,
  teacherCanSeeExamType,
  type HomeroomReport,
} from "../lib/homeroom";
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
    active: true,
    viewCount: 0,
    createdAt: "2026-09-12T10:00:00.000Z",
    ...over,
  };
}

test("이름 열쇠 — 공백과 대소문자 차이는 같은 사람으로 본다", () => {
  assert.equal(homeroomKey("김 선생"), homeroomKey("김선생"));
  assert.equal(homeroomKey(" Kim Teacher "), homeroomKey("kimteacher"));
  assert.notEqual(homeroomKey("김선생"), homeroomKey("이선생"));
  assert.equal(homeroomKey(null), "", "담임이 비어 있으면 아무하고도 맞지 않아야 한다");
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
