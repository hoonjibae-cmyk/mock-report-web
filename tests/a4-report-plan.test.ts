/**
 * OMR 성적표의 A4 쪽 계획 — 첫 쪽에 문항별 결과까지, 의견은 길이에 따라 뒤로.
 *
 * 실행: npm test
 */
import assert from "node:assert/strict";
import test from "node:test";

import { A4_BODY_MM } from "../lib/a4-layout";
import { a4ReportBlocks, planA4Report, wrongItemsOf, type A4BlockKey } from "../lib/a4-report-plan";
import type { GenericItemResult, GenericReportData } from "../lib/omr-report-types";

function item(no: number, correct: boolean, patch: Partial<GenericItemResult> = {}): GenericItemResult {
  return {
    no,
    essay: false,
    answer: 2,
    marked: correct ? 2 : 3,
    correct,
    earned: correct ? 2 : 0,
    point: 2,
    correctRate: 70,
    difficulty: "보통",
    difficultySpecified: false,
    area: no <= 17 ? "듣기" : "독해",
    content: null,
    ...patch,
  };
}

function report(patch: Partial<GenericReportData> = {}): GenericReportData {
  const items = Array.from({ length: 45 }, (_, index) => item(index + 1, index % 5 !== 0));
  return {
    schemaVersion: 2,
    family: "C_generic",
    examId: "exam-1",
    examType: "saturday",
    examTypeLabel: "토요모의고사(영어)",
    examTitle: "11월 1주 토요모의고사",
    examDate: "2026-11-07",
    academy: "목동유쌤영어학원",
    student: { key: "12345", name: "김예시", school: "목동중 2", className: "M3 토" },
    score: { raw: 82, objectiveRaw: 82, essayRaw: 0, max: 100, correctCount: 36, wrongCount: 9, blankCount: 0, totalQuestions: 45 },
    cohort: { count: 48, mean: 71.3, stdev: 12.4, max: 98, min: 41 },
    standardScore: 117,
    rank: 9,
    topPercent: 18.8,
    grade: null,
    items,
    areas: [
      { area: "듣기", earned: 30, possible: 34, rate: 88.2, cohortRate: 80.1, cohortEarned: 27.2 },
      { area: "독해", earned: 52, possible: 66, rate: 78.8, cohortRate: 65.4, cohortEarned: 43.2 },
    ],
    weakItems: [6, 11],
    growth: [
      { examId: "e0", title: "10월 3주", date: "2026-10-17", standardScore: 104, raw: 74, mean: 70 },
      { examId: "e1", title: "10월 4주", date: "2026-10-24", standardScore: 110, raw: 78, mean: 69 },
      { examId: "exam-1", title: "11월 1주", date: "2026-11-07", standardScore: 117, raw: 82, mean: 71.3 },
    ],
    essayCount: 0,
    cohortGrades: { min: "중1", max: "고1", count: 48 },
    teacherComment: null,
    appVersion: "1.62.0",
    generatedAt: "2026-11-08T03:00:00.000Z",
    ...patch,
  };
}

const pageKeys = (plan: ReturnType<typeof planA4Report>) => plan.pages;

test("토요모의고사 기본 꼴 — 첫 쪽은 머리글부터 문항별 결과까지, 복습 표는 둘째 쪽", () => {
  const plan = planA4Report(report());
  const [first, second] = pageKeys(plan);
  const expected: A4BlockKey[] = ["header", "kpis", "position", "areas", "items"];
  assert.deepEqual(first, expected);
  // 틀린 문항이 있으니 우선 복습 표가 있고(둘째 쪽), 의견은 없다
  assert.deepEqual(second, ["review"]);
  assert.ok(!plan.blocks.some((block) => block.key.startsWith("comment-")));
  // 모든 덩어리가 한 번씩, 순서대로 쪽에 실린다
  assert.deepEqual(plan.pages.flat(), plan.blocks.map((block) => block.key));
  assert.equal(plan.pages.length, 2);
});

test("성적 추이는 위치 카드와 나란히 — 추이가 있으면 그 줄이 그래프 카드만큼 높다", () => {
  const height = (data: GenericReportData) => a4ReportBlocks(data).find((block) => block.key === "position")!.height;
  const withGrowth = height(report());
  const alone = height(report({ growth: [] }));
  assert.ok(withGrowth >= 60, `그래프 카드 높이 ${withGrowth}`);
  assert.ok(alone < withGrowth, `위치 카드만 있으면 더 낮다 ${alone}`);
  // 한 회차뿐이면 나란히 놓을 것이 없다
  assert.equal(height(report({ growth: report().growth.slice(-1) })), alone);
});

