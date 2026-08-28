/**
 * 주관식 묶음 채점 테스트.
 *
 * 실행: npm test
 *
 * 여기서 틀리면 학생 점수가 잘못 매겨진다. 특히 "자동으로 넘겨도 되는가"를
 * 촘촘히 본다 — 오답 자동 판정은 학생 손해로 직결되므로 절대 나오면 안 된다.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  applyGroupScore,
  autoGrade,
  essayProgress,
  groupEssayAnswers,
  matchesAccepted,
  normalizeEssay,
  parseAcceptedAnswers,
  type EssayAnswer,
} from "../lib/essay-grading";

const KEY = ["He is looking forward to seeing you.", "He's looking forward to seeing you."];

function a(scanId: string, text: string): EssayAnswer {
  return { scanId, studentId: scanId, text };
}

test("정오와 무관한 흔들림은 같은 답으로 본다", () => {
  // 손글씨 전사에서 대소문자·공백·따옴표 모양·끝 마침표는 답의 옳고 그름과 무관하다
  const base = normalizeEssay("He is looking forward to seeing you.");
  assert.equal(normalizeEssay("he is looking forward to seeing you"), base);
  assert.equal(normalizeEssay("  He  is looking   forward to seeing you.  "), base);
  assert.equal(normalizeEssay("He is looking forward to seeing you!"), base);
  assert.equal(normalizeEssay("He’s looking forward to seeing you."), normalizeEssay("He's looking forward to seeing you"));
});

test("철자와 단어는 건드리지 않는다 — 그건 채점 대상이다", () => {
  assert.notEqual(normalizeEssay("looking foward"), normalizeEssay("looking forward"));
  assert.notEqual(normalizeEssay("to see you"), normalizeEssay("to seeing you"));
});

test("허용 답안은 | 로 여러 개 적는다", () => {
  assert.deepEqual(parseAcceptedAnswers("A. | B."), ["A.", "B."]);
  assert.deepEqual(parseAcceptedAnswers(""), []);
  // 양식이 기본으로 넣어 두는 자리표시자는 정답이 아니다
  assert.deepEqual(parseAcceptedAnswers("서술형"), []);
  assert.deepEqual(parseAcceptedAnswers("A | A | B"), ["A", "B"]);
});

test("허용 답안 중 하나와 맞으면 정답", () => {
  assert.ok(matchesAccepted("he's looking forward to seeing you", KEY));
  assert.ok(matchesAccepted("He is looking forward to seeing you.", KEY));
  assert.ok(!matchesAccepted("He is looking forward to see you.", KEY));
  assert.ok(!matchesAccepted("", KEY));
  // 정답을 입력하지 않았으면 무엇도 정답으로 볼 수 없다
  assert.ok(!matchesAccepted("아무 말", []));
});

test("같은 답끼리 묶고, 채점하기 좋은 순서로 세운다", () => {
  const groups = groupEssayAnswers(
    [
      a("s1", "He is looking forward to see you."),
      a("s2", "He is looking forward to seeing you."),
      a("s3", "He is looking forward to see you."),
      a("s4", ""),
      a("s5", "he's looking forward to seeing you"),
      a("s6", "He is looking forward to see you."),
    ],
    KEY,
  );

  // 6명 → 4묶음. 'He is'와 "He's"는 둘 다 정답이지만 서로 다른 답안이라
  // 따로 묶인다(둘 다 자동 처리되므로 채점 손이 더 가지는 않는다).
  assert.equal(groups.length, 4);
  // 정답 묶음이 먼저, 그다음 사람 수 많은 순, 백지는 맨 뒤
  assert.ok(groups[0].matchesKey);
  assert.ok(groups[1].matchesKey);
  assert.equal(groups[2].members.length, 3); // 같은 오답 3명
  assert.ok(!groups[2].matchesKey);
  assert.ok(groups[3].blank);
});

test("대소문자·마침표만 다른 답은 한 묶음으로 합쳐진다", () => {
  const groups = groupEssayAnswers(
    [a("s1", "He is looking forward to seeing you."), a("s2", "he is looking forward to seeing you")],
    KEY,
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0].members.length, 2);
});

test("대표 원문은 그 묶음에서 가장 흔한 표기를 쓴다", () => {
  const groups = groupEssayAnswers(
    [a("s1", "I am fine"), a("s2", "I am fine"), a("s3", "i am fine")],
    [],
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0].text, "I am fine");
});

test("정답과 정확히 일치하는 묶음만 자동으로 만점 처리한다", () => {
  const groups = groupEssayAnswers(
    [a("s1", "He's looking forward to seeing you"), a("s2", "He is looking forward to see you.")],
    KEY,
  );
  const result = autoGrade(groups, 4);
  assert.deepEqual(result.scores, { s1: 4 });
  assert.equal(result.autoKeys.length, 1);
  assert.equal(result.pending.length, 1);
});

test("오답으로 보이는 답안을 자동으로 0점 처리하지 않는다", () => {
  // 전사가 틀렸는지 학생이 틀렸는지 구분할 수 없다. 점수를 깎는 판정은 사람이 한다.
  const groups = groupEssayAnswers([a("s1", "He is looking forward to see you.")], KEY);
  const result = autoGrade(groups, 4);
  assert.deepEqual(result.scores, {}, "오답을 자동으로 채점하면 안 된다");
  assert.equal(result.pending.length, 1);
});

test("백지도 자동으로 0점 처리하지 않는다", () => {
  // 학생이 안 쓴 것과 우리가 못 읽은 것을 구분할 수 없다.
  const groups = groupEssayAnswers([a("s1", ""), a("s2", "   ")], KEY);
  const result = autoGrade(groups, 4);
  assert.deepEqual(result.scores, {});
  assert.equal(result.pending.length, 1);
  assert.ok(result.pending[0].blank);
});

test("정답을 입력하지 않았으면 아무것도 자동 처리하지 않는다", () => {
  const groups = groupEssayAnswers([a("s1", "He is looking forward to seeing you.")], []);
  assert.deepEqual(autoGrade(groups, 4).scores, {});
});

test("묶음에 매긴 점수는 그 묶음 전원에게 같이 간다", () => {
  const groups = groupEssayAnswers([a("s1", "부분 정답"), a("s2", "부분 정답")], []);
  assert.deepEqual(applyGroupScore(groups[0], 2, 4), { s1: 2, s2: 2 });
  // 배점을 넘기거나 음수면 범위 안으로 맞춘다
  assert.deepEqual(applyGroupScore(groups[0], 99, 4), { s1: 4, s2: 4 });
  assert.deepEqual(applyGroupScore(groups[0], -3, 4), { s1: 0, s2: 0 });
  // 소수점 첫째 자리까지(부분점수 0.5 등)
  assert.deepEqual(applyGroupScore(groups[0], 1.55, 4), { s1: 1.6, s2: 1.6 });
});

test("진행 상황은 묶음이 아니라 학생 수로도 센다", () => {
  const groups = groupEssayAnswers(
    [a("s1", "A"), a("s2", "A"), a("s3", "B"), a("s4", "C")],
    [],
  );
  const progress = essayProgress(groups, { s1: 4, s2: 4, s3: undefined, s4: 1 });
  assert.equal(progress.total, 4);
  assert.equal(progress.graded, 3);
  assert.equal(progress.groups, 3);
  assert.equal(progress.gradedGroups, 2); // A묶음(2명)과 C묶음(1명)만 완료
});
