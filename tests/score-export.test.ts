/**
 * 성적 엑셀을 만드는 테스트.
 *
 * 실행: npm test
 *
 * 이 표는 반 편성이나 상담에 그대로 쓰인다. 학생이 두 번 나오거나, 영역 열이
 * 뒤바뀌거나, 영역 하나가 통째로 빠져도 엑셀은 멀쩡해 보인다 — 숫자만 보고
 * 잘못된 판단을 내린 뒤에야 드러난다.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildScoreSheet,
  latestPerStudent,
  orderedAreas,
  type ScoreSource,
} from "../lib/omr-score-export";
import type { GenericItemResult, GenericReportData } from "../lib/omr-report-types";

function item(no: number, area: string | null, earned: number): GenericItemResult {
  return {
    no,
    essay: false,
    answer: 1,
    marked: 1,
    correct: earned > 0,
    earned,
    point: 2,
    correctRate: 50,
    difficulty: "보통",
    difficultySpecified: false,
    area,
    content: null,
  };
}

/** 듣기 1~2번 · 독해 3~4번짜리 성적표 하나 */
function report(
  name: string,
  raw: number,
  areas: Array<{ area: string; earned: number }>,
  items: GenericItemResult[],
): GenericReportData {
  return {
    schemaVersion: 2,
    family: "C_generic",
    examId: "exam-1",
    examType: "saturday",
    examTypeLabel: "토요모의고사(영어)",
    examTitle: "8월 토요모의고사",
    examDate: "2026-08-29",
    academy: "목동유쌤영어학원",
    student: { key: name, name, school: "" },
    score: {
      raw,
      objectiveRaw: raw,
      essayRaw: 0,
      max: 8,
      correctCount: 2,
      wrongCount: 2,
      blankCount: 0,
      totalQuestions: 4,
    },
    cohort: { count: 2, mean: raw, stdev: 0, max: raw, min: raw },
    standardScore: 100,
    rank: 1,
    topPercent: 50,
    grade: null,
    items,
    // 성적표 안에서는 성취율이 낮은 순으로 정렬돼 있다 — 학생마다 순서가 다르다
    areas: areas.map((a) => ({ ...a, possible: 4, rate: 0, cohortRate: 0, cohortEarned: 0 })),
    contents: [],
    weakItems: [],
    growth: [],
    essayCount: 0,
    teacherComment: null,
    generatedAt: "2026-08-29T10:00:00.000Z",
  };
}

function source(
  name: string,
  raw: number,
  listening: number,
  reading: number,
  createdAt = "2026-08-29T10:00:00.000Z",
): ScoreSource {
  const items = [
    item(1, "듣기", listening / 2),
    item(2, "듣기", listening / 2),
    item(3, "독해", reading / 2),
    item(4, "독해", reading / 2),
  ];
  // 일부러 독해를 앞에 둔다 — 성적표의 영역 순서를 열 순서로 쓰면 안 된다
  return {
    studentKey: name,
    name,
    createdAt,
    data: report(name, raw, [{ area: "독해", earned: reading }, { area: "듣기", earned: listening }], items),
  };
}

test("요청한 네 칸 그대로 나온다 — 학생명·총점수·듣기점수·독해점수", () => {
  const rows = buildScoreSheet([source("김하늘", 7, 3, 4), source("이바다", 5, 2, 3)]);

  assert.deepEqual(rows[0], ["학생명", "총점수", "듣기점수", "독해점수"]);
  assert.deepEqual(rows[1], ["김하늘", 7, 3, 4]);
  assert.deepEqual(rows[2], ["이바다", 5, 2, 3]);
  assert.equal(rows.length, 3, "안내 문구 없이 머리글 + 학생 수만큼만 나와야 한다");
});

test("영역 열은 문항 순서를 따른다 — 성적표의 성취율 순서를 쓰지 않는다", () => {
  // 성적표 안의 areas는 독해가 먼저지만, 듣기가 1번 문항이므로 열은 듣기가 앞이다
  const areas = orderedAreas([source("김하늘", 7, 3, 4)]);
  assert.deepEqual(areas, ["듣기", "독해"]);
});

