// 국영수 모의고사 성적표 보강 —
// 학원 OMR 채점 결과(ScoredScan)에 시험 기반 정보(문항분류표 · 전국비교기준)를 얹어
// 전국 등급·상위 추정과 분류 기준별 성취를 만든다. 기준 자료가 없으면 아무것도 하지
// 않으므로, 다른 유형 시험과 성적표 생성 경로가 갈라지지 않는다.

import {
  nationalGrade,
  nationalTopPercent,
  type MockReference,
  type MockReferenceItem,
} from "@/lib/mock-reference";
import type { AreaStat, GenericItemResult, NationalComparison } from "@/lib/omr-report-types";

const ROUND1 = (value: number) => Math.round(value * 10) / 10;

/** 분류 기준 — 성적표에 이 순서로 싣는다 */
const KINDS: Array<{ kind: keyof MockReferenceItem & string; label: string }> = [
  { kind: "behavior", label: "행동영역" },
  { kind: "area", label: "대영역" },
  { kind: "content", label: "내용영역" },
  { kind: "difficulty", label: "난이도" },
  { kind: "gradeLevel", label: "학년 수준" },
];

/** 문항 결과에 분류(행동영역·내용영역 등)를 붙인다 */
export function attachClassification(
  items: GenericItemResult[],
  reference: MockReference,
): GenericItemResult[] {
  const byNumber = new Map(reference.items.map((item) => [item.number, item]));
  return items.map((item) => {
    const ref = byNumber.get(item.no);
    if (!ref) return item;
    return {
      ...item,
      // 기준 자료의 영역이 있으면 그 값을 쓴다(직접 입력한 영역보다 우선)
      area: ref.area || item.area,
      classification: {
        behavior: ref.behavior,
        area: ref.area,
        content: ref.content,
        detail: ref.detail,
        difficulty: ref.difficulty,
        gradeLevel: ref.gradeLevel,
      },
    };
  });
}

/**
 * 분류 기준별 성취율. 집단 평균은 호출 측이 넘긴 문항별 정답률로 계산해
 * 학생 성취와 나란히 비교할 수 있게 한다.
 */
export function classificationStats(
  items: GenericItemResult[],
): Array<{ kind: string; label: string; rows: AreaStat[] }> {
  const out: Array<{ kind: string; label: string; rows: AreaStat[] }> = [];

  for (const { kind, label } of KINDS) {
    const buckets = new Map<string, { earned: number; possible: number; rateSum: number; n: number }>();
    for (const item of items) {
      const value = item.classification?.[kind as keyof NonNullable<GenericItemResult["classification"]>];
      const name = typeof value === "string" ? value.trim() : "";
      if (!name) continue;
      const entry = buckets.get(name) ?? { earned: 0, possible: 0, rateSum: 0, n: 0 };
      entry.earned += item.earned;
      entry.possible += item.point;
      entry.rateSum += item.correctRate;
      entry.n += 1;
      buckets.set(name, entry);
    }
    if (buckets.size === 0) continue;

    const rows: AreaStat[] = [...buckets.entries()]
      .map(([area, entry]) => ({
        area,
        earned: ROUND1(entry.earned),
        possible: ROUND1(entry.possible),
        rate: entry.possible > 0 ? ROUND1((entry.earned / entry.possible) * 100) : 0,
        // 반 평균 성취율 = 이 묶음 문항들의 집단 정답률 평균
        cohortRate: entry.n > 0 ? ROUND1(entry.rateSum / entry.n) : 0,
        // 그 성취율을 배점에 되돌린 평균 득점(원점수)
        cohortEarned: entry.n > 0 ? ROUND1((entry.rateSum / entry.n / 100) * entry.possible) : 0,
      }))
      .sort((a, b) => a.rate - b.rate);

    out.push({ kind, label, rows });
  }
  return out;
}

/** 전국 등급·상위 추정 — 학원 원점수를 전국 기준에 맞춰 본다 */
export function nationalComparison(
  reference: MockReference,
  raw: number,
): NationalComparison {
  const average = reference.nationalAverage;
  return {
    subjectLabel: reference.subjectLabel,
    grade: nationalGrade(reference, raw),
    topPercent: nationalTopPercent(reference, raw),
    average,
    diffFromAverage: average === null ? null : ROUND1(raw - average),
    note: "전국 등급·상위 추정%는 공개된 등급컷 구간을 선형 보간한 참고값이며 공식 개인 백분위가 아닙니다.",
  };
}
