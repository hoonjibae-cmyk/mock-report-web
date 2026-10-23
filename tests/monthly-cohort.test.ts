/**
 * 월말평가 비교 집단 — 레벨·시행월 유추와 '같은 레벨 평균'에 합칠 시험 고르기.
 *
 * 실행: npm test
 *
 * 여기서 틀리면 다른 선생님 반이나 다른 달 시험이 평균에 섞여 들어가거나, 같은
 * 레벨의 내 다른 반이 빠진다. 둘 다 성적표의 평균·석차가 조용히 틀리는 일이다.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  cohortNoteFor,
  inferLevel,
  inferPeriodMonth,
  levelOfClassName,
  levelSiblings,
  samePaper,
} from "../lib/monthly-cohort";
import type { OmrExam } from "../lib/omr-types";
import { EMPTY_REVIEW } from "../lib/review";

function exam(over: Partial<OmrExam> = {}): OmrExam {
  const answerKey: OmrExam["answerKey"] = {};
  for (let q = 1; q <= 20; q += 1) answerKey[String(q)] = (q % 5) + 1;
  return {
    id: over.id ?? "e1", examType: "monthly", reportFamily: "C_generic", title: "10월 월말평가 · 영어", subject: null,
    examDate: null, numQuestions: 20, numChoices: 5, idDigits: 5, omrStyle: "exam", omrConfig: {}, answerKey, points: {},
    questionMeta: {}, mockReference: null, gradeCuts: [], useTeacherComment: true, createdByName: "김선생",
    createdByUsername: "kim", createdAt: "2026-10-20T01:00:00.000Z", classNames: ["M4 화목 R"], level: null,
    periodMonth: null, cohortMode: "class", review: EMPTY_REVIEW, ...over,
  };
}

test("반 이름에서 레벨을 뗀다 — 요일 앞까지", () => {
  assert.equal(levelOfClassName("M4 화목 R"), "M4");
  assert.equal(levelOfClassName("M4 수금 S"), "M4");
  assert.equal(levelOfClassName("M4S 화목"), "M4S");
  assert.equal(levelOfClassName("중2 유클래스A 월수 H"), "중2 유클래스A");
  assert.equal(levelOfClassName("고등 입학반 수금"), "고등 입학반");
  assert.equal(levelOfClassName("윤슬중3 월수 K"), "윤슬중3");
  assert.equal(levelOfClassName("M4화목R"), "M4", "붙여 쓴 요일");
  assert.equal(levelOfClassName("  M7  월수금  P "), "M7", "띄어쓰기는 흔들려도 된다");
  // 요일이 없으면 이름 전체가 레벨이다
  assert.equal(levelOfClassName("중3A"), "중3A");
  assert.equal(levelOfClassName("BEYOND Plus"), "BEYOND Plus");
  assert.equal(levelOfClassName(""), "");
  assert.equal(levelOfClassName(null), "");
});

test("레벨은 적혀 있으면 그것, 없으면 반 이름, 그것도 없으면 제목에서", () => {
  assert.equal(inferLevel(exam({ level: " M5 " })), "M5");
  assert.equal(inferLevel(exam()), "M4");
  assert.equal(inferLevel(exam({ classNames: [] , title: "10월 월말평가 · 중2" })), "중2");
  assert.equal(inferLevel(exam({ classNames: [], title: "4월 월말평가 - M7A" })), "M7A");
});

test("시행월은 제목의 'N월'을 우선 쓰고 연도는 시험일·만든 날에서 가져온다", () => {
  assert.equal(inferPeriodMonth(exam({ periodMonth: "2026-09" })), "2026-09", "적혀 있으면 그대로");
  assert.equal(inferPeriodMonth(exam()), "2026-10");
  // 제목이 11월인데 10월 20일에 만들었다 — 미리 만든 11월 시험
  assert.equal(inferPeriodMonth(exam({ title: "11월 월말평가" })), "2026-11");
  // 시험일이 있으면 만든 날보다 시험일의 연도를 믿는다
  assert.equal(inferPeriodMonth(exam({ title: "3월 월말평가", examDate: "2027-03-27" })), "2027-03");
  // 해가 바뀌는 자리 — 12월 시험을 1월에 만들었으면 지난해 12월, 1월 시험을 12월에 만들었으면 이듬해 1월
  assert.equal(inferPeriodMonth(exam({ title: "12월 월말평가", createdAt: "2027-01-05T00:00:00.000Z" })), "2026-12");
  assert.equal(inferPeriodMonth(exam({ title: "1월 월말평가", createdAt: "2026-12-28T00:00:00.000Z" })), "2027-01");
  // 제목에 달이 없으면 시험일, 그것도 없으면 만든 날
  assert.equal(inferPeriodMonth(exam({ title: "중간 점검", examDate: "2026-08-14" })), "2026-08");
  assert.equal(inferPeriodMonth(exam({ title: "중간 점검" })), "2026-10");
  assert.equal(inferPeriodMonth(exam({ title: "중간 점검", createdAt: "" })), "");
});

test("같은 시험지 — 문항 수·정답·배점이 모두 같아야 한다", () => {
  const a = exam();
  assert.ok(samePaper(a, exam({ id: "e2" })));
  assert.ok(!samePaper(a, exam({ id: "e2", numQuestions: 25 })));
  assert.ok(!samePaper(a, exam({ id: "e2", answerKey: { ...a.answerKey, "3": 5 } })));
  assert.ok(!samePaper(a, exam({ id: "e2", points: { "1": 10 } })));
  // 정답을 아직 안 넣은 시험은 합칠 수 없다
  assert.ok(!samePaper(a, exam({ id: "e2", answerKey: {} })));
  // '모두 고르기' 정답은 집합으로 비교한다
  assert.ok(samePaper(exam({ answerKey: { ...a.answerKey, "1": [1, 3] } }), exam({ id: "e2", answerKey: { ...a.answerKey, "1": [3, 1] } })));
});

test("같은 레벨·같은 달·같은 담임·같은 시험지만 레벨 평균에 들어간다", () => {
  const board = new Map<string, string>([
    ["M4 화목 R", "김선생"], ["M4 월수 R", "김선생"], ["M4 수금 P", "박선생"], ["M5 화목 R", "김선생"],
  ]);
  const mine = exam();
  const all: OmrExam[] = [
    mine,
    exam({ id: "same", classNames: ["M4 월수 R"] }),                                     // 포함
    exam({ id: "other-teacher", classNames: ["M4 수금 P"], createdByName: "박선생" }),      // 담임 다름
    exam({ id: "other-level", classNames: ["M5 화목 R"] }),                              // 레벨 다름 → 후보 아님
    exam({ id: "other-month", classNames: ["M4 월수 R"], title: "9월 월말평가" }),         // 달 다름 → 후보 아님
    exam({ id: "other-paper", classNames: ["M4 월수 R"], numQuestions: 25 }),             // 시험지 다름
    exam({ id: "placement", classNames: ["M4 월수 R"], examType: "placement" }),          // 유형 다름 → 후보 아님
    // 반 현황에 없는 반(폐반) — 만든 사람으로 담임을 본다. 김선생이 만들었으니 포함
    exam({ id: "closed-class", classNames: ["M4 수금 R"] }),
  ];
  const result = levelSiblings(mine, all, board);
  assert.deepEqual(
    result.map((s) => [s.exam.id, s.included, s.reason ?? ""]),
    [
      ["same", true, ""],
      ["other-teacher", false, "담임이 다른 반"],
      ["other-paper", false, "문항 수·정답·배점이 달라 같은 시험지가 아님"],
      ["closed-class", true, ""],
    ],
  );
  // 레벨을 손으로 적어 두면 그 값으로 맞춘다 — 반 이름이 달라도
  const renamed = exam({ id: "renamed", classNames: ["중2 심화 화목 R"], level: "M4" });
  assert.equal(levelSiblings(mine, [mine, renamed], board).find((s) => s.exam.id === "renamed")?.included, true);
});

test("비교 집단 설명 — 반 평균이면 우리 반, 레벨 평균이면 합친 반들을 적는다", () => {
  const mine = exam({ cohortMode: "level" });
  assert.equal(cohortNoteFor(exam(), []), "우리 반 기준 — M4 화목 R");
  assert.equal(cohortNoteFor(mine, []), "우리 반 기준 — M4 화목 R", "합칠 시험이 없으면 반 평균과 같다");
  assert.equal(
    cohortNoteFor(mine, [exam({ id: "e2", classNames: ["M4 월수 R"] })]),
    "같은 레벨(M4) 2개 반 기준 — M4 화목 R, M4 월수 R",
  );
});
