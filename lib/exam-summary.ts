/**
 * 시험 결과 요약 — 한 시험의 응시생 전원을 한 페이지에서.
 *
 * 성적표는 학생 한 명씩 열어야 보인다. 선생님이 알고 싶은 것은 "이번 시험
 * 우리 반이 어땠나"라서, 검수 완료된 답안지를 그 자리에서 채점해 전원을
 * 표 하나에 놓는다. 저장해 두는 파일이 아니라 볼 때마다 다시 계산하므로,
 * 답안지를 더 판독하면 다음에 열 때 저절로 반영된다.
 *
 * 이 파일은 표의 재료를 만들고 정렬·집계하는 규칙만 있다. 어디서 가져오는지는
 * app/admin/omr/[id]/summary/page.tsx 가, 어떻게 보이는지는 ExamSummary 가 안다.
 */
import type { MarkValue } from "@/lib/omr-answers";
import type { OmrExam } from "@/lib/omr-types";
import {
  areaOf,
  isEssayQuestion,
  pointFor,
  allQuestionNumbers,
  type CohortStats,
  type ListeningSummary,
  type ScoredScan,
} from "@/lib/omr-scoring";

/** 이름·반 — 성적표가 있으면 거기서, 없으면 학생 관리 프로그램에서 */
export interface SummaryStudent {
  name: string;
  school: string;
  className: string;
  /** 성적표가 만들어져 있으면 그 링크 토큰 */
  reportToken: string | null;
}

export interface SummaryItem {
  no: number;
  essay: boolean;
  correct: boolean;
  /** 학생이 고른 것 — "3", "2,4"(모두 고르기), 무응답은 "". 서술형은 "" */
  marked: string;
  earned: number;
  point: number;
  /** 듣기 미응시 — 채점하지 않은 문항 */
  absent: boolean;
}

export interface SummaryRow {
  studentKey: string;
  name: string;
  school: string;
  className: string;
  raw: number;
  max: number;
  objectiveRaw: number;
  essayRaw: number;
  rank: number;
  topPercent: number;
  standardScore: number;
  grade: number | null;
  correctCount: number;
  wrongCount: number;
  blankCount: number;
  areas: Array<{ area: string; earned: number; possible: number; rate: number; estimated: boolean }>;
  items: SummaryItem[];
  reportToken: string | null;
  /** 듣기 미응시 — 듣기 점수는 본 학생들의 평균을 받았다 */
  listeningAbsent: boolean;
}

export interface SummaryQuestion {
  no: number;
  essay: boolean;
  /** 정답 — "2", "2,4". 서술형은 "서술" */
  answer: string;
  area: string;
  point: number;
  /** 응시 집단 정답률(%) — 서술형은 평균 득점률 */
  rate: number;
}

export interface ExamSummaryData {
  examId: string;
  title: string;
  typeLabel: string;
  examDate: string | null;
  numQuestions: number;
  essayCount: number;
  max: number;
  classNames: string[];
  cohort: CohortStats;
  questions: SummaryQuestion[];
  rows: SummaryRow[];
  /** 검수 대기라 아직 집계에 없는 답안지 수 */
  pendingScans: number;
  /** 성적표가 만들어진 학생 수 */
  reportCount: number;
  /** 듣기 미응시 집계(토요모의고사) — 듣기 문항이 없는 시험이면 null */
  listening: ListeningSummary | null;
  /** 정답이 전부 입력됐는가 — 아니면 점수가 아직 임시다 */
  answerKeyComplete: boolean;
  /** 이름을 학생 관리 프로그램에서 가져오지 못한 까닭 */
  directoryError: string | null;
  generatedAt: string;
}

export type SummarySort = "score" | "name" | "key";

