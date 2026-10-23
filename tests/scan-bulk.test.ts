/**
 * 검수 목록의 여러 장 선택·일괄 처리.
 *
 * 실행: npm test
 *
 * 여기서 틀리면 '검수 확인'이 판독 실패한 장을 성적표로 만들거나, Shift 범위 선택이
 * 엉뚱한 장을 고르거나, 한 장의 실패가 뒤의 장들을 멈춘다.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { describeSkipped, idRange, planConfirm, runPool } from "../lib/scan-bulk";
import type { OmrScan } from "../lib/omr-scans";

function scan(over: Partial<OmrScan> & { id: string }): OmrScan {
  return {
    examId: "e1", filename: `${over.id}.jpg`, scanPath: null, previewPath: null, studentId: "2651", studentIdQr: null,
    studentIdBubbles: "2651", answers: {}, essayScores: {}, essayScoreSources: {}, essayAnswers: {}, essayCrops: {},
    reviewFlags: [], readConfidence: null, status: "pending", reviewedBy: null, listeningMode: null, readError: null,
    createdAt: "", updatedAt: "", ...over,
  } as unknown as OmrScan;
}

const ORDER = ["a", "b", "c", "d", "e"];

test("Shift 범위 선택 — 기준점과 지금 누른 것 사이(양끝 포함), 거꾸로도 된다", () => {
  assert.deepEqual(idRange(ORDER, "b", "d"), ["b", "c", "d"]);
  assert.deepEqual(idRange(ORDER, "d", "b"), ["b", "c", "d"], "아래에서 위로 눌러도 같다");
  assert.deepEqual(idRange(ORDER, "c", "c"), ["c"]);
});

test("기준점이 없거나 목록에서 사라졌으면 누른 것 하나, 누른 것이 목록에 없으면 빈 목록", () => {
  assert.deepEqual(idRange(ORDER, null, "c"), ["c"]);
  assert.deepEqual(idRange(ORDER, "zzz", "c"), ["c"], "필터로 가려진 기준점");
  assert.deepEqual(idRange(ORDER, "a", "zzz"), []);
});

test("일괄 검수 확인 — 판독 실패·수험번호 없음·이미 확인된 장은 건너뛰고 까닭을 센다", () => {
  const scans = [
    scan({ id: "ok" }),
    scan({ id: "failed", readError: "정렬 마커를 찾지 못했습니다" }),
    scan({ id: "noid", studentId: null }),
    scan({ id: "done", status: "reviewed", reviewedBy: "auto" }),
    scan({ id: "done-edited", status: "reviewed" }),
    scan({ id: "typed", studentId: null }),
  ];
  const plan = planConfirm(scans, {
    "done-edited": { studentId: "2652" },
    typed: { studentId: "7308" },
  });
  assert.deepEqual(plan.targets.map((s) => s.id), ["ok", "done-edited", "typed"]);
  assert.deepEqual(plan.skipped, { readError: 1, noStudentId: 1, alreadyReviewed: 1 });
  assert.equal(describeSkipped(plan.skipped), "건너뜀: 판독 실패 1장 · 수험번호 없음 1장 · 이미 검수 완료 1장.");
  assert.equal(describeSkipped({ readError: 0, noStudentId: 0, alreadyReviewed: 0 }), "");
});

test("화면에서 수험번호를 지운 장은 수험번호 없음으로 건너뛴다 — 저장된 값이 있어도", () => {
  const plan = planConfirm([scan({ id: "cleared" })], { cleared: { studentId: "  " } });
  assert.deepEqual(plan.targets, []);
  assert.equal(plan.skipped.noStudentId, 1);
});

test("runPool — 한 번에 limit개까지만, 전부 처리하고, 실패한 항목은 모아서 돌려주며 나머지는 계속 간다", async () => {
  let running = 0;
  let peak = 0;
  const done: number[] = [];
  const failures = await runPool([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
    running += 1;
    peak = Math.max(peak, running);
    await new Promise((resolve) => setTimeout(resolve, 5));
    running -= 1;
    if (n === 4) throw new Error("boom");
    done.push(n);
  });
  assert.equal(peak, 3);
  assert.deepEqual(done.sort((a, b) => a - b), [1, 2, 3, 5, 6, 7]);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].item, 4);
});

test("runPool — 빈 목록이면 아무것도 하지 않고, limit이 항목 수보다 커도 된다", async () => {
  let calls = 0;
  assert.deepEqual(await runPool([], 3, async () => { calls += 1; }), []);
  assert.deepEqual(await runPool(["x"], 10, async () => { calls += 1; }), []);
  assert.equal(calls, 1);
});
