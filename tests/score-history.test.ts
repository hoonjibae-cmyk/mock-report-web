/**
 * 성적 추이 재료 — 무엇을 어떤 축으로 그리는가.
 *
 * 실행: npm test
 *
 * 여기서 틀리면 그래프가 멀쩡해 보이면서 거짓을 말한다 — 만점이 다른 영역을
 * 같은 축에 두거나, 같은 시험이 두 번 찍히거나, 기간 밖 회차가 섞인다.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  areasOf,
  dedupeHistory,
  filterByMonths,
  trendData,
  trendSentence,
  type HistoryPoint,
} from "../lib/score-history";

function pt(examId: string, date: string, raw: number, mean: number, std = 100, areas: Array<[string, number, number]> = []): HistoryPoint {
  return {
    examId,
    title: `${date} 평가`,
    date,
    raw,
    max: 100,
    standardScore: std,
    mean,
    areas: areas.map(([area, earned, possible]) => ({ area, earned, possible, rate: Math.round((earned / possible) * 100) })),
  };
}

test("같은 시험이 두 장이면 마지막 것만, 날짜순", () => {
  const out = dedupeHistory([pt("b", "2026-05-30", 70, 60), pt("a", "2026-04-30", 60, 60), pt("b", "2026-05-30", 75, 60)]);
  assert.deepEqual(out.map((p) => `${p.examId}:${p.raw}`), ["a:60", "b:75"]);
});

test("기간 — 오늘로부터 n개월 안의 회차만", () => {
  const points = [pt("a", "2026-01-30", 1, 1), pt("b", "2026-06-15", 1, 1), pt("c", "2026-09-28", 1, 1)];
  const today = new Date("2026-09-30T00:00:00Z");
  assert.deepEqual(filterByMonths(points, 3, today).map((p) => p.examId), ["c"]);
  assert.deepEqual(filterByMonths(points, 6, today).map((p) => p.examId), ["b", "c"]);
  assert.deepEqual(filterByMonths(points, 12, today).map((p) => p.examId), ["a", "b", "c"]);
});

test("총점·원점수 — 내 점수와 반 평균 두 선, 0~100", () => {
  const d = trendData([pt("a", "2026-08-30", 78, 70), pt("b", "2026-09-30", 86, 79.5)], "raw", "total");
  assert.deepEqual(d.labels, ["26.08", "26.09"]);
  assert.deepEqual(d.series.map((s) => s.name), ["내 점수", "반 평균"]);
  assert.deepEqual(d.series[0].values, [78, 86]);
  assert.deepEqual(d.series[1].values, [70, 79.5]);
  assert.equal(d.yMin, 0);
  assert.equal(d.yMax, 100);
  assert.equal(d.unit, "점");
});

test("총점·표준점수 — 한 선과 기준선 100", () => {
  const d = trendData([pt("a", "2026-08-30", 78, 70, 96), pt("b", "2026-09-30", 86, 79.5, 114.6)], "standard", "total");
  assert.equal(d.series.length, 1);
  assert.deepEqual(d.series[0].values, [96, 114.6]);
  assert.deepEqual(d.baseline, { value: 100, label: "평균(100)" });
  assert.ok(d.yMin <= 80 && d.yMax >= 120);
});

test("영역별 — 만점이 달라도 성취율(%)로, 영역은 처음 나온 순서, 없는 회차는 빈 점", () => {
  const points = [
    pt("a", "2026-08-30", 70, 60, 100, [["듣기", 15, 20], ["독해", 20, 40]]),
    pt("b", "2026-09-30", 80, 60, 100, [["듣기", 17, 17], ["독해", 30, 50], ["문법", 5, 10]]),
  ];
  assert.deepEqual(areasOf(points), ["듣기", "독해", "문법"]);
  const d = trendData(points, "raw", "areas");
  assert.equal(d.unit, "%");
  assert.deepEqual(d.series.map((s) => s.name), ["듣기", "독해", "문법"]);
  assert.deepEqual(d.series[0].values, [75, 100]);
  assert.deepEqual(d.series[2].values, [null, 50]);
});

test("학부모 한 줄 — 지난 회차와 반 평균에 견준 말", () => {
  assert.equal(
    trendSentence([{ raw: 78, mean: 70 }, { raw: 86, mean: 79.5 }]),
    "이번 86점. 지난 회차(78점)보다 8점 올랐고, 반 평균(79.5점)보다 6.5점 높습니다.",
  );
  assert.equal(
    trendSentence([{ raw: 90, mean: 70 }, { raw: 84, mean: 84 }]),
    "이번 84점. 지난 회차(90점)보다 6점 내렸고, 반 평균(84점)과 같습니다.",
  );
  assert.equal(trendSentence([{ raw: 80, mean: 85 }]), "이번 80점. 반 평균(85점)보다 5점 낮습니다.");
  assert.match(
    trendSentence([{ raw: 70, mean: 70 }, { raw: 75, mean: 70 }, { raw: 90, mean: 70 }]),
    /최근 3회 중 가장 높은 점수입니다\.$/,
  );
});
