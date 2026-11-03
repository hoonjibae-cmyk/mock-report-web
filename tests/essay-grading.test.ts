/**
 * 주관식 묶음 채점 테스트.
 *
 * 실행: npm test
 *
 * 여기서 틀리면 학생 점수가 잘못 매겨진다. 특히 "자동 채점이 선생님 점수를
 * 덮어쓰는가"를 촘촘히 본다 — 자동 0점은 우선 판정이고, 사람이 매긴 점수가
 * 다시 돌린 자동 채점에 지워지면 학생 손해로 직결된다.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  applyGroupScore,
  autoGrade,
  autoVerdict,
  clampEssayScore,
  essayCellGraded,
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

test("자동 채점 — 정답과 일치하면 만점, 오답으로 보이면 우선 0점", () => {
  const groups = groupEssayAnswers(
    [a("s1", "He's looking forward to seeing you"), a("s2", "He is looking forward to see you.")],
    KEY,
  );
  const result = autoGrade(groups, 4, { accepted: KEY });
  assert.deepEqual(result.scores, { s1: 4, s2: 0 });
  assert.equal(result.autoKeys.length, 1, "만점 묶음");
  assert.equal(result.zeroKeys.length, 1, "0점 묶음 — 화면에서 확인 필요로 보인다");
  assert.equal(result.pending.length, 0);
  assert.equal(result.kept, 0);
});

test("백지는 정답이 없어도 0점이다", () => {
  const groups = groupEssayAnswers([a("s1", ""), a("s2", "   ")], []);
  const result = autoGrade(groups, 4, { accepted: [] });
  assert.deepEqual(result.scores, { s1: 0, s2: 0 });
  assert.deepEqual(result.zeroKeys, [""]);
});

test("정답을 입력하지 않았으면 쓰여 있는 답안은 판단하지 않는다 — 사람에게 남긴다", () => {
  // '오답으로 보인다'는 정답이 있어야 할 수 있는 말이다.
  const groups = groupEssayAnswers([a("s1", "He is looking forward to seeing you."), a("s2", "")], []);
  const result = autoGrade(groups, 4, { accepted: [] });
  assert.deepEqual(result.scores, { s2: 0 }, "백지만 0점");
  assert.equal(result.pending.length, 1);
  assert.equal(result.pending[0].members[0].scanId, "s1");
});

test("선생님이 매긴 점수는 자동 채점이 덮어쓰지 않고, 자동 점수는 다시 매긴다", () => {
  // 오답으로 보이던 묶음에 선생님이 부분점수를 줬다. 자동 채점을 다시 돌려도 그대로여야 한다.
  // 반면 자동으로 0점이던 학생은 정답을 고친 뒤 다시 돌리면 그에 맞게 바뀐다.
  const groups = groupEssayAnswers(
    [a("s1", "He is looking forward to see you."), a("s2", "He is looking forward to see you."), a("s3", "")],
    KEY,
  );
  const result = autoGrade(groups, 4, {
    accepted: KEY,
    current: { s1: { score: 2, source: "teacher" }, s2: { score: 0, source: "auto" } },
  });
  assert.deepEqual(result.scores, { s2: 0, s3: 0 }, "s1 은 건드리지 않는다");
  assert.equal(result.kept, 1);
  // 같은 묶음에서 한 명은 선생님 점수, 한 명은 자동 — 묶음은 0점 묶음으로 센다
  assert.deepEqual(result.zeroKeys.sort(), ["", "he is looking forward to see you"].sort());
});

test("한 답안의 자동 판정 — 일치 만점 · 백지 0점 · 정답 있고 다르면 0점 · 정답 없으면 모름", () => {
  assert.equal(autoVerdict("he's looking forward to seeing you", KEY, 4), 4);
  assert.equal(autoVerdict("", KEY, 4), 0);
  assert.equal(autoVerdict("  ", [], 4), 0, "백지는 정답이 없어도 0점");
  assert.equal(autoVerdict("He is looking forward to see you.", KEY, 4), 0);
  assert.equal(autoVerdict("He is looking forward to see you.", [], 4), null, "정답이 없으면 판단하지 않는다");
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

test("만점은 배점을 그대로 저장한다 — 반올림하면 총점이 100점에 못 미친다", () => {
  // 배점을 지정하지 않으면 100점을 문항 수로 나눈다(예: 100/45 = 2.222…).
  // 만점을 2.2로 저장하면 45문항을 다 맞혀도 99점이 된다.
  const point = 100 / 45;
  const groups = groupEssayAnswers([a("s1", "정답")], []);
  assert.deepEqual(applyGroupScore(groups[0], point, point), { s1: point });
  // 배점을 넘겨 눌러도 배점 그대로
  assert.deepEqual(applyGroupScore(groups[0], 99, point), { s1: point });
  // 부분점수는 소수점 첫째 자리로 정리
  assert.deepEqual(applyGroupScore(groups[0], point / 2, point), { s1: 1.1 });
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

test("정답에서 글자 종류를 알아내 전사에 힌트로 준다", async () => {
  // 한글은 구별할 음절이 2,000자를 넘어 영문보다 오독이 잦다.
  // 어느 글자로 쓰인 답인지 미리 알려 주면 후보가 줄어든다.
  const { scriptOf } = await import("../lib/omr-transcribe");
  assert.equal(scriptOf(["He is looking forward to seeing you."]), "latin");
  assert.equal(scriptOf(["그는 너를 만나기를 고대하고 있다."]), "hangul");
  assert.equal(scriptOf(["to부정사"]), "mixed");
  // 정답을 입력하지 않았으면 알 수 없다 — 힌트 없이 전사한다
  assert.equal(scriptOf([]), null);
  assert.equal(scriptOf(["123", "!!"]), null);
});

test("판독이 불확실한 답안은 같은 글이라도 확실한 답안과 따로 묶이고, 묶음 순서는 정답 → 불확실 → 나머지 → 백지", () => {
  const groups = groupEssayAnswers(
    [
      a("s1", "He is looking forward to see you."),
      { ...a("s2", "He is looking forward to see you."), unclear: true },
      a("s3", ""),
      { ...a("s4", ""), unclear: true },
      a("s5", "He's looking forward to seeing you"),
    ],
    KEY,
  );
  // s1 과 s2 는 글이 같지만 따로, s3(백지)과 s4(못 읽음)도 따로 → 5묶음
  assert.equal(groups.length, 5);
  assert.ok(groups[0].matchesKey, "정답 묶음이 먼저");
  assert.ok(groups[1].unclear && groups[2].unclear, "불확실 묶음이 그다음");
  assert.ok(!groups[3].unclear && !groups[3].blank, "확실한 오답");
  assert.ok(groups[4].blank && !groups[4].unclear, "확실한 백지만 맨 뒤");
  // 불확실하게 읽힌 빈칸은 '백지'가 아니다 — 백지일 수도, 못 알아본 것일 수도 있다
  const unclearBlank = groups.find((g) => g.unclear && g.text === "");
  assert.ok(unclearBlank && !unclearBlank.blank);
});

test("자동 채점은 불확실한 답안을 0점으로 넘기지 않는다 — 일치하면 만점, 아니면 사람에게", () => {
  const groups = groupEssayAnswers(
    [
      { ...a("s1", "he's looking forward to seeing you"), unclear: true },
      { ...a("s2", "He is looking forward to see you."), unclear: true },
      { ...a("s3", ""), unclear: true },
      a("s4", ""),
    ],
    KEY,
  );
  const result = autoGrade(groups, 4, { accepted: KEY });
  // s1 은 정답과 일치하므로 만점, s4 는 확실한 백지라 0점. s2·s3 은 점수 없이 남는다.
  assert.deepEqual(result.scores, { s1: 4, s4: 0 });
  assert.equal(result.pending.length, 2);
  assert.deepEqual(result.pending.flatMap((g) => g.members.map((m) => m.scanId)).sort(), ["s2", "s3"]);
});

test("한 답안의 자동 판정도 불확실하면 일치할 때만 만점이다", () => {
  assert.equal(autoVerdict("he's looking forward to seeing you", KEY, 4, true), 4);
  assert.equal(autoVerdict("", KEY, 4, true), null, "못 읽은 빈칸은 0점이 아니다");
  assert.equal(autoVerdict("He is looking forward to see you.", KEY, 4, true), null);
  // 사람이 고쳐 쓴 글은 확실한 글이다(unclear 기본값 false)
  assert.equal(autoVerdict("", KEY, 4), 0);
});

test("아직 글로 옮기지 못한 답안은 백지가 아니다 — 이유별로 따로, 맨 위에 묶인다", () => {
  const groups = groupEssayAnswers(
    [
      a("s1", ""), // 확실한 백지
      { ...a("s2", ""), missing: "noImage" }, // 손글씨 칸 이미지 없음
      { ...a("s3", "ignored"), missing: "unread" }, // 아직 안 읽음 — 글은 무시한다
      { ...a("s4", ""), missing: "noImage" },
      a("s5", "He's looking forward to seeing you"),
    ],
    KEY,
  );
  assert.equal(groups.length, 4);
  assert.deepEqual(groups.slice(0, 2).map((g) => g.missing).sort(), ["noImage", "unread"], "못 읽은 묶음이 맨 위");
  const noImage = groups.find((g) => g.missing === "noImage");
  assert.deepEqual(noImage?.members.map((m) => m.scanId), ["s2", "s4"]);
  assert.ok(noImage && !noImage.blank && !noImage.matchesKey && noImage.text === "");
  assert.equal(groups.find((g) => g.missing === "unread")?.text, "", "못 읽은 답안의 글은 보여 주지 않는다");
  assert.ok(groups[2].matchesKey);
  assert.ok(groups[3].blank && groups[3].members[0].scanId === "s1", "확실한 백지만 맨 뒤 백지 묶음");
});

test("자동 채점은 못 읽은 답안에 점수를 주지 않고 예전 자동 0점은 지운다 — 선생님 점수는 그대로", () => {
  // 손글씨 칸 이미지가 저장되지 않아 못 읽었는데, 예전 버전이 백지로 보고 자동 0점을 매긴 사례
  const groups = groupEssayAnswers(
    [
      { ...a("s1", ""), missing: "noImage" },
      { ...a("s2", ""), missing: "noImage" },
      { ...a("s3", ""), missing: "unread" },
      a("s4", ""),
    ],
    KEY,
  );
  const result = autoGrade(groups, 4, {
    accepted: KEY,
    current: {
      s1: { score: 0, source: "auto" },
      s2: { score: 3, source: "teacher" },
      s4: { score: 0, source: "auto" },
    },
  });
  assert.deepEqual(result.scores, { s4: 0 }, "확실한 백지만 0점");
  assert.deepEqual(result.cleared, ["s1"], "못 읽은 답안의 자동 0점은 지운다");
  assert.equal(result.kept, 1, "선생님이 종이를 보고 매긴 점수는 그대로");
});

test("판정할 수 없게 된 답안의 예전 자동 점수도 지운다 — 정답을 지운 경우", () => {
  const groups = groupEssayAnswers([a("s1", "He is looking forward to see you.")], []);
  const result = autoGrade(groups, 4, { accepted: [], current: { s1: { score: 0, source: "auto" } } });
  assert.deepEqual(result.scores, {});
  assert.deepEqual(result.cleared, ["s1"]);
});

test("성적표 전 확인 — 못 읽은 답안에 자동 점수만 있으면 채점 안 된 칸이다", () => {
  const scan = {
    essayScores: { "26": 0, "27": 0, "28": 4, "29": 2 },
    essayScoreSources: { "26": "auto", "27": "auto", "28": "auto" } as Record<string, string>,
    essayAnswers: { "27": "", "28": "He is looking forward to seeing you." },
  };
  assert.equal(essayCellGraded(scan, "26"), false, "못 읽은 칸의 자동 0점");
  assert.equal(essayCellGraded(scan, "27"), true, "읽어 보니 백지 — 자동 0점이 맞다");
  assert.equal(essayCellGraded(scan, "28"), true);
  assert.equal(essayCellGraded(scan, "29"), true, "출처 없는 옛 점수(엑셀)는 선생님 것");
  assert.equal(essayCellGraded(scan, "30"), false, "점수 없음");
  assert.equal(
    essayCellGraded({ essayScores: { "26": 3 }, essayScoreSources: { "26": "teacher" } }, "26"),
    true,
    "종이를 보고 매긴 점수",
  );
});

test("점수 저장값 — 범위 안으로, 만점은 배점 그대로, 부분점수는 소수 첫째 자리", () => {
  assert.equal(clampEssayScore(99, 4), 4);
  assert.equal(clampEssayScore(-1, 4), 0);
  assert.equal(clampEssayScore(1.55, 4), 1.6);
  assert.equal(clampEssayScore(100 / 45, 100 / 45), 100 / 45);
});