/** 점수 표기 — 정수면 그대로, 아니면 소수 한 자리 */
export function fmtScore(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function markText(value: MarkValue | string | null | undefined): string {
  if (Array.isArray(value)) return value.join(",");
  if (value === null || value === undefined || value === "") return "";
  return String(value);
}

/** 채점 결과에 이름·반을 붙여 표 한 줄씩으로 */
export function buildSummaryRows(
  scored: readonly ScoredScan[],
  students: ReadonlyMap<string, SummaryStudent>,
  max: number,
): SummaryRow[] {
  return scored.map((s) => {
    const who = students.get(s.studentKey);
    return {
      studentKey: s.studentKey,
      name: who?.name?.trim() ?? "",
      school: who?.school ?? "",
      className: who?.className ?? "",
      raw: s.raw,
      max,
      objectiveRaw: s.objectiveRaw,
      essayRaw: s.essayRaw,
      rank: s.rank,
      topPercent: s.topPercent,
      standardScore: s.standardScore,
      grade: s.grade,
      correctCount: s.correctCount,
      wrongCount: s.wrongCount,
      blankCount: s.blankCount,
      areas: s.areas.map((a) => ({ area: a.area, earned: a.earned, possible: a.possible, rate: a.rate, estimated: a.estimated === true })),
      items: [...s.items]
        .sort((a, b) => a.no - b.no)
        .map((it) => ({
          no: it.no,
          essay: it.essay,
          correct: it.correct,
          marked: it.essay ? "" : markText(it.marked),
          earned: it.earned,
          point: it.point,
          absent: it.absent === true,
        })),
      reportToken: who?.reportToken ?? null,
      listeningAbsent: s.listeningAbsent,
    };
  });
}

/** 문항마다 정답·영역·배점·정답률 — 표 머리의 '정답' 줄과 '정답률' 줄 */
export function summaryQuestions(exam: OmrExam, itemRates: Readonly<Record<number, number>>): SummaryQuestion[] {
  return allQuestionNumbers(exam).map((no) => {
    const essay = isEssayQuestion(exam, no);
    const key = exam.answerKey?.[String(no)];
    return {
      no,
      essay,
      answer: essay ? "서술" : markText(key as MarkValue | undefined),
      area: areaOf(exam, no) ?? "",
      point: pointFor(exam, no),
      rate: Math.round(itemRates[no] ?? 0),
    };
  });
}

/** 영역 이름을 문항 순서대로 — 듣기(1번부터)가 앞, 독해가 뒤 */
export function areasOf(questions: readonly SummaryQuestion[]): string[] {
  const out: string[] = [];
  for (const q of questions) if (q.area && !out.includes(q.area)) out.push(q.area);
  return out;
}

/**
 * 영역별 만점 — 그 영역 문항의 배점 합. 표 머리줄에 "듣기 (37)"로 한 번만 적고,
 * 학생 줄마다 "/ 37"을 되풀이하지 않는다. 채점(omr-scoring)의 영역 possible 과
 * 같은 값이다 — 둘 다 문항 배점을 더한 것이다.
 */
export function areaMaxima(questions: readonly SummaryQuestion[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const q of questions) {
    if (!q.area) continue;
    out.set(q.area, Math.round(((out.get(q.area) ?? 0) + q.point) * 10) / 10);
  }
  return out;
}

/** 한 칸에 들어갈 글 — 탭·줄바꿈이 섞이면 엑셀에서 칸이 밀린다 */
function cell(text: string): string {
  return text.replace(/[\t\r\n]+/g, " ").trim();
}

/**
 * 엑셀에 바로 붙여 넣는 표 — 학생명 · 총점 · 영역별 점수를 탭으로 나눈 글.
 *
 * 화면에 보이는 순서 그대로다(정렬을 바꾸면 그 순서로). 이름을 못 찾은 줄은
 * 화면과 같이 "수험번호 ○○"로, 그 영역 점수가 없는 학생은 빈 칸으로 둔다.
 * 듣기 미응시 학생의 듣기는 성적표와 같은 평균값이 **숫자로만** 들어간다 —
 * 글자를 붙이면 엑셀이 숫자로 보지 않아 합계·평균이 깨진다.
 */
export function summaryClipboardText(rows: readonly SummaryRow[], areas: readonly string[]): string {
  const header = ["학생명", "총점", ...areas];
  const lines = rows.map((r) => {
    const byName = new Map(r.areas.map((a) => [a.area, a]));
    const cells = [
      cell(r.name || `수험번호 ${r.studentKey}`),
      fmtScore(r.raw),
      ...areas.map((area) => {
        const a = byName.get(area);
        return a ? fmtScore(a.earned) : "";
      }),
    ];
    return cells.join("\t");
  });
  return [header.join("\t"), ...lines].join("\n");
}

const LAST = "￿";

/**
 * 정렬 — 점수순(같으면 이름순), 이름순(이름 없는 줄은 맨 뒤), 수험번호순(숫자처럼).
 * 원본은 건드리지 않는다.
 */
export function sortRows(rows: readonly SummaryRow[], sort: SummarySort): SummaryRow[] {
  const copy = [...rows];
  const byName = (a: SummaryRow, b: SummaryRow) => (a.name || LAST).localeCompare(b.name || LAST, "ko");
  const byKey = (a: SummaryRow, b: SummaryRow) => a.studentKey.localeCompare(b.studentKey, undefined, { numeric: true });
  if (sort === "name") copy.sort((a, b) => byName(a, b) || byKey(a, b));
  else if (sort === "key") copy.sort(byKey);
  else copy.sort((a, b) => b.raw - a.raw || byName(a, b) || byKey(a, b));
  return copy;
}

export interface ScoreBin {
  label: string;
  count: number;
}

/** 점수 분포 — 만점 대비 비율로 다섯 칸 */
export function scoreBins(rows: readonly SummaryRow[]): ScoreBin[] {
  const bins: Array<[number, string]> = [
    [90, "90% 이상"],
    [80, "80~89%"],
    [70, "70~79%"],
    [60, "60~69%"],
    [0, "60% 미만"],
  ];
  const counts = bins.map(() => 0);
  for (const r of rows) {
    const pct = r.max > 0 ? (r.raw / r.max) * 100 : 0;
    const idx = bins.findIndex(([lo]) => pct >= lo);
    counts[idx < 0 ? bins.length - 1 : idx] += 1;
  }
  return bins.map(([, label], i) => ({ label, count: counts[i] }));
}

/** 정답률이 낮은 문항부터 n개 — 수업에서 다시 다룰 문항 */
export function hardestQuestions(questions: readonly SummaryQuestion[], n = 5): SummaryQuestion[] {
  return [...questions].sort((a, b) => a.rate - b.rate || a.no - b.no).slice(0, Math.max(0, n));
}

/** 같은 수험번호가 두 번 이상 들어온 답안지 — 집단 인원이 부풀고 석차가 어긋난다 */
export function duplicateKeys(rows: readonly SummaryRow[]): Set<string> {
  const seen = new Map<string, number>();
  for (const r of rows) seen.set(r.studentKey, (seen.get(r.studentKey) ?? 0) + 1);
  return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k));
}
