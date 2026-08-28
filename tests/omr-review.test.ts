/**
 * 자동 검수 통과 판정 테스트.
 *
 * 실행: npm test
 *
 * 여기서 틀리면 잘못 읽힌 답안지가 조용히 성적표가 된다. 그래서 "통과시켜도
 * 되는가"보다 "붙잡아야 하는 것을 놓치지 않는가"를 더 촘촘히 본다.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  findDuplicateIds,
  normalizeId,
  reviewVerdict,
  summarizeReview,
  type ReviewContext,
} from "../lib/omr-review";
import type { OmrScan } from "../lib/omr-scans";

function scan(over: Partial<OmrScan> = {}): OmrScan {
  return {
    id: over.id ?? "s1",
    examId: "e1",
    filename: "scan.jpg",
    scanPath: null,
    previewPath: null,
    studentId: "20001",
    studentIdQr: null,
    studentIdBubbles: "20001",
    answers: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i + 1), 3])),
    essayScores: {},
    essayAnswers: {},
    essayCrops: {},
    reviewFlags: [],
    readConfidence: { uncertain: [], multiMarked: [], idUncertain: false, idConflict: false },
    status: "pending",
    reviewedBy: null,
    readError: null,
    createdAt: "",
    updatedAt: "",
    ...over,
  };
}

const ctx: ReviewContext = { numQuestions: 10, idDigits: 5 };
const codes = (s: OmrScan, c: ReviewContext = ctx) =>
  reviewVerdict(s, c).reasons.map((r) => String(r.code));

test("깨끗하게 읽힌 답안지는 자동 통과한다", () => {
  const v = reviewVerdict(scan(), ctx);
  assert.equal(v.auto, true);
  assert.deepEqual(v.reasons, []);
});

test("학생이 문항을 비워도 자동 통과한다", () => {
  // 판독기가 '확실한 미표기'로 본 문항은 uncertain에 들어오지 않는다.
  // 이게 통과되지 않으면 60명 중 대부분이 검수 대상이 되어 기능이 무의미해진다.
  const answers = { ...scan().answers, "3": null, "7": null };
  assert.equal(reviewVerdict(scan({ answers }), ctx).auto, true);
});

test("확신 정보가 없는 답안지는 통과시키지 않는다", () => {
  // 기능 추가 이전에 올린 답안지. '문제를 못 찾았다'와 '확실히 괜찮다'는 다르다.
  assert.deepEqual(codes(scan({ readConfidence: null })), ["noConfidence"]);
});

test("판독 오류가 있으면 다른 검사 없이 바로 붙잡는다", () => {
  const v = reviewVerdict(scan({ readError: "배치가 다릅니다" }), ctx);
  assert.equal(v.auto, false);
  assert.deepEqual(v.reasons.map((r) => r.code), ["readError"]);
  assert.equal(v.reasons[0].label, "배치가 다릅니다");
});

test("표기가 경계에 걸친 문항이 있으면 붙잡는다", () => {
  const s = scan({
    readConfidence: { uncertain: [4, 9], multiMarked: [], idUncertain: false, idConflict: false },
  });
  const v = reviewVerdict(s, ctx);
  assert.equal(v.auto, false);
  assert.deepEqual(v.reasons[0].questions, [4, 9]);
});

test("수험번호가 없거나 읽지 못한 자리가 있으면 붙잡는다", () => {
  assert.ok(codes(scan({ studentId: null })).includes("noStudentId"));
  assert.ok(codes(scan({ studentId: "20?01" })).includes("idUncertain"));
});

test("설정 자리수는 최대치 — 그보다 짧은 수험번호는 정상이다", () => {
  // 학원 수험번호는 4자리가 기본이고, 겹치는 학생만 5자리를 쓴다.
  // 5자리로 설정했다고 4자리를 검수 대상으로 만들면 거의 전원이 걸린다.
  assert.equal(reviewVerdict(scan({ studentId: "7996" }), ctx).auto, true);
  assert.equal(reviewVerdict(scan({ studentId: "79961" }), ctx).auto, true);
  // 4자리보다 짧으면 마킹이 흐려 자리가 빠졌을 가능성이 높다
  assert.ok(codes(scan({ studentId: "799" })).includes("idLength"));
  assert.ok(codes(scan({ studentId: "7" })).includes("idLength"));
  // 설정 자리수가 더 작으면 그 값을 따른다(3자리 시험에서 3자리는 정상)
  assert.equal(reviewVerdict(scan({ studentId: "799" }), { ...ctx, idDigits: 3 }).auto, true);
});

test("수험번호 마킹이 흐리면 붙잡는다", () => {
  const s = scan({
    readConfidence: { uncertain: [], multiMarked: [], idUncertain: true, idConflict: false },
  });
  assert.ok(codes(s).includes("idUncertain"));
});

test("QR과 마킹의 수험번호가 어긋나면 붙잡는다", () => {
  const s = scan({
    readConfidence: { uncertain: [], multiMarked: [], idUncertain: false, idConflict: true },
  });
  assert.ok(codes(s).includes("idConflict"));
});

test("같은 수험번호가 두 장에 있으면 둘 다 붙잡는다", () => {
  // 성적표가 통째로 다른 학생에게 가는 사고를 막는 검사.
  const scans = [
    scan({ id: "a", studentId: "20001" }),
    scan({ id: "b", studentId: "20001" }),
    scan({ id: "c", studentId: "20002" }),
  ];
  const summary = summarizeReview(scans, ctx);
  assert.equal(summary.autoReady.length, 1);
  assert.equal(summary.autoReady[0].id, "c");
  assert.equal(summary.needsPerson.length, 2);
  for (const entry of summary.needsPerson) {
    assert.ok(entry.reasons.some((r) => r.code === "duplicateId"));
  }
});

test("앞의 0만 다른 수험번호는 같은 학생으로 본다", () => {
  assert.equal(normalizeId("0123"), normalizeId("123"));
  assert.equal(normalizeId("000"), "0");
  assert.equal(normalizeId(null), "");
  const dups = findDuplicateIds([scan({ id: "a", studentId: "0123" }), scan({ id: "b", studentId: "123" })]);
  assert.ok(dups.has("123"));
});

test("명부에 없는 수험번호는 붙잡되, 연동이 꺼져 있으면 검사하지 않는다", () => {
  const known = new Set(["20002"]);
  assert.ok(codes(scan(), { ...ctx, knownIds: known }).includes("unknownId"));
  // 연동이 꺼져 있으면(null) 이 검사만 건너뛴다 — 전부 검수 대상으로 만들면 안 된다
  assert.equal(reviewVerdict(scan(), { ...ctx, knownIds: null }).auto, true);
  // 빈 명부도 마찬가지로 판단 근거가 못 된다
  assert.equal(reviewVerdict(scan(), { ...ctx, knownIds: new Set() }).auto, true);
});

test("'모두 고르기' 문항의 복수 표기는 정상, 그 외는 붙잡는다", () => {
  const s = scan({
    readConfidence: { uncertain: [], multiMarked: [5], idUncertain: false, idConflict: false },
  });
  // 정답이 복수인 문항이면 학생이 여러 개 칠하는 게 맞다
  assert.equal(reviewVerdict(s, { ...ctx, answerKey: { "5": [1, 3] } }).auto, true);
  // 단일 정답 문항이면 사람이 어느 것을 인정할지 정해야 한다
  assert.ok(codes(s, { ...ctx, answerKey: { "5": 2 } }).includes("unexpectedMultiMark"));
  // 정답을 아직 안 넣었으면 판단할 수 없으므로 붙잡는다
  assert.ok(codes(s).includes("unexpectedMultiMark"));
});

test("표기가 하나도 없으면 붙잡는다", () => {
  // 판독기는 '확실히 비었다'고 말하지만, 빈 용지나 뒷면 스캔일 가능성이 더 크다.
  const answers = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i + 1), null]));
  assert.ok(codes(scan({ answers })).includes("allBlank"));
});

test("이미 검수한 답안지는 다시 판정하지 않는다", () => {
  const scans = [
    scan({ id: "a", studentId: "20001", status: "reviewed" }),
    scan({ id: "b", studentId: "20002", status: "reviewed", readConfidence: null }),
    scan({ id: "c", studentId: "20003" }),
  ];
  const summary = summarizeReview(scans, ctx);
  assert.equal(summary.reviewed, 2);
  assert.equal(summary.autoReady.length, 1);
  assert.equal(summary.needsPerson.length, 0);
  assert.equal(summary.total, 3);
});

test("이유는 하나만 나오는 게 아니라 전부 모인다", () => {
  const s = scan({
    studentId: "201",
    readConfidence: { uncertain: [2], multiMarked: [4], idUncertain: true, idConflict: false },
  });
  const found = codes(s);
  for (const expected of ["idLength", "idUncertain", "uncertainQuestions", "unexpectedMultiMark"]) {
    assert.ok(found.includes(expected), `${expected}가 빠졌다: ${found.join(", ")}`);
  }
});
