/**
 * 성장 추이에 실을 회차를 고르는 테스트.
 *
 * 실행: npm test
 *
 * 여기서 틀리면 학부모가 보는 그래프가 틀린다. 이번 시험이 빠지거나, 오래된
 * 회차가 최근 것을 밀어내거나, 한 회차가 두 칸을 차지한다. 셋 다 눈으로는
 * 잘 안 잡히고 "그래프가 이상한데요" 라는 말로만 돌아온다.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { GROWTH_LIMIT, recentGrowth, type GrowthPoint } from "../lib/omr-report-types";

function point(examId: string, date: string, standardScore = 100): GrowthPoint {
  return { examId, title: `${date} 평가`, date, standardScore, raw: 70, mean: 65 };
}

const current = point("now", "2026-08-29", 112);

test("기록이 쌓여도 이번 회차 포함 3회차만 남는다", () => {
  const growth = recentGrowth(
    [
      point("e1", "2026-03-30"),
      point("e2", "2026-04-30"),
      point("e3", "2026-05-30"),
      point("e4", "2026-06-28"),
      point("e5", "2026-07-31"),
    ],
    current,
  );
  assert.equal(growth.length, GROWTH_LIMIT);
  assert.deepEqual(
    growth.map((p) => p.examId),
    ["e4", "e5", "now"],
    "가장 최근 두 회차 + 이번 회차여야 한다",
  );
});

test("기록이 적으면 있는 만큼만 그린다", () => {
  assert.deepEqual(
    recentGrowth([], current).map((p) => p.examId),
    ["now"],
    "첫 시험이면 이번 것 하나",
  );
  assert.deepEqual(
    recentGrowth([point("e1", "2026-07-31")], current).map((p) => p.examId),
    ["e1", "now"],
  );
});

test("이번 회차는 응시일이 앞서 적혀 있어도 빠지지 않는다", () => {
  // 응시일을 지난달로 적어 둔 시험이 실제로 있다. 그때 이번 성적표의 점수가
  // 제 그래프에서 사라지면 읽는 사람이 성적표 전체를 의심한다.
  const backdated = point("now", "2026-01-05", 112);
  const growth = recentGrowth(
    [point("e1", "2026-06-28"), point("e2", "2026-07-31")],
    backdated,
  );
  assert.ok(
    growth.some((p) => p.examId === "now"),
    "이번 회차가 빠졌다",
  );
  assert.deepEqual(
    growth.map((p) => p.examId),
    ["now", "e1", "e2"],
    "날짜순으로 놓되 이번 회차는 반드시 들어간다",
  );
});

test("항상 날짜 오름차순이다", () => {
  // 그래프는 왼쪽이 과거다. 순서가 흐트러지면 오른 것이 내린 것으로 보인다.
  const growth = recentGrowth(
    [point("e2", "2026-07-31"), point("e1", "2026-06-28"), point("e3", "2026-08-01")],
    current,
  );
  const dates = growth.map((p) => p.date);
  assert.deepEqual(dates, [...dates].sort(), `순서가 뒤집혔다: ${dates.join(", ")}`);
});

test("같은 시험이 두 번 들어와도 한 칸만 쓴다", () => {
  // 성적표를 다시 만들면 같은 시험의 행이 여러 개 남는다.
  const growth = recentGrowth(
    [point("e1", "2026-06-28"), point("e1", "2026-06-28"), point("e2", "2026-07-31")],
    current,
  );
  assert.deepEqual(growth.map((p) => p.examId), ["e1", "e2", "now"]);

  // 이번 시험의 예전 성적표가 섞여 들어와도 두 번 그리지 않는다
  const withSelf = recentGrowth([point("now", "2026-08-29"), point("e2", "2026-07-31")], current);
  assert.equal(withSelf.filter((p) => p.examId === "now").length, 1);
  assert.equal(withSelf.find((p) => p.examId === "now")?.standardScore, 112, "이번 채점 결과를 쓴다");
});

test("한 회차만 싣기로 해도 이번 것을 싣는다", () => {
  // slice(-0)은 배열을 통째로 돌려준다. 그 함정을 밟으면 제한이 사라진다.
  assert.deepEqual(
    recentGrowth([point("e1", "2026-06-28"), point("e2", "2026-07-31")], current, 1).map(
      (p) => p.examId,
    ),
    ["now"],
  );
  assert.deepEqual(recentGrowth([point("e1", "2026-06-28")], current, 0), []);
});
