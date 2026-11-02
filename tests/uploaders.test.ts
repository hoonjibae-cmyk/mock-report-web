/**
 * 올린 사람 범위 — 여러 직원이 답안지를 나눠 올렸을 때 "내 것만 먼저" 보는 규칙.
 *
 * 실행: npm test
 *
 * 여기서 틀리면 남이 올린 답안지를 내가 대신 넘기거나, 내 답안지가 안 보인다.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  NO_UPLOADER,
  defaultUploaderScope,
  filterByUploader,
  inScope,
  parseScopeParam,
  scopeKeyOf,
  summarizeEssayProgress,
  summarizeUploaders,
  uploaderDisplayName,
} from "../lib/uploaders";

const NAMES = { kim: "김직원", lee: "이직원", admin: "시스템 관리자" };

function s(id: string, uploadedBy: string | null, status: "pending" | "reviewed" = "pending", extra: Record<string, unknown> = {}) {
  return {
    id,
    uploadedBy,
    status,
    studentId: id,
    essayAnswers: {} as Record<string, string>,
    essayScores: {} as Record<string, number>,
    essayFlags: {} as Record<string, string>,
    ...extra,
  };
}

test("범위 열쇠 — 기록 없는 답안지는 NO_UPLOADER, 공백은 없는 것으로 본다", () => {
  assert.equal(scopeKeyOf({ uploadedBy: "kim" }), "kim");
  assert.equal(scopeKeyOf({ uploadedBy: null }), NO_UPLOADER);
  assert.equal(scopeKeyOf({ uploadedBy: "  " }), NO_UPLOADER);
  assert.equal(scopeKeyOf({}), NO_UPLOADER);
});

test("범위 걸러내기 — null 은 전체, 열쇠는 그 사람 것만", () => {
  const scans = [s("a", "kim"), s("b", "lee"), s("c", null)];
  assert.deepEqual(filterByUploader(scans, null).map((x) => x.id), ["a", "b", "c"]);
  assert.deepEqual(filterByUploader(scans, "kim").map((x) => x.id), ["a"]);
  assert.deepEqual(filterByUploader(scans, NO_UPLOADER).map((x) => x.id), ["c"]);
  assert.ok(inScope(scans[1], null));
  assert.ok(!inScope(scans[1], "kim"));
});

test("기본 범위 — 내가 올린 답안지가 있으면 그것, 없으면 전체", () => {
  assert.equal(defaultUploaderScope([s("a", "kim"), s("b", "lee")], "kim"), "kim");
  assert.equal(defaultUploaderScope([s("a", "kim"), s("b", "lee")], "park"), null);
  assert.equal(defaultUploaderScope([], "kim"), null);
  assert.equal(defaultUploaderScope([s("a", "kim")], ""), null);
});

test("요청 파라미터 → 범위: all·빈 값은 전체, auto 는 기본 범위, 나머지는 그대로", () => {
  const scans = [s("a", "kim"), s("b", "lee")];
  assert.equal(parseScopeParam(undefined, "kim", scans), null);
  assert.equal(parseScopeParam("", "kim", scans), null);
  assert.equal(parseScopeParam("all", "kim", scans), null);
  assert.equal(parseScopeParam("auto", "kim", scans), "kim");
  assert.equal(parseScopeParam("auto", "park", scans), null);
  assert.equal(parseScopeParam("lee", "kim", scans), "lee");
  assert.equal(parseScopeParam(NO_UPLOADER, "kim", scans), NO_UPLOADER);
});

test("올린 사람별 장수 — 나를 맨 앞에, 장수 많은 순, 기록 없는 것은 맨 뒤", () => {
  const scans = [
    s("a", "lee", "reviewed"), s("b", "lee"), s("c", "lee"),
    s("d", "kim", "reviewed"),
    s("e", null), s("f", null),
  ];
  const out = summarizeUploaders(scans, NAMES, "kim");
  assert.deepEqual(
    out.map((u) => [u.key, u.displayName, u.total, u.reviewed, u.mine]),
    [
      ["kim", "김직원 (나)", 1, 1, true],
      ["lee", "이직원", 3, 1, false],
      [NO_UPLOADER, "올린 사람 기록 없음", 2, 0, false],
    ],
  );
  // 이름표가 없는 계정은 ID 그대로
  assert.equal(uploaderDisplayName("park", NAMES), "park");
});

test("주관식 진행 — 검수 마친 답안지 중 다 읽은 것·다 매긴 것·불확실 칸 수", () => {
  const keys = ["26", "27"];
  const scans = [
    // 다 읽고 다 매김
    s("a", "kim", "reviewed", { essayAnswers: { "26": "x", "27": "y" }, essayScores: { "26": 2, "27": 0 } }),
    // 한 칸만 읽음, 그 칸은 불확실
    s("b", "kim", "reviewed", { essayAnswers: { "26": "" }, essayFlags: { "26": "unclear" } }),
    // 검수 전 — 채점 대상이 아니다
    s("c", "kim", "pending", { essayAnswers: { "26": "x", "27": "y" }, essayScores: { "26": 2, "27": 2 } }),
    s("d", "lee", "reviewed"),
  ];
  const out = summarizeEssayProgress(scans, keys, NAMES, "kim");
  const kim = out.find((u) => u.key === "kim");
  assert.deepEqual(
    [kim?.total, kim?.reviewed, kim?.gradable, kim?.transcribed, kim?.graded, kim?.unclear],
    [3, 2, 2, 1, 1, 1],
  );
  const lee = out.find((u) => u.key === "lee");
  assert.deepEqual([lee?.gradable, lee?.transcribed, lee?.graded, lee?.unclear], [1, 0, 0, 0]);
});
