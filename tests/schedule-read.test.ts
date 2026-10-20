/**
 * 반배치고사 선호 요일 — 답안지 판독 결과를 화면이 어떻게 읽는지.
 *
 * 실행: npm test
 *
 * 여기서 틀리면 선생님이 "마킹했는데 왜 안 들어오지"를 또 겪는다. 판독기가
 * 확정하지 못한 표기도 가장 진한 칸은 제안해야 하고, 아무것도 안 칠한 답안지에
 * 엉뚱한 값을 넣어서는 안 된다.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeScheduleFlags,
  rereadGroups,
  rereadMessage,
  scheduleRead,
  scheduleReadLabel,
  suggestedSchedule,
} from "../lib/schedule-read";

const flag = (over: Record<string, unknown>) => ({ type: "preferred_schedule", ...over });

test("확실한 표기는 값 그대로 — 드롭다운에 바로 들어간다", () => {
  const scan = { preferredSchedule: "월수금", reviewFlags: [] };
  assert.deepEqual(scheduleRead(scan), { kind: "read", value: "월수금" });
  assert.equal(suggestedSchedule(scan), "월수금");
  assert.match(scheduleReadLabel(scheduleRead(scan)), /월수금/);
});

test("보기에 없는 값은 읽은 것으로 치지 않는다", () => {
  assert.equal(scheduleRead({ preferredSchedule: "월금", reviewFlags: [] }).kind, "unread");
});

test("흐린 표기는 가장 진한 칸을 제안하고 확인을 요청한다", () => {
  const scan = {
    preferredSchedule: null,
    reviewFlags: [flag({ status: "ok", certain: false, candidate: "화목", selected: ["화목"] })],
  };
  const read = scheduleRead(scan);
  assert.equal(read.kind, "uncertain");
  assert.equal(suggestedSchedule(scan), "화목");
  assert.match(scheduleReadLabel(read), /흐려 ‘화목’/);
  assert.match(scheduleReadLabel(read), /확인/);
});

test("흐려서 미표기로 읽힌 것도 제안값이 있으면 보여 준다", () => {
  const scan = {
    preferredSchedule: null,
    reviewFlags: [flag({ status: "blank", certain: false, candidate: "미정", selected: [] })],
  };
  assert.equal(scheduleRead(scan).kind, "uncertain");
  assert.equal(suggestedSchedule(scan), "미정");
});

test("둘 이상 칠한 표기는 무엇을 칠했는지 적고 하나를 고르게 한다", () => {
  const scan = {
    preferredSchedule: null,
    reviewFlags: [flag({ status: "multiple", certain: true, candidate: "화목", selected: ["화목", "월수금"] })],
  };
  const read = scheduleRead(scan);
  assert.equal(read.kind, "uncertain");
  assert.equal(read.kind === "uncertain" && read.status, "multiple");
  assert.match(scheduleReadLabel(read), /화목 · 월수금/);
  // 가장 진한 칸을 미리 넣되, 안내는 '하나를 고르세요'
  assert.equal(suggestedSchedule(scan), "화목");
});

test("아무것도 안 칠한 답안지에는 값을 넣지 않는다", () => {
  const scan = {
    preferredSchedule: null,
    reviewFlags: [flag({ status: "blank", certain: true, candidate: null, selected: [] })],
  };
  assert.deepEqual(scheduleRead(scan), { kind: "blank" });
  assert.equal(suggestedSchedule(scan), "");
  assert.match(scheduleReadLabel(scheduleRead(scan)), /표기 없음/);
});

test("예전 판독기의 플래그(상태만 있음)는 확인 필요로 두고 값은 비운다", () => {
  const scan = { preferredSchedule: null, reviewFlags: [flag({ status: "blank", certain: false })] };
  const read = scheduleRead(scan);
  assert.equal(read.kind, "uncertain");
  assert.equal(suggestedSchedule(scan), "");
  assert.match(scheduleReadLabel(read), /읽지 못함/);
});

test("값도 플래그도 없으면 선호 요일 칸을 읽지 않은 답안지다 — 다시 읽기를 안내한다", () => {
  const scan = { preferredSchedule: null, reviewFlags: [{ type: "question", no: 3 }] };
  assert.deepEqual(scheduleRead(scan), { kind: "unread" });
  assert.match(scheduleReadLabel(scheduleRead(scan)), /다시 읽기/);
});

test("다시 읽기는 원본 파일 단위로 묶고, PDF 여러 쪽은 한 번만 보낸다", () => {
  const { groups, missing } = rereadGroups([
    { filename: "묶음.pdf#p1", scanPath: "exam/묶음.pdf" },
    { filename: "묶음.pdf#p2", scanPath: "exam/묶음.pdf" },
    { filename: "낱장.jpg", scanPath: "exam/낱장.jpg" },
    { filename: "보관안됨.jpg", scanPath: null },
  ]);
  assert.deepEqual(groups, [
    { path: "exam/묶음.pdf", uploadName: "묶음.pdf", filenames: ["묶음.pdf#p1", "묶음.pdf#p2"] },
    { path: "exam/낱장.jpg", uploadName: "낱장.jpg", filenames: ["낱장.jpg"] },
  ]);
  assert.deepEqual(missing, ["보관안됨.jpg"]);
});

test("선호 요일 플래그만 갈아 끼우고 문항·수험번호 플래그는 그대로 둔다", () => {
  const merged = mergeScheduleFlags(
    [{ type: "question", no: 7 }, flag({ status: "blank", certain: false }), { type: "id", col: 2 }],
    [{ type: "question", no: 9 }, flag({ status: "ok", certain: false, candidate: "화목" })],
  );
  assert.deepEqual(merged, [
    { type: "question", no: 7 },
    { type: "id", col: 2 },
    flag({ status: "ok", certain: false, candidate: "화목" }),
  ]);
  // 새 결과에 선호 요일 플래그가 없으면(확실히 읽음) 예전 것도 사라진다
  assert.deepEqual(mergeScheduleFlags([flag({ status: "blank" })], []), []);
});

test("다시 읽기 결과 문장", () => {
  assert.equal(
    rereadMessage({ updated: 12, read: 9, uncertain: 2, blank: 1 }),
    "답안지 12장의 선호 요일을 다시 읽었습니다 — 확실히 읽음 9 · 확인 필요 2 · 표기 없음 1.",
  );
  const text = rereadMessage({ updated: 1, read: 1, mismatched: 2, unread: 0 }, ["a.jpg"], ["b.jpg"]);
  assert.match(text, /다른 배치로 출력된\) 답안지 2장/);
  assert.match(text, /원본이 보관돼 있지 않은 1장.*a\.jpg/);
  assert.match(text, /읽기 실패 1장\(b\.jpg\)/);
  assert.match(rereadMessage({}), /^다시 읽은 답안지가 없습니다\.$/);
  assert.match(rereadMessage({ updated: 3, unread: 3 }), /판독 서버 갱신/);
});