test("이름 가나다순으로 정렬한다", () => {
  const rows = buildScoreSheet([
    source("최다솜", 4, 2, 2),
    source("강여울", 8, 4, 4),
    source("박새롬", 6, 3, 3),
  ]);
  assert.deepEqual(rows.slice(1).map((row) => row[0]), ["강여울", "박새롬", "최다솜"]);
});

test("성적표를 다시 만들었으면 마지막 것만 싣는다", () => {
  const rows = buildScoreSheet([
    source("김하늘", 5, 2, 3, "2026-08-29T10:00:00.000Z"),
    source("김하늘", 7, 3, 4, "2026-08-29T15:00:00.000Z"),
  ]);
  assert.equal(rows.length, 2, "같은 학생이 두 줄로 나오면 인원수부터 틀린다");
  assert.deepEqual(rows[1], ["김하늘", 7, 3, 4]);
});

test("입력 순서가 뒤집혀 있어도 늦게 만든 성적표가 이긴다", () => {
  const kept = latestPerStudent([
    source("김하늘", 7, 3, 4, "2026-08-29T15:00:00.000Z"),
    source("김하늘", 5, 2, 3, "2026-08-29T10:00:00.000Z"),
  ]);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].data.score.raw, 7);
});

test("수험번호가 없는 성적표는 묶지 않고 각각 남긴다", () => {
  const a = source("김하늘", 7, 3, 4);
  const b = source("이바다", 5, 2, 3);
  const kept = latestPerStudent([
    { ...a, studentKey: "" },
    { ...b, studentKey: "  " },
  ]);
  assert.equal(kept.length, 2, "구분할 방법이 없는 성적표를 하나로 합치면 학생이 사라진다");
});

test("영역을 셋으로 나눈 시험은 세 칸이 나온다 — 열을 듣기·독해로 못 박지 않는다", () => {
  const items = [
    item(1, "듣기", 2),
    item(2, "어법", 0),
    item(3, "독해", 2),
    item(4, "독해", 2),
  ];
  const rows = buildScoreSheet([
    {
      studentKey: "1",
      name: "김하늘",
      createdAt: "2026-08-29T10:00:00.000Z",
      data: report(
        "김하늘",
        6,
        [
          { area: "어법", earned: 0 },
          { area: "듣기", earned: 2 },
          { area: "독해", earned: 4 },
        ],
        items,
      ),
    },
  ]);
  assert.deepEqual(rows[0], ["학생명", "총점수", "듣기점수", "어법점수", "독해점수"]);
  assert.deepEqual(rows[1], ["김하늘", 6, 2, 0, 4]);
});

test("영역을 안 적어 둔 시험은 학생명·총점수만 나온다", () => {
  const items = [item(1, null, 2), item(2, null, 2)];
  const rows = buildScoreSheet([
    {
      studentKey: "1",
      name: "김하늘",
      createdAt: "2026-08-29T10:00:00.000Z",
      data: report("김하늘", 4, [], items),
    },
  ]);
  assert.deepEqual(rows[0], ["학생명", "총점수"]);
  assert.deepEqual(rows[1], ["김하늘", 4]);
});

test("그 영역이 없는 성적표는 0점이 아니라 빈칸으로 둔다", () => {
  // 영역을 채우기 전에 만든 성적표가 섞인 경우. 0점으로 적으면 '못 맞혔다'는
  // 뜻이 되어, 평균을 내면 없는 학생까지 끌어내린다.
  const withArea = source("김하늘", 7, 3, 4);
  const withoutArea: ScoreSource = {
    studentKey: "2",
    name: "이바다",
    createdAt: "2026-08-29T10:00:00.000Z",
    data: report("이바다", 5, [], [item(1, null, 2), item(2, null, 3)]),
  };
  const rows = buildScoreSheet([withArea, withoutArea]);
  assert.deepEqual(rows[0], ["학생명", "총점수", "듣기점수", "독해점수"]);
  assert.deepEqual(rows[2], ["이바다", 5, null, null]);
});
