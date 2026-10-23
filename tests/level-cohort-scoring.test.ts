/**
 * 레벨 평균 채점 — 다른 반 답안지는 집단(평균·석차·정답률)에만 들어가고, 성적표는
 * 이 시험의 학생에게만 만든다.
 *
 * 실행: npm test
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { OmrScan } from "../lib/omr-scans";
import { scoreExam } from "../lib/omr-scoring";
import type { OmrExam } from "../lib/omr-types";
import { EMPTY_REVIEW } from "../lib/review";

/** 4문항 · 균등 배점(25점) · 정답은 전부 1 */
function exam(): OmrExam {
  return {
    id: "mine", examType: "monthly", reportFamily: "C_generic", title: "10월 월말평가", subject: null, examDate: null,
    numQuestions: 4, numChoices: 5, idDigits: 5, omrStyle: "exam", omrConfig: {}, answerKey: { "1": 1, "2": 1, "3": 1, "4": 1 },
    points: {}, questionMeta: { "1": { area: "문법" }, "2": { area: "문법" }, "3": { area: "독해" }, "4": { area: "독해" } },
    mockReference: null, gradeCuts: [], useTeacherComment: true, createdByName: "김선생", createdByUsername: "kim",
    createdAt: "", classNames: ["M4 화목 R"], level: null, periodMonth: null, cohortMode: "level", review: EMPTY_REVIEW,
  };
}

function scan(id: string, examId: string, marks: number[]): OmrScan {
  const answers: Record<string, number> = {};
  marks.forEach((m, i) => { answers[String(i + 1)] = m; });
  return {
    id, examId, filename: `${id}.jpg`, scanPath: null, previewPath: null, studentId: id, studentIdQr: null,
    studentIdBubbles: id, answers, essayScores: {}, essayScoreSources: {}, essayAnswers: {}, essayCrops: {}, reviewFlags: [],
    readConfidence: null, status: "reviewed", reviewedBy: "auto", listeningMode: null, readError: null, createdAt: "", updatedAt: "",
  };
}

// 우리 반: A 100점, B 50점. 다른 반(같은 레벨): P 75점, Q 25점
const A = scan("A", "mine", [1, 1, 1, 1]);
const B = scan("B", "mine", [1, 1, 2, 2]);
const P = scan("P", "other", [1, 1, 1, 2]);
const Q = scan("Q", "other", [1, 2, 2, 2]);

test("반 평균만 — 지금까지와 같다", () => {
  const { cohort, scored } = scoreExam(exam(), [A, B]);
  assert.deepEqual(cohort, { count: 2, mean: 75, stdev: 25, max: 100, min: 50 });
  assert.deepEqual(scored.map((s) => [s.scanId, s.rank]), [["A", 1], ["B", 2]]);
});

test("레벨 평균 — 다른 반 답안지가 평균·석차·정답률의 분모에 들어가고 결과는 우리 반만", () => {
  const { cohort, scored, itemRates } = scoreExam(exam(), [A, B], { peerScans: [P, Q] });
  // 100 · 50 · 75 · 25 → 평균 62.5
  assert.equal(cohort.count, 4);
  assert.equal(cohort.mean, 62.5);
  assert.equal(cohort.max, 100);
  assert.equal(cohort.min, 25);
  // 성적표는 우리 반 둘에게만 — 석차는 넷 가운데서
  assert.deepEqual(scored.map((s) => [s.scanId, s.rank, s.topPercent]), [["A", 1, 25], ["B", 3, 75]]);
  // 3번 문항은 넷 중 A·P 둘이 맞혔다
  assert.equal(itemRates[3], 50);
  // 영역 평균도 넷으로 — 독해(3·4번) 득점 A 50 · B 0 · P 25 · Q 0 → 평균 18.75 / 50점 = 37.5%
  const reading = scored[1].areas.find((a) => a.area === "독해")!;
  assert.equal(reading.cohortRate, 37.5);
  assert.equal(reading.cohortEarned, 18.8);
});

test("같은 답안지가 양쪽에 들어와도 두 번 세지 않는다", () => {
  const { cohort } = scoreExam(exam(), [A, B], { peerScans: [A, P] });
  assert.equal(cohort.count, 3);
});
