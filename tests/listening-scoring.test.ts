/**
 * 듣기 미응시 채점 — 안 본 학생은 반 평균을 받고, 평균의 분모에서는 빠진다.
 *
 * 실행: npm test
 *
 * 여기서 틀리면 두 가지가 생긴다. 듣기를 안 본 학생 때문에 반의 듣기 평균과
 * 문항별 정답률이 움직이거나(안 본 사람이 평균을 끌어내린다), 안 본 학생의
 * 듣기 점수가 0점이나 엉뚱한 값으로 성적표에 실린다.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { OmrScan } from "../lib/omr-scans";
import { scoreExam } from "../lib/omr-scoring";
import type { OmrExam } from "../lib/omr-types";
import { EMPTY_REVIEW } from "../lib/review";

/** 20문항 토모 — 1~5번이 듣기, 6~20번이 독해, 배점은 균등(5점) */
function exam(over: Partial<OmrExam> = {}): OmrExam {
  const questionMeta: OmrExam["questionMeta"] = {};
  const answerKey: OmrExam["answerKey"] = {};
  for (let q = 1; q <= 20; q += 1) {
    questionMeta[String(q)] = { area: q <= 5 ? "듣기" : "독해" };
    answerKey[String(q)] = 1;
  }
  return {
    id: "exam-1", examType: "saturday", reportFamily: "B_english", title: "토모", subject: null, examDate: null,
    numQuestions: 20, numChoices: 5, idDigits: 5, omrStyle: "exam", omrConfig: {}, answerKey, points: {},
    questionMeta, mockReference: null, gradeCuts: [], useTeacherComment: false, createdByName: null,
    createdByUsername: null, createdAt: "", classNames: [], level: null, periodMonth: null, cohortMode: "class",
    review: EMPTY_REVIEW, ...over,
  };
}

/** 답안지 — 문항별 표기(1이 정답). null 은 빈칸 */
function scan(id: string, marks: Array<number | null>, listeningMode: OmrScan["listeningMode"] = null): OmrScan {
  const answers: Record<string, number | null> = {};
  marks.forEach((m, i) => { answers[String(i + 1)] = m; });
  return {
    id, examId: "exam-1", filename: `${id}.jpg`, scanPath: null, previewPath: null, studentId: id, studentIdQr: id,
    studentIdBubbles: id, answers, essayScores: {}, essayAnswers: {}, essayCrops: {}, reviewFlags: [], readConfidence: null,
    status: "reviewed", reviewedBy: "auto", readError: null, listeningMode, createdAt: "", updatedAt: "",
  } as unknown as OmrScan;
}

const all1 = (n: number) => Array.from({ length: n }, () => 1);
// A: 전부 정답. B: 듣기 3·4·5번 오답. C: 듣기 전부 빈칸(미응시), 독해 20번 오답
const A = scan("A", all1(20));
const B = scan("B", [1, 1, 2, 2, 2, ...all1(15)]);
const C = scan("C", [null, null, null, null, null, ...all1(14), 3]);

test("듣기를 안 본 학생의 듣기 점수는 '본 학생들만의 평균' — 분모에서 빠진다", () => {
  const { scored, listening, itemRates } = scoreExam(exam(), [A, B, C]);
  const [a, b, c] = scored;
  assert.deepEqual(listening, { questions: [1, 2, 3, 4, 5], mean: 17.5, possible: 25, takers: 2, absent: 1 });
  assert.equal(c.listeningAbsent, true);
  assert.equal(a.listeningAbsent, false);
  assert.equal(b.listeningAbsent, false);
  // C 독해 14문항 × 5점 = 70 + 듣기 평균 17.5
  assert.equal(c.raw, 87.5);
  assert.equal(c.objectiveRaw, 87.5);
  assert.equal(a.raw, 100);
  assert.equal(b.raw, 85);
  // 듣기 문항 정답률은 A·B 둘만으로 — C 가 끼면 1번이 67%가 된다
  assert.equal(itemRates[1], 100);
  assert.equal(itemRates[3], 50);
  assert.equal(itemRates[20], 67, "독해는 셋 모두가 분모(2/3)");
});

