/**
 * 수험번호 마지막 자리를 학생 명부로 정하기.
 *
 * 실행: npm test
 *
 * 여기서 틀리면 4자리 학생의 답안지가 사람 손을 타거나(물음표가 남음), 반대로
 * 5자리 학생의 마지막 자리가 조용히 잘려 다른 학생에게 성적표가 간다.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { idCandidateQuery, resolveStudentId, type IdResolutionRow } from "../lib/id-resolve";
import { reviewVerdict } from "../lib/omr-review";
import type { OmrScan } from "../lib/omr-scans";

const CONF = { uncertain: [], multiMarked: [], idUncertain: true, idConflict: false };

function row(over: Partial<IdResolutionRow> = {}): IdResolutionRow {
  return { studentId: "2651?", studentIdQr: null, reviewFlags: [{ type: "id", col: 4, status: "review", certain: false }], readConfidence: CONF, ...over };
}

test("'2651?' — 앞자리 그대로와 0~9를 붙인 열 개를 명부에서 찾아본다", () => {
  const q = idCandidateQuery("2651?", null, []);
  assert.ok(q);
  assert.equal(q.kind, "unknown");
  assert.equal(q.col, 4);
  assert.deepEqual(q.candidates, ["2651", "26510", "26511", "26512", "26513", "26514", "26515", "26516", "26517", "26518", "26519"]);
});

test("흐린 자국을 무시하고 읽은 '2651'(id_trailing)과 마지막 자리가 흐린 '46140'(weak)도 후보를 만든다", () => {
  const faint = idCandidateQuery("2651", null, [{ type: "id_trailing", col: 4, candidate: "8" }]);
  assert.equal(faint?.kind, "faint");
  assert.equal(faint?.candidates[0], "2651");
  const weak = idCandidateQuery("46140", null, [{ type: "id", col: 4, status: "weak", certain: false }]);
  assert.equal(weak?.kind, "weak");
  assert.equal(weak?.prefix, "4614");
  assert.deepEqual(weak?.candidates.slice(0, 2), ["4614", "46140"]);
});

test("명부로 풀지 않는 것 — QR이 있거나, 중간 자리가 문제이거나, 여러 자리가 흐리거나, 읽은 게 없거나", () => {
  assert.equal(idCandidateQuery("2651?", "26515", []), null, "QR이 수험번호다");
  assert.equal(idCandidateQuery("26?1", null, [{ type: "id", col: 2, status: "review" }]), null);
  assert.equal(
    idCandidateQuery("46140", null, [{ type: "id", col: 1, status: "weak" }, { type: "id", col: 4, status: "weak" }]),
    null,
    "앞자리도 흐리면 앞자리를 믿을 수 없다",
  );
  assert.equal(idCandidateQuery("46140", null, [{ type: "id", col: 2, status: "weak" }]), null, "마지막 자리가 아니다");
  assert.equal(idCandidateQuery("2651", null, []), null, "흠잡을 데 없이 읽혔다");
  assert.equal(idCandidateQuery(null, null, []), null);
});

test("'2651?' + 명부에 2651만 → 2651로 정하고 수험번호 불확실을 푼다", () => {
  const out = resolveStudentId(row(), new Set(["2651"]));
  assert.ok(out);
  assert.equal(out.studentId, "2651");
  assert.deepEqual(out.reviewFlags, [{ type: "id_resolved", from: "2651?", to: "2651", source: "roster" }]);
  assert.equal(out.readConfidence?.idUncertain, false);
});

test("'2651?' + 명부에 26518만 → 흐린 자국이 진짜 다섯째 자리였다", () => {
  const out = resolveStudentId(row(), new Set(["26518"]));
  assert.equal(out?.studentId, "26518");
  assert.equal(out?.readConfidence?.idUncertain, false);
});

test("'2651?' + 명부에 둘 다 → 그대로 두고 후보를 보여 준다", () => {
  const out = resolveStudentId(row(), new Set(["2651", "26518"]));
  assert.ok(out);
  assert.equal(out.studentId, undefined);
  assert.deepEqual(out.reviewFlags.at(-1), { type: "id_options", options: ["2651", "26518"] });
  assert.equal(out.readConfidence?.idUncertain, true);
});

test("'2651?' + 명부에 아무도 없음 → 손대지 않는다(명부에 없다는 사유가 따로 붙는다)", () => {
  assert.equal(resolveStudentId(row(), new Set(["9999"])), null);
});

test("흐린 자국을 무시한 '2651' — 명부에 2651만 있으면 그대로, 26518만 있으면 26518로, 둘 다면 확인 요청", () => {
  const faint = (known: string[]) =>
    resolveStudentId(
      row({ studentId: "2651", reviewFlags: [{ type: "id_trailing", col: 4, candidate: "8" }], readConfidence: { ...CONF, idUncertain: false } }),
      new Set(known),
    );
  assert.equal(faint(["2651"]), null);
  const moved = faint(["26518"]);
  assert.equal(moved?.studentId, "26518");
  assert.equal(moved?.reviewFlags.at(-1)?.type, "id_resolved");
  assert.equal(moved?.readConfidence?.idUncertain, false);
  const both = faint(["2651", "26518"]);
  assert.deepEqual(both?.reviewFlags.at(-1), { type: "id_ambiguous", options: ["2651", "26518"] });
  assert.equal(both?.readConfidence?.idUncertain, true);
});

test("마지막 자리가 흐린 '46140' — 명부가 46140만 알면 확정, 4614만 알면 4614로, 둘 다면 확인 요청", () => {
  const weak = (known: string[]) =>
    resolveStudentId(row({ studentId: "46140", reviewFlags: [{ type: "id", col: 4, status: "weak", certain: false }] }), new Set(known));
  const confirmed = weak(["46140"]);
  assert.ok(confirmed);
  assert.equal(confirmed.studentId, undefined, "번호는 그대로");
  assert.deepEqual(confirmed.reviewFlags, [{ type: "id_confirmed", id: "46140", source: "roster" }]);
  assert.equal(confirmed.readConfidence?.idUncertain, false, "weak 플래그가 풀려 자동 통과할 수 있다");
  const cut = weak(["4614"]);
  assert.equal(cut?.studentId, "4614");
  assert.equal(cut?.readConfidence?.idUncertain, false);
  const both = weak(["4614", "46140"]);
  assert.equal(both?.reviewFlags.at(-1)?.type, "id_ambiguous");
  assert.equal(both?.readConfidence?.idUncertain, true);
});

test("다른 자리의 불확실은 남긴다 — '2651?'를 풀어도 2번째 자리가 흐리면 여전히 사람이 본다", () => {
  const out = resolveStudentId(
    row({ reviewFlags: [{ type: "id", col: 1, status: "weak", certain: false }, { type: "id", col: 4, status: "review", certain: false }] }),
    new Set(["2651"]),
  );
  assert.equal(out?.studentId, "2651");
  assert.deepEqual(out?.reviewFlags.map((f) => f.type), ["id", "id_resolved"]);
  assert.equal(out?.readConfidence?.idUncertain, true);
});

// --- 검수 사유 문구 ---

function scan(over: Partial<OmrScan> = {}): OmrScan {
  return {
    id: "s1", examId: "e1", filename: "a.jpg", scanPath: null, previewPath: null, studentId: "2651?", studentIdQr: null,
    studentIdBubbles: "2651?", answers: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i + 1), 3])),
    essayScores: {}, essayScoreSources: {}, essayAnswers: {}, essayCrops: {}, reviewFlags: [],
    readConfidence: { uncertain: [], multiMarked: [], idUncertain: true, idConflict: false }, status: "pending",
    reviewedBy: null, listeningMode: null, readError: null, createdAt: "", updatedAt: "", ...over,
  } as unknown as OmrScan;
}

const CTX = { numQuestions: 10, idDigits: 5, answerKey: {}, knownIds: new Set(["2651", "26518"]) };

test("후보가 둘인 답안지는 후보를 보여 주는 한 가지 사유만 붙는다 — '읽지 못한 자리'·'명부에 없음'은 겹치지 않는다", () => {
  const v = reviewVerdict(scan({ reviewFlags: [{ type: "id_options", options: ["2651", "26518"] }] }), CTX);
  assert.equal(v.auto, false);
  assert.deepEqual(v.reasons.map((r) => r.code), ["idAmbiguous"]);
  assert.match(v.reasons[0].label, /2651, 26518/);
  assert.match(v.reasons[0].label, /골라/);
});

test("흐린 자국 쪽 후보가 둘인 답안지도 마찬가지 — 문구는 '흐린 자국'을 말한다", () => {
  const v = reviewVerdict(
    scan({ studentId: "2651", studentIdBubbles: "2651", reviewFlags: [{ type: "id_trailing", col: 4, candidate: "8" }, { type: "id_ambiguous", options: ["2651", "26518"] }] }),
    CTX,
  );
  assert.deepEqual(v.reasons.map((r) => r.code), ["idAmbiguous"]);
  assert.match(v.reasons[0].label, /흐린 자국/);
});

test("명부로 정한 답안지는 사유 없이 자동 통과한다", () => {
  const v = reviewVerdict(
    scan({
      studentId: "2651", studentIdBubbles: "2651?",
      reviewFlags: [{ type: "id_resolved", from: "2651?", to: "2651", source: "roster" }],
      readConfidence: { uncertain: [], multiMarked: [], idUncertain: false, idConflict: false },
    }),
    CTX,
  );
  assert.equal(v.auto, true, JSON.stringify(v.reasons));
});

test("명부로 풀지 못한 '2651?'는 지금처럼 두 사유가 붙는다", () => {
  const v = reviewVerdict(scan(), CTX);
  assert.deepEqual(v.reasons.map((r) => r.code), ["idUncertain", "unknownId", "idUncertain"]);
});