test("문항이 적은 월말평가도 첫 쪽에 문항별 결과까지 들어간다", () => {
  const items = Array.from({ length: 25 }, (_, index) => item(index + 1, index % 4 !== 0));
  const plan = planA4Report(
    report({ examType: "monthly", examTypeLabel: "월말평가", items, cohortGrades: null, cohortScope: "class", cohortLabel: "반 평균" }),
  );
  assert.ok(plan.pages[0].includes("items"));
});

test("쪽마다 어림 높이의 합이 용량을 넘지 않는다(혼자 넘치는 덩어리는 예외)", () => {
  const long = "가나다라마바사아자차카타파하 ".repeat(60);
  const plan = planA4Report(report(), {
    overview: long,
    style: "structured",
    areaNotes: [
      { area: "듣기", text: long },
      { area: "독해", text: long },
    ],
    personal: long,
    areaFeedback: [{ area: "듣기", rating: "우수", text: long }],
    keywords: ["성실", "집중"],
  });
  const heights = new Map(plan.blocks.map((block) => [block.key, block.height]));
  for (const page of plan.pages) {
    const total = page.reduce((sum, key, index) => sum + heights.get(key)! + (index > 0 ? 4 : 0), 0);
    if (page.length > 1) assert.ok(total <= A4_BODY_MM, `쪽 ${page.join(",")} 높이 ${total}`);
  }
  assert.ok(plan.pages.length >= 2, "긴 의견은 둘째 쪽 이후로");
});

test("의견이 짧으면 복습 표와 함께 둘째 쪽에, 첫 의견 덩어리에만 머리띠가 붙는다", () => {
  const plan = planA4Report(report(), { overview: "총평 한 줄", personal: "개별 의견 한 줄", keywords: [] });
  const commentBlocks = plan.blocks.filter((block) => block.key.startsWith("comment-"));
  assert.deepEqual(
    commentBlocks.map((block) => block.key),
    ["comment-overview", "comment-personal"],
  );
  // 머리띠(8mm)는 첫 덩어리에만 — 같은 한 줄 글인데 첫 덩어리가 8mm 높다
  assert.equal(commentBlocks[0].height - commentBlocks[1].height, 8);
});

test("자유 서술 방식이면 영역별 의견 덩어리를 만들지 않는다", () => {
  const blocks = a4ReportBlocks(report(), {
    overview: "총평",
    style: "free",
    areaNotes: [{ area: "듣기", text: "안내" }],
    personal: "개별",
    areaFeedback: [{ area: "듣기", rating: "우수", text: "좋아요" }],
    keywords: [],
  });
  const keys = blocks.map((block) => block.key);
  assert.ok(keys.includes("comment-overview") && keys.includes("comment-personal"));
  assert.ok(!keys.includes("comment-notes") && !keys.includes("comment-feedback"));
});

test("듣기 미응시는 오답이 아니다 — 다 맞고 듣기만 안 봤으면 복습 표가 없다", () => {
  const items = Array.from({ length: 45 }, (_, index) =>
    index < 17 ? item(index + 1, false, { absent: true, marked: null, earned: 0 }) : item(index + 1, true),
  );
  const data = report({ items, listeningAbsent: { mean: 27.2, possible: 34, count: 17 } });
  assert.equal(wrongItemsOf(data).length, 0);
  const keys = a4ReportBlocks(data).map((block) => block.key);
  assert.ok(!keys.includes("review"));
  // 듣기 미응시 안내가 붙어 위치 카드가 더 높다
  const base = a4ReportBlocks(report()).find((block) => block.key === "position")!.height;
  const withNotice = a4ReportBlocks(data).find((block) => block.key === "position")!.height;
  assert.ok(withNotice > base);
});

test("영역이 없으면 영역 표를 만들지 않고, 국영수 OMR 전용 덩어리는 자료가 있을 때만", () => {
  const keys = a4ReportBlocks(report({ growth: [], areas: [] })).map((block) => block.key);
  assert.ok(!keys.includes("areas"));
  assert.ok(!keys.includes("national") && !keys.includes("classification") && !keys.includes("contents"));

  const mock = a4ReportBlocks(
    report({
      examType: "mock",
      national: { subjectLabel: "영어", grade: 2, topPercent: 8.5, average: 61.2, diffFromAverage: 18.8, note: "참고값" },
      classificationStats: [
        { kind: "behavior", label: "행동영역", rows: [{ area: "추론", earned: 10, possible: 12, rate: 83.3, cohortRate: 70, cohortEarned: 8.4 }] },
      ],
    }),
  ).map((block) => block.key);
  // 전국 비교는 위치 바로 다음, 분류별 성취는 복습 표 뒤에
  assert.ok(mock.indexOf("national") === mock.indexOf("position") + 1);
  assert.ok(mock.indexOf("classification") > mock.indexOf("review"));
});