test("안 본 학생의 듣기 문항은 맞음도 틀림도 무응답도 아니다 — 미응시", () => {
  const { scored } = scoreExam(exam(), [A, B, C]);
  const c = scored[2];
  const listeningItems = c.items.filter((it) => it.no <= 5);
  assert.ok(listeningItems.every((it) => it.absent === true && !it.correct && it.earned === 0 && it.marked === null));
  assert.ok(c.items.filter((it) => it.no > 5).every((it) => !it.absent));
  assert.equal(c.blankCount, 0, "빈 듣기 문항을 무응답으로 세지 않는다");
  assert.equal(c.wrongCount, 1);
  assert.equal(c.correctCount, 14);
  assert.ok(c.weakItems.every((no) => no > 5), "우선 복습에 듣기 문항이 끼면 안 된다");
});

test("영역별 — 안 본 학생의 듣기는 평균값(estimated), 본 학생들의 듣기 반 평균도 둘만으로", () => {
  const { scored } = scoreExam(exam(), [A, B, C]);
  const [a, , c] = scored;
  const cListening = c.areas.find((s) => s.area === "듣기");
  assert.deepEqual(cListening, { area: "듣기", earned: 17.5, possible: 25, rate: 70, cohortRate: 70, cohortEarned: 17.5, estimated: true });
  const aListening = a.areas.find((s) => s.area === "듣기");
  assert.equal(aListening?.cohortEarned, 17.5, "C 를 분모에 넣으면 11.7 이 된다");
  assert.equal(aListening?.estimated, undefined);
  const cReading = c.areas.find((s) => s.area === "독해");
  assert.equal(cReading?.earned, 70);
  assert.equal(cReading?.cohortEarned, 73.3, "독해 반 평균은 셋 모두로 (75+75+70)/3");
});

test("석차·표준점수는 평균을 받은 점수로 — C 는 B 보다 앞", () => {
  const { scored, cohort } = scoreExam(exam(), [A, B, C]);
  assert.deepEqual(scored.map((s) => `${s.studentKey}:${s.rank}`), ["A:1", "B:3", "C:2"]);
  assert.equal(cohort.count, 3);
  assert.equal(cohort.mean, 90.8);
});

test("선생님이 '듣기 봤음'으로 바꾸면 마킹한 대로 — 빈칸은 무응답, 평균 분모에도 들어간다", () => {
  const { scored, listening } = scoreExam(exam(), [A, B, scan("C", [null, null, null, null, null, ...all1(14), 3], "marked")]);
  const c = scored[2];
  assert.equal(c.listeningAbsent, false);
  assert.equal(c.raw, 70);
  assert.equal(c.blankCount, 5);
  assert.ok(c.items.slice(0, 5).every((it) => !it.absent));
  assert.deepEqual(listening, { questions: [1, 2, 3, 4, 5], mean: 11.7, possible: 25, takers: 3, absent: 0 });
});

test("듣기를 본 사람이 하나도 없으면 평균은 0 — 모르는 값을 지어내지 않는다", () => {
  const { scored, listening } = scoreExam(exam(), [C]);
  assert.equal(listening?.mean, 0);
  assert.equal(listening?.takers, 0);
  assert.equal(scored[0].raw, 70);
});

test("토모가 아닌 시험은 예전 그대로 — 빈 듣기 문항은 무응답이고 평균 산출이 없다", () => {
  const { scored, listening } = scoreExam(exam({ examType: "monthly", reportFamily: "C_generic" }), [A, B, C]);
  assert.equal(listening, null);
  const c = scored[2];
  assert.equal(c.listeningAbsent, false);
  assert.equal(c.raw, 70);
  assert.equal(c.blankCount, 5);
});
