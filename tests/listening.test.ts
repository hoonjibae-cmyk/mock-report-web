/**
 * 듣기 미응시 판별 규칙.
 *
 * 실행: npm test
 *
 * 여기서 틀리면 듣기를 본 학생이 '안 봄'으로 잡혀 점수가 평균으로 바뀌거나,
 * 안 본 학생이 0점 처리된 채 성적표가 나간다. 둘 다 학부모에게 간 뒤에야 드러난다.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  isListeningAbsentCandidate,
  listeningMarkedCount,
  listeningQuestions,
  listeningRangeLabel,
  resolveListeningMode,
  type ListeningScanLike,
} from "../lib/listening";
import type { OmrExam } from "../lib/omr-types";

type ExamLike = Pick<OmrExam, "examType" | "numQuestions" | "questionMeta">;

const tomo: ExamLike = { examType: "saturday", numQuestions: 45, questionMeta: {} };
const monthly: ExamLike = { examType: "monthly", numQuestions: 45, questionMeta: {} };

/** 1~17번 중 n문항만 표기한 답안지 */
function scan(markedListening: number, listeningMode: ListeningScanLike["listeningMode"] = null): ListeningScanLike {
  const answers: Record<string, number | null> = {};
  for (let q = 1; q <= 45; q += 1) answers[String(q)] = q <= 17 ? (q <= markedListening ? 3 : null) : 2;
  return { answers, listeningMode };
}

test("영역을 안 적어 둔 토모는 1~17번이 듣기 — 다른 유형은 이 기능을 타지 않는다", () => {
  assert.deepEqual(listeningQuestions(tomo), Array.from({ length: 17 }, (_, i) => i + 1));
  assert.deepEqual(listeningQuestions(monthly), []);
  assert.equal(listeningRangeLabel(tomo), "1~17번");
  assert.equal(listeningRangeLabel(monthly), "");
});

test("문항 분류에 '듣기'를 적어 두었으면 그 문항들이 듣기다", () => {
  const tagged: ExamLike = {
    examType: "saturday",
    numQuestions: 30,
    questionMeta: { "1": { area: "듣기" }, "2": { area: " 듣기 " }, "3": { area: "독해" }, "20": { area: "듣기" } },
  };
  assert.deepEqual(listeningQuestions(tagged), [1, 2, 20]);
});

test("듣기 17문항 중 15문항 이상이 비어 있으면 미응시 후보 — 14문항이면 아니다", () => {
  assert.equal(listeningMarkedCount(tomo, scan(2)), 2);
  assert.equal(isListeningAbsentCandidate(tomo, scan(0)), true, "전부 빈 답안지");
  assert.equal(isListeningAbsentCandidate(tomo, scan(2)), true, "2문항만 칠해져도(15문항 비면) 후보");
  assert.equal(isListeningAbsentCandidate(tomo, scan(3)), false, "3문항 칠했으면(14문항 빔) 본 것으로");
  assert.equal(isListeningAbsentCandidate(tomo, scan(17)), false);
});

test("다른 유형은 듣기가 다 비어 있어도 후보가 아니다", () => {
  assert.equal(isListeningAbsentCandidate(monthly, scan(0)), false);
  assert.equal(resolveListeningMode(monthly, scan(0)), null);
});

test("채점 방식 — 선생님이 정한 값이 먼저, 없으면 후보는 '안 봄', 아니면 '마킹한 대로'", () => {
  assert.equal(resolveListeningMode(tomo, scan(0)), "absent", "기본값은 반 평균으로 산출");
  assert.equal(resolveListeningMode(tomo, scan(17)), "marked");
  assert.equal(resolveListeningMode(tomo, scan(0, "marked")), "marked", "선생님이 '듣기 봤음'으로 바꾸면 마킹한 대로");
  assert.equal(resolveListeningMode(tomo, scan(17, "absent")), "absent", "선생님이 '안 봤음'으로 정하면 다 칠해져 있어도 평균으로");
});
