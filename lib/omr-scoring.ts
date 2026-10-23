// OMR 채점 엔진 — 검수 완료 스캔 + 정답키 → 점수·집단 통계·표준점수
// 서술형(주관식) 점수, 문항별 영역 집계, 집단 정답률 기반 자동 난이도 포함

import { sameChoices, toChoices, type MarkValue } from "@/lib/omr-answers";
import type { OmrExam } from "@/lib/omr-types";
import { scanKey, type OmrScan } from "@/lib/omr-scans";
import { listeningQuestions, resolveListeningMode } from "@/lib/listening";
import type { AreaStat, Difficulty, GenericItemResult } from "@/lib/omr-report-types";

export interface ScoredScan {
  scanId: string;
  studentKey: string;
  raw: number;
  objectiveRaw: number;
  essayRaw: number;
  correctCount: number;
  wrongCount: number;
  blankCount: number;
  rank: number;
  topPercent: number;
  standardScore: number;
  grade: number | null;
  items: GenericItemResult[];
  weakItems: number[];
  /** 분석영역(대분류)별 성취 — '어느 갈래가 약한가' */
  areas: AreaStat[];
  /** 내용(세부 유형)별 성취 — '어떤 유형에서 막히는가' */
  contents: AreaStat[];
  /** 듣기 미응시 — 듣기 점수는 본 학생들의 평균을 받았다 */
  listeningAbsent: boolean;
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
  /** {문항번호: 집단 정답률 %} — 듣기 문항은 듣기를 본 학생들만으로 */
  itemRates: Record<number, number>;
  scored: ScoredScan[];
  /** 듣기 미응시 집계 — 듣기 문항이 없는 시험이면 null */
  listening: ListeningSummary | null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** 서술형 문항 수 (omrConfig.essay_count) */
export function essayCountOf(exam: OmrExam): number {
  const value = exam.omrConfig?.essay_count;
  return typeof value === "number" && value > 0 ? Math.floor(value) : 0;
}

/** 채점 대상 전체 문항 번호 — 객관식 1..N, 이어서 서술형 N+1.. */
export function allQuestionNumbers(exam: OmrExam): number[] {
  const total = exam.numQuestions + essayCountOf(exam);
  return Array.from({ length: total }, (_, i) => i + 1);
}

export function isEssayQuestion(exam: OmrExam, questionNo: number): boolean {
  return questionNo > exam.numQuestions;
}

/**
 * 문항별 배점.
 * 배점을 하나도 입력하지 않았으면 전체 문항(객관식+서술형)에 100점을 균등 배분한다.
 * 일부만 입력했으면 입력한 값을 쓰고, 나머지는 남은 점수를 균등 배분한다.
 */
export function pointFor(exam: OmrExam, questionNo: number): number {
  const custom = exam.points?.[String(questionNo)];
  if (typeof custom === "number" && custom > 0) return custom;

  const numbers = allQuestionNumbers(exam);
  let assigned = 0;
  let unassignedCount = 0;
  for (const q of numbers) {
    const value = exam.points?.[String(q)];
    if (typeof value === "number" && value > 0) assigned += value;
    else unassignedCount += 1;
  }
  if (unassignedCount === 0) return 0;
  const remaining = Math.max(100 - assigned, 0);
  return remaining / unassignedCount;
}

export function maxScore(exam: OmrExam): number {
  let total = 0;
  for (const q of allQuestionNumbers(exam)) total += pointFor(exam, q);
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

/** 집단 정답률로 난이도 자동 분류 — 출제자가 지정하지 않았을 때의 대안 */
export function difficultyOf(correctRate: number): Difficulty {
  if (correctRate >= 80) return "쉬움";
  if (correctRate >= 50) return "보통";
  return "어려움";
}

/**
 * 출제자가 적어 넣은 난이도를 내부 표기로 맞춘다.
 *
 * 학원마다 '상/중/하', 'A/B/C', '어려움/보통/쉬움'을 섞어 쓰므로 다 받아 준다.
 * 알아볼 수 없는 값은 null을 돌려 자동 분류로 넘긴다.
 */
export function normalizeDifficulty(value: unknown): Difficulty | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const table: Record<string, Difficulty> = {
    상: "어려움", 중상: "어려움", 중: "보통", 중하: "쉬움", 하: "쉬움",
    A: "어려움", B: "보통", C: "쉬움",
    어려움: "어려움", 보통: "보통", 쉬움: "쉬움",
    어려운: "어려움", 쉬운: "쉬움",
  };
  return table[text] ?? table[text.toUpperCase()] ?? null;
}

/** 문항 분석영역 (미지정이면 null) */
export function areaOf(exam: OmrExam, questionNo: number): string | null {
  const area = exam.questionMeta?.[String(questionNo)]?.area;
  const text = typeof area === "string" ? area.trim() : "";
  return text || null;
}

/** 문항 내용(세부 유형) (미지정이면 null) */
export function contentOf(exam: OmrExam, questionNo: number): string | null {
  const content = exam.questionMeta?.[String(questionNo)]?.content;
  const text = typeof content === "string" ? content.trim() : "";
  return text || null;
}

/** 출제자가 지정한 난이도 (미지정·해석 불가면 null) */
export function specifiedDifficultyOf(exam: OmrExam, questionNo: number): Difficulty | null {
  return normalizeDifficulty(exam.questionMeta?.[String(questionNo)]?.difficulty);
}

/** 듣기 미응시 집계(토요모의고사) — 어느 문항이 듣기였고, 몇 명이 봤고, 평균은 얼마였나 */
export interface ListeningSummary {
  questions: number[];
  /** 듣기를 본 학생들의 듣기 평균 득점 — 안 본 학생에게 이 값을 준다 */
  mean: number;
  /** 듣기 배점 합 */
  possible: number;
  takers: number;
  absent: number;
}

/**
 * 검수 완료 스캔 전체를 하나의 응시 집단으로 채점한다.
 * 표준점수 = 20 × (원점수 − 평균) ÷ 표준편차 + 100 (모표준편차, 동점 시 공동 석차)
 *
 * 듣기 미응시(토요모의고사): 듣기를 안 본 학생의 듣기 문항은 채점하지 않고
 * (맞음·틀림·무응답 어느 것도 아니다), 듣기 점수로는 **듣기를 본 학생들만의
 * 평균**을 준다. 그 학생은 듣기 문항 정답률과 듣기 영역 반 평균의 분모에서
 * 빠진다 — 안 본 사람이 평균을 움직이면 안 된다. 총점·석차·표준점수는 평균을
 * 받은 점수로 매긴다. 누가 안 봤는지는 lib/listening 이 정한다.
 *
 * peerScans(월말평가 '레벨 평균'): 같은 시험지를 치른 다른 반의 검수 완료 답안지.
 * 평균·표준편차·석차·문항 정답률·영역 평균의 분모에 함께 들어가지만, 결과(scored)는
 * 이 시험의 답안지에 대해서만 돌려준다 — 성적표는 이 시험 학생에게만 만든다.
 * 같은 시험지여야 한다는 것은 부르는 쪽(lib/monthly-cohort.samePaper)이 보장한다.
 */
export function scoreExam(
  exam: OmrExam,
  scans: OmrScan[],
  options: { peerScans?: OmrScan[] } = {},
): ScoreExamResult {
  const objectiveCount = exam.numQuestions;
  const mainIds = new Set(scans.map((scan) => scan.id));
  const cohortScans = [...scans, ...(options.peerScans ?? []).filter((scan) => !mainIds.has(scan.id))];
  const numbers = allQuestionNumbers(exam);

  const listeningNos = listeningQuestions(exam);
  const listeningSet = new Set(listeningNos);
  const listeningPossible = round1(listeningNos.reduce((sum, q) => sum + pointFor(exam, q), 0));

  // 문항별 집단 정답률 — 서술형은 배점 대비 득점률을 정답률로 본다
  const itemCorrect: Record<number, number> = {};
  const essayEarned: Record<number, number> = {};
  // 문항마다 '그 문항을 푼 사람' 수 — 듣기 미응시자는 듣기 문항의 분모에서 빠진다
  const itemTakers: Record<number, number> = {};
  for (const q of numbers) {
    itemCorrect[q] = 0;
    essayEarned[q] = 0;
    itemTakers[q] = 0;
  }

  interface Partial0 {
    scanId: string;
    studentKey: string;
    objectiveRaw: number;
    essayRaw: number;
    raw: number;
    correctCount: number;
    wrongCount: number;
    blankCount: number;
    marks: MarkValue[];
    essay: Record<number, number>;
    listeningAbsent: boolean;
    /** 듣기를 본 학생의 영역별 듣기 득점 — 안 본 학생에게 줄 평균의 재료 */
    listeningEarnedByArea: Map<string, number>;
    listeningEarned: number;
  }
  const partials: Partial0[] = [];

  for (const scan of cohortScans) {
    const listeningAbsent = listeningNos.length > 0 && resolveListeningMode(exam, scan) === "absent";
    let objectiveRaw = 0;
    let essayRaw = 0;
    let correctCount = 0;
    let wrongCount = 0;
    let blankCount = 0;
    let listeningEarned = 0;
    const listeningEarnedByArea = new Map<string, number>();
    const marks: MarkValue[] = [];
    const essay: Record<number, number> = {};

    for (let q = 1; q <= objectiveCount; q += 1) {
      const marked = scan.answers?.[String(q)] ?? null;
      const answer = exam.answerKey?.[String(q)] ?? null;
      marks.push(marked);
      // 듣기를 안 본 학생의 듣기 문항은 채점하지 않는다 — 맞음도 틀림도 무응답도 아니다
      if (listeningAbsent && listeningSet.has(q)) continue;
      itemTakers[q] += 1;
      if (toChoices(marked).length === 0) {
        blankCount += 1;
        continue;
      }
      // '모두 고르기' 문항은 표기 집합이 정답 집합과 완전히 같아야 정답이다.
      if (sameChoices(marked, answer)) {
        const point = pointFor(exam, q);
        objectiveRaw += point;
        correctCount += 1;
        itemCorrect[q] += 1;
        if (listeningSet.has(q)) {
          listeningEarned += point;
          const area = areaOf(exam, q) ?? "";
          listeningEarnedByArea.set(area, (listeningEarnedByArea.get(area) ?? 0) + point);
        }
      } else {
        wrongCount += 1;
      }
    }

    for (let q = objectiveCount + 1; q <= objectiveCount + essayCountOf(exam); q += 1) {
      const rawScore = scan.essayScores?.[String(q)];
      const point = pointFor(exam, q);
      const earned = typeof rawScore === "number" ? Math.max(0, Math.min(rawScore, point)) : 0;
      essay[q] = earned;
      essayRaw += earned;
      essayEarned[q] += earned;
      itemTakers[q] += 1;
      // 만점이면 정답 1건으로 집계(정답률 산출용)
      if (point > 0 && earned >= point - 1e-9) itemCorrect[q] += 1;
    }

    partials.push({
      scanId: scan.id,
      // 신규생(반배치고사)은 학생 관리 프로그램에서 맞춘 열쇠 — 수험번호 칸은 전화번호 뒤 4자리다
      studentKey: scanKey(scan) ?? "",
      objectiveRaw: round1(objectiveRaw),
      essayRaw: round1(essayRaw),
      raw: round1(objectiveRaw + essayRaw),
      correctCount,
      wrongCount,
      blankCount,
      marks,
      essay,
      listeningAbsent,
      listeningEarnedByArea,
      listeningEarned: round1(listeningEarned),
    });
  }

  // 듣기 평균 — 듣기를 본 학생들만으로. 안 본 학생에게는 이 값을 듣기 점수로 준다.
  const listeningTakers = partials.filter((p) => !p.listeningAbsent);
  const listeningMean =
    listeningNos.length > 0 && listeningTakers.length > 0
      ? round1(listeningTakers.reduce((sum, p) => sum + p.listeningEarned, 0) / listeningTakers.length)
      : 0;
  const listeningMeanByArea = new Map<string, number>();
  if (listeningTakers.length > 0) {
    for (const q of listeningNos) {
      const area = areaOf(exam, q) ?? "";
      if (!listeningMeanByArea.has(area)) listeningMeanByArea.set(area, 0);
    }
    for (const [area] of listeningMeanByArea) {
      const sum = listeningTakers.reduce((acc, p) => acc + (p.listeningEarnedByArea.get(area) ?? 0), 0);
      listeningMeanByArea.set(area, round1(sum / listeningTakers.length));
    }
  }
  for (const p of partials) {
    if (!p.listeningAbsent) continue;
    p.objectiveRaw = round1(p.objectiveRaw + listeningMean);
    p.raw = round1(p.objectiveRaw + p.essayRaw);
  }
  const listening: ListeningSummary | null =
    listeningNos.length > 0
      ? {
          questions: listeningNos,
          mean: listeningMean,
          possible: listeningPossible,
          takers: listeningTakers.length,
          absent: partials.length - listeningTakers.length,
        }
      : null;

  const count = partials.length;
  const rawScores = partials.map((p) => p.raw);
  const mean = count ? rawScores.reduce((a, b) => a + b, 0) / count : 0;
  const variance = count ? rawScores.reduce((a, b) => a + (b - mean) ** 2, 0) / count : 0;
  const stdev = Math.sqrt(variance);
  const cohort: CohortStats = {
    count,
    mean: round1(mean),
    stdev: round1(stdev),
    max: count ? Math.max(...rawScores) : 0,
    min: count ? Math.min(...rawScores) : 0,
  };

  const itemRates: Record<number, number> = {};
  for (const q of numbers) {
    const takers = itemTakers[q];
    if (!takers) {
      itemRates[q] = 0;
      continue;
    }
    if (q > objectiveCount) {
      // 서술형: 집단 평균 득점률
      const point = pointFor(exam, q);
      const avgEarned = essayEarned[q] / takers;
      itemRates[q] = point > 0 ? Math.round((avgEarned / point) * 100) : 0;
    } else {
      itemRates[q] = Math.round((itemCorrect[q] / takers) * 100);
    }
  }

  // 동점 공동 석차: 내림차순 정렬 후 같은 점수는 같은 석차
  const sortedDesc = [...rawScores].sort((a, b) => b - a);
  const rankOf = (raw: number) => sortedDesc.indexOf(raw) + 1;

  const examMax = maxScore(exam);

  // 갈래별 집단 평균 성취율 계산을 위해 먼저 학생별 갈래 득점을 모은다.
  // 분석영역(대분류)과 내용(세부 유형)은 계산이 같아 한 벌로 처리한다.
  // n 은 그 갈래에 점수가 있는 학생 수 — 듣기 미응시자는 듣기 갈래의 분모에서 빠진다.
  interface GroupEntry {
    earned: number;
    possible: number;
    estimated?: boolean;
  }
  interface TotalEntry {
    earnedSum: number;
    possible: number;
    n: number;
  }
  const areaTotals = new Map<string, TotalEntry>();
  const contentTotals = new Map<string, TotalEntry>();

  const scoredBase = partials.map((p) => {
    const items: GenericItemResult[] = [];
    for (const q of numbers) {
      const essayQ = q > objectiveCount;
      const point = round1(pointFor(exam, q));
      const absentItem = p.listeningAbsent && listeningSet.has(q);
      // 주관식 정답은 문장이라 보기번호 자리에 넣을 수 없다. 주관식 점수는
      // essayScores(사람이 채점하거나 전사 대조로 매긴 값)에서 온다.
      const rawAnswer = essayQ ? null : (exam.answerKey?.[String(q)] ?? null);
      const answer: MarkValue = typeof rawAnswer === "string" ? null : rawAnswer;
      const marked = essayQ || absentItem ? null : (p.marks[q - 1] ?? null);
      const isCorrect = essayQ || absentItem ? false : sameChoices(marked, answer);
      const earned = absentItem ? 0 : essayQ ? round1(p.essay[q] ?? 0) : isCorrect ? point : 0;
      const specified = specifiedDifficultyOf(exam, q);
      items.push({
        no: q,
        essay: essayQ,
        answer,
        marked,
        correct: absentItem ? false : essayQ ? point > 0 && earned >= point - 1e-9 : isCorrect,
        earned,
        point,
        correctRate: itemRates[q],
        // 출제자가 정한 난이도가 있으면 그것을 쓴다. 쉽게 낸 문항을 반이 많이
        // 틀렸다는 사실 자체가 지도에 필요한 정보라, 결과로 덮어쓰지 않는다.
        difficulty: specified ?? difficultyOf(itemRates[q]),
        difficultySpecified: specified !== null,
        area: areaOf(exam, q),
        content: contentOf(exam, q),
        ...(absentItem ? { absent: true } : {}),
      });
    }

    // 갈래별 집계 — 분석영역과 내용을 같은 방식으로 한 번씩 돌린다.
    // 채점하지 않은(듣기 미응시) 문항은 어느 갈래에도 넣지 않는다.
    const group = (pick: (item: GenericItemResult) => string | null) => {
      const out = new Map<string, GroupEntry>();
      for (const item of items) {
        if (item.absent) continue;
        const key = pick(item);
        if (!key) continue;
        const entry = out.get(key) ?? { earned: 0, possible: 0 };
        entry.earned += item.earned;
        entry.possible += item.point;
        out.set(key, entry);
      }
      return out;
    };
    const accumulate = (groups: Map<string, GroupEntry>, totals: Map<string, TotalEntry>) => {
      for (const [key, entry] of groups) {
        const t = totals.get(key) ?? { earnedSum: 0, possible: entry.possible, n: 0 };
        t.earnedSum += entry.earned;
        t.possible = entry.possible;
        t.n += 1;
        totals.set(key, t);
      }
    };

    const byArea = group((item) => item.area);
    const byContent = group((item) => item.content);
    accumulate(byArea, areaTotals);
    accumulate(byContent, contentTotals);

    // 듣기를 안 본 학생의 듣기 영역은 본 학생들의 평균값으로 — 분모(totals)에는 넣지 않는다
    if (p.listeningAbsent) {
      const possibleByArea = new Map<string, number>();
      for (const q of listeningNos) {
        const area = areaOf(exam, q);
        if (!area) continue;
        possibleByArea.set(area, (possibleByArea.get(area) ?? 0) + round1(pointFor(exam, q)));
      }
      for (const [area, possible] of possibleByArea) {
        byArea.set(area, { earned: listeningMeanByArea.get(area) ?? 0, possible, estimated: true });
      }
    }

    return { p, items, byArea, byContent };
  });

  const scored: ScoredScan[] = scoredBase.map(({ p, items, byArea, byContent }) => {
    const rank = rankOf(p.raw);
    const standardScore = stdev > 0 ? round1(20 * ((p.raw - mean) / stdev) + 100) : 100;

    const statsFor = (groups: Map<string, GroupEntry>, totals: Map<string, TotalEntry>): AreaStat[] => {
      const out = [...groups.entries()].map(([area, entry]) => {
        const t = totals.get(area);
        const cohortEarned = t && t.n > 0 ? t.earnedSum / t.n : 0;
        const stat: AreaStat = {
          area,
          earned: round1(entry.earned),
          possible: round1(entry.possible),
          rate: entry.possible > 0 ? Math.round((entry.earned / entry.possible) * 1000) / 10 : 0,
          cohortRate:
            t && t.n > 0 && t.possible > 0 ? Math.round((cohortEarned / t.possible) * 1000) / 10 : 0,
          cohortEarned: round1(cohortEarned),
        };
        if (entry.estimated) stat.estimated = true;
        return stat;
      });
      // 성취율이 낮은 갈래가 먼저 보이도록 — 약한 곳부터 눈에 들어와야 한다
      out.sort((a, b) => a.rate - b.rate);
      return out;
    };

    const areas = statsFor(byArea, areaTotals);
    const contents = statsFor(byContent, contentTotals);

    // 오답(서술형은 만점 미달) 중 집단 정답률이 낮은 순 → 우선 복습 (최대 5문항).
    // 채점하지 않은 듣기 문항은 오답이 아니다.
    const weakItems = items
      .filter((item) => !item.correct && !item.absent)
      .sort((a, b) => a.correctRate - b.correctRate)
      .slice(0, 5)
      .map((item) => item.no);

    return {
      scanId: p.scanId,
      studentKey: p.studentKey,
      raw: p.raw,
      objectiveRaw: p.objectiveRaw,
      essayRaw: p.essayRaw,
      correctCount: p.correctCount,
      wrongCount: p.wrongCount,
      blankCount: p.blankCount,
      rank,
      topPercent: count ? Math.round((rank / count) * 1000) / 10 : 0,
      standardScore,
      grade: gradeFor(exam, p.raw, examMax),
      items,
      weakItems,
      areas,
      contents,
      listeningAbsent: p.listeningAbsent,
    };
  });

  // 다른 반 답안지는 집단에만 들어간다 — 성적표는 이 시험의 학생에게만
  return { cohort, itemRates, scored: scored.filter((s) => mainIds.has(s.scanId)), listening };
}
