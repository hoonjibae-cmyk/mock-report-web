/**
 * 오래된 파일 정리 판단 테스트.
 *
 * 실행: npm test
 *
 * 여기서 틀리면 **되돌릴 수 없다.** 지운 스캔 원본은 학생이 다시 시험을 치지
 * 않는 한 만들 수 없다. 그래서 "지울 것을 지우는가"보다 **"지우면 안 되는 것을
 * 남기는가"** 를 더 촘촘히 본다.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  SCAN_RETENTION_DAYS,
  SHEET_RETENTION_DAYS,
  chunk,
  cutoffIso,
  expiredNames,
} from "../lib/omr-retention";
import { sheetCacheKey, sheetCachePath } from "../lib/omr-sheet-cache";
import type { OmrSheetSpec } from "../lib/omr-types";

const NOW = new Date("2026-09-07T04:00:00.000Z");

function entry(name: string, createdAt: string | null | undefined) {
  return { name, created_at: createdAt };
}

test("기준 시각은 보관 기간만큼 뒤로 물러난다", () => {
  assert.equal(cutoffIso(7, NOW), "2026-08-31T04:00:00.000Z");
  assert.equal(cutoffIso(90, NOW), "2026-06-09T04:00:00.000Z");
  assert.equal(cutoffIso(0, NOW), NOW.toISOString());
});

test("보관 기간이 지난 것만 고른다", () => {
  const cutoff = cutoffIso(SCAN_RETENTION_DAYS, NOW);
  const picked = expiredNames(
    [
      entry("오래된.jpg", "2026-08-01T00:00:00.000Z"),
      entry("경계.jpg", cutoff), // 딱 기준 시각 — 아직 지나지 않았다
      entry("어제.jpg", "2026-09-06T00:00:00.000Z"),
      entry("오늘.jpg", NOW.toISOString()),
    ],
    cutoff,
  );
  assert.deepEqual(picked, ["오래된.jpg"]);
});

test("만들어진 시각을 모르면 지우지 않는다", () => {
  // 판단을 못 하는 파일을 지우기 시작하면 잘못 지웠을 때 되돌릴 방법이 없다.
  const cutoff = cutoffIso(SCAN_RETENTION_DAYS, NOW);
  assert.deepEqual(
    expiredNames(
      [
        entry("시각없음.jpg", null),
        entry("빈값.jpg", ""),
        entry("미정의.jpg", undefined),
        entry("", "2026-01-01T00:00:00.000Z"), // 이름 없는 항목(폴더 자리표시)
      ],
      cutoff,
    ),
    [],
    "모르는 것은 남겨야 한다",
  );
});

test("답안지는 스캔 원본보다 오래 남는다", () => {
  // 답안지는 결시생 추가 응시 때 다시 뽑는다. 원본보다 짧게 잡으면 안 된다.
  assert.ok(
    SHEET_RETENTION_DAYS > SCAN_RETENTION_DAYS,
    `답안지 ${SHEET_RETENTION_DAYS}일 ≤ 스캔 ${SCAN_RETENTION_DAYS}일`,
  );
});

test("지울 목록은 나눠 보낸다", () => {
  const items = Array.from({ length: 250 }, (_, i) => `f${i}`);
  const groups = chunk(items);
  assert.deepEqual(groups.map((g) => g.length), [100, 100, 50]);
  assert.deepEqual(groups.flat(), items, "나누는 과정에서 빠지거나 겹치면 안 된다");

  assert.deepEqual(chunk([]), [], "빈 목록은 빈 결과");
  assert.deepEqual(chunk(["a", "b", "c"], 1).length, 3);
  assert.throws(() => chunk(items, 0), /1 이상/, "0으로 나누면 무한 반복이 된다");
});

function spec(over: Partial<OmrSheetSpec> = {}): OmrSheetSpec {
  return {
    exam_id: "e1",
    title: "8월 월말평가",
    num_questions: 45,
    num_choices: 5,
    id_digits: 8,
    per_column: 20,
    style: "exam",
    period: "",
    subject_label: "",
    academy: "목동유쌤영어학원",
    essay_count: 3,
    ...over,
  };
}

test("설정이 같으면 같은 답안지를 내준다", () => {
  assert.equal(sheetCacheKey(spec()), sheetCacheKey(spec()));
  // 키 순서가 달라도 같은 설정이면 같은 이름이어야 한다
  const reordered = Object.fromEntries(
    Object.entries(spec()).reverse(),
  ) as unknown as OmrSheetSpec;
  assert.equal(sheetCacheKey(reordered), sheetCacheKey(spec()));
});

test("설정을 고치면 보관해 둔 옛 답안지가 안 나간다", () => {
  // 이것이 이 이름의 존재 이유다. 문항 수를 45→40으로 줄였는데 45문항짜리
  // 답안지가 계속 나가면, 그 답안지로 시험을 친 뒤에야 알게 된다.
  const base = sheetCacheKey(spec());
  for (const changed of [
    spec({ num_questions: 40 }),
    spec({ num_choices: 4 }),
    spec({ id_digits: 6 }),
    spec({ per_column: 15 }),
    spec({ style: "basic" }),
    spec({ essay_count: 0 }),
    spec({ title: "9월 월말평가" }),
    spec({ subject_label: "영어" }),
  ]) {
    assert.notEqual(
      sheetCacheKey(changed),
      base,
      `${JSON.stringify(changed)} 가 옛 답안지와 같은 이름을 얻었다`,
    );
  }
});

test("보관 경로는 시험별로 갈리고 정리 대상 폴더에 들어간다", () => {
  const key = sheetCacheKey(spec());
  assert.equal(sheetCachePath("e1", key), `sheets/e1/${key}.pdf`);
  assert.notEqual(sheetCachePath("e1", key), sheetCachePath("e2", key));
  // 스캔 이미지는 '{시험id}/...' 에 있다. 답안지가 그 아래로 섞이면 스캔 정리
  // 작업이 답안지까지 지운다.
  assert.ok(sheetCachePath("e1", key).startsWith("sheets/"));
});
