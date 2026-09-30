/**
 * 성적 추이 — 한 학생의 지난 회차들을 그래프로 그리기 위한 재료.
 *
 * 두 곳에서 쓴다.
 *   담임 의견 화면: 원점수/표준점수, 총점/영역별, 3·6·12개월을 골라 본다.
 *   학부모 성적표: 내 점수와 반 평균을 막대로, 한 줄 문장으로 풀어 준다.
 *
 * 이 파일은 계산만 한다 — 어디서 가져오는지(omr-comments), 어떻게 그리는지
 * (TrendChart)는 모른다. 그래서 node 테스트로 바로 검증한다.
 */
import type { GenericReportData, GrowthPoint } from "@/lib/omr-report-types";

export interface HistoryArea {
  area: string;
  earned: number;
  possible: number;
  /** 성취율(%) */
  rate: number;
}

export interface HistoryPoint {
  examId: string;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  /** 100점 환산 원점수 */
  raw: number;
  max: number;
  standardScore: number;
  /** 응시 집단 평균(원점수) */
  mean: number;
  areas: HistoryArea[];
}

export type TrendMetric = "raw" | "standard";
export type TrendScope = "total" | "areas";
export type TrendMonths = 3 | 6 | 12;

export interface TrendSeries {
  name: string;
  color: string;
  values: Array<number | null>;
  dashed?: boolean;
  emphasize?: boolean;
}

export interface TrendData {
  labels: string[];
  /** 점 위에 띄울 설명(회차 제목·날짜) */
  titles: string[];
  series: TrendSeries[];
  yMin: number;
  yMax: number;
  unit: string;
  baseline?: { value: number; label: string };
}

const PALETTE = ["#183c73", "#1a7f4b", "#b3261e", "#b26a00", "#6f42c1", "#0e7490"];

/** 성적표 한 장을 추이 점 하나로 */
export function historyFromReport(examId: string, data: GenericReportData, createdAt: string): HistoryPoint {
  return {
    examId,
    title: data.examTitle,
    date: data.examDate ?? createdAt.slice(0, 10),
    raw: data.score.raw,
    max: data.score.max,
    standardScore: data.standardScore,
    mean: data.cohort.mean,
    areas: (data.areas ?? []).map((a) => ({ area: a.area, earned: a.earned, possible: a.possible, rate: a.rate })),
  };
}

/** 같은 시험이 여러 장이면 마지막 것만, 날짜순 */
export function dedupeHistory(points: readonly HistoryPoint[]): HistoryPoint[] {
  const byExam = new Map<string, HistoryPoint>();
  for (const p of points) byExam.set(p.examId, p);
  return [...byExam.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** 오늘로부터 n개월 안의 회차만 */
export function filterByMonths(points: readonly HistoryPoint[], months: TrendMonths, today: Date): HistoryPoint[] {
  const since = new Date(today);
  since.setMonth(since.getMonth() - months);
  const cut = since.toISOString().slice(0, 10);
  return points.filter((p) => p.date >= cut);
}

/** 영역 이름을 처음 나온 순서대로(회차 순) — 학생마다 순서가 흔들리지 않게 */
export function areasOf(points: readonly HistoryPoint[]): string[] {
  const out: string[] = [];
  for (const p of points) for (const a of p.areas) if (!out.includes(a.area)) out.push(a.area);
  return out;
}

export function shortDate(date: string): string {
  const [y, m] = date.split("-");
  return y && m ? `${y.slice(2)}.${m}` : date;
}

function niceBounds(values: number[], floor: number, ceil: number): { yMin: number; yMax: number } {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return {
    yMin: Math.min(floor, Math.floor((lo - 8) / 10) * 10),
    yMax: Math.max(ceil, Math.ceil((hi + 8) / 10) * 10),
  };
}

/**
 * 고른 방식대로 선 그래프 재료를 만든다.
 *
 * 영역별은 회차마다 만점이 다를 수 있어 점수 대신 **성취율(%)** 로 그린다 —
 * 듣기 17점 만점과 20점 만점을 같은 축에 두면 오르내림이 거짓이 된다.
 */
export function trendData(points: readonly HistoryPoint[], metric: TrendMetric, scope: TrendScope): TrendData {
  const labels = points.map((p) => shortDate(p.date));
  const titles = points.map((p) => `${p.title} (${p.date})`);

  if (scope === "areas") {
    const areas = areasOf(points);
    return {
      labels,
      titles,
      series: areas.map((area, i) => ({
        name: area,
        color: PALETTE[i % PALETTE.length],
        values: points.map((p) => p.areas.find((a) => a.area === area)?.rate ?? null),
        emphasize: true,
      })),
      yMin: 0,
      yMax: 100,
      unit: "%",
    };
  }

  if (metric === "standard") {
    const values = points.map((p) => p.standardScore);
    return {
      labels,
      titles,
      series: [{ name: "표준점수", color: PALETTE[0], values, emphasize: true }],
      ...niceBounds(values, 80, 120),
      unit: "",
      baseline: { value: 100, label: "평균(100)" },
    };
  }

  return {
    labels,
    titles,
    series: [
      { name: "내 점수", color: PALETTE[0], values: points.map((p) => p.raw), emphasize: true },
      { name: "반 평균", color: "#98a2b3", values: points.map((p) => p.mean), dashed: true },
    ],
    yMin: 0,
    yMax: Math.max(100, ...points.map((p) => p.raw), ...points.map((p) => p.mean)),
    unit: "점",
  };
}

/**
 * 학부모용 한 줄 — 이 그래프는 "우리 아이가 올라가고 있나"를 보는 것이다.
 *
 *   "이번 86점. 지난 회차(78점)보다 8점 올랐습니다. 최근 5회 중 가장 높은 점수입니다."
 *
 * 반 평균은 그래프에 참고선(막대)으로만 두고 문장으로 견주지 않는다. 지난
 * 회차보다 내렸을 때도 말하지 않는다 — 성적표가 먼저 꾸짖을 일이 아니다.
 */
export function trendSentence(points: readonly Pick<GrowthPoint, "raw" | "mean">[]): string {
  if (points.length === 0) return "";
  const last = points[points.length - 1];
  const parts: string[] = [`이번 ${fmt(last.raw)}점.`];
  if (points.length >= 2) {
    const prev = points[points.length - 2];
    const diff = round1(last.raw - prev.raw);
    if (diff > 0) parts.push(`지난 회차(${fmt(prev.raw)}점)보다 ${fmt(diff)}점 올랐습니다.`);
  }
  const best = Math.max(...points.map((p) => p.raw));
  if (points.length >= 3 && last.raw >= best && points.filter((p) => p.raw === best).length === 1) {
    parts.push(`최근 ${points.length}회 중 가장 높은 점수입니다.`);
  }
  return parts.join(" ");
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
function fmt(v: number): string {
  return String(round1(v));
}
