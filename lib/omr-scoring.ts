// OMR 채점 엔진 — 검수 완료 스캔 + 정답키 → 점수·집단 통계·표준점수

import type { OmrExam } from "@/lib/omr-types";
import type { OmrScan } from "@/lib/omr-scans";
import type { GenericItemResult } from "@/lib/omr-report-types";

export interface ScoredScan {
  scanId: string;
  studentKey: string;
  raw: number;
  correctCount: number;
  wrongCount: number;
  blankCount: number;
  rank: number;
  topPercent: number;
  standardScore: number;
  grade: number | null;
  items: GenericItemResult[];
  weakItems: number[];
}

export interface CohortStats {
  count: number;
  mean: number;
  stdev: number;
  max: number;
  min: number;
}

export interface ScoreExamResult {
  cohort: CohortStats;
  /** {문항번호: 집단 정답률 %} */
  itemRates: Record<number, number>;
  scored: ScoredScan[];
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** 문항별 배점 — exams.points가 비어 있으면 100점 만점 균등 배점 */
export function pointFor(exam: OmrExam, questionNo: number): number {
  const custom = exam.points?.[String(questionNo)];
  if (typeof custom === "number" && custom > 0) return custom;
  return 100 / exam.numQuestions;
}

export function maxScore(exam: OmrExam): number {
  let total = 0;
  for (let q = 1; q <= exam.numQuestions; q += 1) total += pointFor(exam, q);
  return round1(total);
}

/** 100점 환산 점수로 등급 산출(등급컷이 없으면 null) */
export function gradeFor(exam: OmrExam, raw: number, max: number): number | null {
  const cuts = exam.gradeCuts ?? [];
  if (cuts.length === 0 || max <= 0) return null;
  const pct = (raw / max) * 100;
  const sorted = [...cuts].sort((a, b) => b.min - a.min);
  for (const cut of sorted) {
    if (pct >= cut.min) return cut.grade;
  }
  return sorted[sorted.length - 1].grade + 1 <= 9 ? sorted[sorted.length - 1].grade + 1 : 9;
}

/**
 * 검수 완료 스캔 전체를 하나의 응시 집단으로 채점한다.
 * 표준점수 = 20 × (원점수 − 평균) ÷ 표준편차 + 100 (모표준편차, 동점 시 공동 석차)
 */
export function scoreExam(exam: OmrExam, scans: OmrScan[]): ScoreExamResult {
  const n = exam.numQuestions;

  // 문항별 집단 정답률
  const itemCorrect: Record<number, number> = {};
  for (let q = 1; q <= n; q += 1) itemCorrect[q] = 0;

  interface Partial0 {
    scanId: string;
    studentKey: string;
    raw: number;
    correctCount: number;
    wrongCount: number;
    blankCount: number;
    marks: Array<number | null>;
  }
  const partials: Partial0[] = [];

  for (const scan of scans) {
    let raw = 0;
    let correctCount = 0;
    let wrongCount = 0;
    let blankCount = 0;
    const marks: Array<number | null> = [];
    for (let q = 1; q <= n; q += 1) {
      const marked = scan.answers?.[String(q)] ?? null;
      const answer = exam.answerKey?.[String(q)] ?? null;
      marks.push(typeof marked === "number" ? marked : null);
      if (marked == null) {
        blankCount += 1;
        continue;
      }
      if (answer != null && marked === answer) {
        raw += pointFor(exam, q);
        correctCount += 1;
        itemCorrect[q] += 1;
      } else {
        wrongCount += 1;
      }
    }
    partials.push({
      scanId: scan.id,
      studentKey: scan.studentId ?? "",
      raw: round1(raw),
      correctCount,
      wrongCount,
      blankCount,
      marks,
    });
  }

  const count = partials.length;
  const rawScores = partials.map((p) => p.raw);
  const mean = count ? rawScores.reduce((a, b) => a + b, 0) / count : 0;
  const variance = count
    ? rawScores.reduce((a, b) => a + (b - mean) ** 2, 0) / count
    : 0;
  const stdev = Math.sqrt(variance);
  const cohort: CohortStats = {
    count,
    mean: round1(mean),
    stdev: round1(stdev),
    max: count ? Math.max(...rawScores) : 0,
    min: count ? Math.min(...rawScores) : 0,
  };

  const itemRates: Record<number, number> = {};
  for (let q = 1; q <= n; q += 1) {
    itemRates[q] = count ? Math.round((itemCorrect[q] / count) * 100) : 0;
  }

  // 동점 공동 석차: 내림차순 정렬 후 같은 점수는 같은 석차
  const sortedDesc = [...rawScores].sort((a, b) => b - a);
  const rankOf = (raw: number) => sortedDesc.indexOf(raw) + 1;

  const examMax = maxScore(exam);

  const scored: ScoredScan[] = partials.map((p) => {
    const rank = rankOf(p.raw);
    const standardScore =
      stdev > 0 ? round1(20 * ((p.raw - mean) / stdev) + 100) : 100;
    const items: GenericItemResult[] = [];
    for (let q = 1; q <= n; q += 1) {
      const answer = exam.answerKey?.[String(q)] ?? null;
      const marked = p.marks[q - 1];
      items.push({
        no: q,
        answer,
        marked,
        correct: answer != null && marked === answer,
        point: round1(pointFor(exam, q)),
        correctRate: itemRates[q],
      });
    }
    // 오답 중 집단 정답률이 낮은 순 → 우선 복습 대상 (최대 5문항)
    const weakItems = items
      .filter((item) => !item.correct)
      .sort((a, b) => a.correctRate - b.correctRate)
      .slice(0, 5)
      .map((item) => item.no);

    return {
      scanId: p.scanId,
      studentKey: p.studentKey,
      raw: p.raw,
      correctCount: p.correctCount,
      wrongCount: p.wrongCount,
      blankCount: p.blankCount,
      rank,
      topPercent: count ? Math.round((rank / count) * 1000) / 10 : 0,
      standardScore,
      grade: gradeFor(exam, p.raw, examMax),
      items,
      weakItems,
    };
  });

  return { cohort, itemRates, scored };
}
