// 담임 선생님의 '내 반' — 어느 성적표가 누구 반 것인지, 무엇을 보여 줄지.
//
// 이름으로 잇는다
// --------------
// 담임은 학생 관리 프로그램(Student-Card)이 원본이고, 직원 계정은 인사 프로그램
// (HR-Manager)이 원본이다. 두 프로그램은 서로를 모르고, 둘을 잇는 값은 **선생님
// 이름**뿐이다. 그래서 성적표에 적힌 담임 이름과 로그인한 직원의 이름을 맞춰
// 본다. 사람이 적은 글자라 '김 선생'과 '김선생'이 섞이므로 공백·대소문자를 뺀
// 열쇠로 비교한다 — DB의 생성 컬럼 homeroom_key 와 같은 규칙이다.
//
// 동명이인이 있으면 두 사람 다 서로의 반이 보인다. 이 학원 규모에서는 드물지만
// 생기면 인사 프로그램에서 이름을 구분해 적어야 한다(예: '김민수B').

import type { SummaryQuestion } from "@/lib/exam-summary";
import type { MarkValue } from "@/lib/omr-answers";
import type { AreaStat, GenericItemResult } from "@/lib/omr-report-types";
import type { ExamType } from "@/lib/omr-types";

/** 이름 열쇠 — 공백을 빼고 소문자로. DB 생성 컬럼 homeroom_key 와 같은 규칙 */
export function homeroomKey(name: string | null | undefined): string {
  return String(name ?? "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

/**
 * 담임이 '내 반'에서 볼 수 있는 시험 유형.
 *
 * 반배치고사는 반을 새로 짜는 자료라 담임에게 열지 않는다 — 결과가 반 편성
 * 전에 새면 편성 논의가 흔들린다. 나머지는 담임이 제 학생을 지도하는 데 쓰는
 * 자료이므로 연다. 토요모의고사가 여기 들어 있어야 한다는 요구가 분명했다.
 */
export const TEACHER_VISIBLE_EXAM_TYPES: Record<ExamType, boolean> = {
  mock: true,
  saturday: true,
  monthly: true,
  inclass: true,
  placement: false,
};

export function teacherCanSeeExamType(type: ExamType): boolean {
  return TEACHER_VISIBLE_EXAM_TYPES[type] === true;
}

/**
 * 총괄이 '내 반'에서 고를 선생님 목록 — 성적표에 담임으로 적힌 이름들.
 *
 * 같은 사람의 표기가 여럿이면('김 선생'·'김선생') 열쇠로 합치고, 가장 많이
 * 쓰인 표기를 보여 준다. include 의 이름(로그인한 본인 등)은 성적표가 없어도
 * 목록에 두고, 그 표기(인사 프로그램의 이름)를 우선한다. 가나다순.
 */
export function mergeTeacherNames(
  names: readonly (string | null | undefined)[],
  include: readonly string[] = [],
): string[] {
  const byKey = new Map<string, Map<string, number>>();
  const bump = (raw: string, weight: number) => {
    const name = raw.trim();
    const key = homeroomKey(name);
    if (!key) return;
    const spellings = byKey.get(key) ?? new Map<string, number>();
    spellings.set(name, (spellings.get(name) ?? 0) + weight);
    byKey.set(key, spellings);
  };
  for (const name of names) bump(String(name ?? ""), 1);
  for (const name of include) bump(name, Number.POSITIVE_INFINITY);

  const out: string[] = [];
  for (const spellings of byKey.values()) {
    let best = "";
    let bestCount = -1;
    for (const [spelling, count] of spellings) {
      if (count > bestCount) {
        best = spelling;
        bestCount = count;
      }
    }
    out.push(best);
  }
  return out.sort((a, b) => a.localeCompare(b, "ko"));
}

/** 두 이름이 같은 사람인가 — 공백·대소문자 차이는 무시. 빈 이름끼리는 아니다 */
export function sameTeacher(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = homeroomKey(a);
  return ka !== "" && ka === homeroomKey(b);
}

/**
 * 문항별 정오 한 칸 — 결과 요약의 ○·고른 번호·· 를 '내 반'에서도 그린다.
 * 정답·영역·배점은 학생마다 같으므로 여기 두지 않고 시험(ExamGroup.questions)에 둔다.
 */
export interface HomeroomItem {
  no: number;
  /** 학생이 고른 것 — "3", "2,4"(모두 고르기), 무응답은 "". 서술형은 "" */
  marked: string;
  correct: boolean;
  /** 받은 점수 — 서술형 칸에 적는다 */
  earned: number;
  /** 듣기 미응시 — 채점하지 않은 문항 */
  absent: boolean;
}

/** '내 반' 화면에 필요한 만큼만 추린 성적표 한 건 */
export interface HomeroomReport {
  reportId: string;
  token: string;
  examId: string | null;
  examType: ExamType;
  examTitle: string;
  /** YYYY-MM-DD 또는 null */
  examDate: string | null;
  studentKey: string | null;
  studentName: string;
  school: string;
  className: string;
  raw: number;
  max: number;
  standardScore: number;
  /** 응시 집단(시험 전체) 안에서의 석차 */
  rank: number;
  cohortCount: number;
  cohortMean: number;
  areas: AreaStat[];
  wrongCount: number;
  blankCount: number;
  /** 듣기 미응시 — 듣기 점수는 본 학생들의 평균을 받았다 */
  listeningAbsent: boolean;
  /** 문항별 정오 — 번호순 */
  items: HomeroomItem[];
  /**
   * 시험의 문항 정보(정답·영역·배점·전체 정답률). 성적표마다 같은 값이라
   * groupByExam 이 시험(ExamGroup)으로 올리고 학생에서는 뺀다 — 화면으로
   * 내려보내는 양을 줄이기 위해서다.
   */
  questions?: SummaryQuestion[];
  active: boolean;
  /** 학부모가 열어 본 횟수 — 직원 열람은 세지 않는다 */
  viewCount: number;
  createdAt: string;
}

function markLabel(value: MarkValue | null | undefined): string {
  if (Array.isArray(value)) return value.join(",");
  if (value === null || value === undefined) return "";
  return String(value);
}

/** 성적표 본문의 문항 결과를 '내 반' 칸으로 — 번호순 */
export function compactItems(items: readonly GenericItemResult[]): HomeroomItem[] {
  return [...items]
    .sort((a, b) => a.no - b.no)
    .map((it) => ({
      no: it.no,
      marked: it.essay ? "" : markLabel(it.marked),
      correct: it.correct,
      earned: it.earned,
      absent: it.absent === true,
    }));
}

/** 성적표 본문에서 시험의 문항 정보 — 정답·영역·배점·응시 집단 정답률(서술형은 평균 득점률) */
export function questionsOf(items: readonly GenericItemResult[]): SummaryQuestion[] {
  return [...items]
    .sort((a, b) => a.no - b.no)
    .map((it) => ({
      no: it.no,
      essay: it.essay,
      answer: it.essay ? "서술" : markLabel(it.answer),
      area: it.area ?? "",
      point: it.point,
      rate: Math.round(it.correctRate ?? 0),
    }));
}

/**
 * 우리 반의 문항별 정답률(%) — 반 학생 중 맞힌 비율. 듣기 미응시(채점 안 함)
 * 학생은 그 문항의 분모에서 뺀다. 서술형은 평균 득점률. 결과 요약의 '전체
 * 정답률' 옆에 놓아 "전체는 쉬웠는데 우리 반은 틀렸다"가 보이게 한다.
 */
export function classItemRates(
  students: readonly HomeroomReport[],
  questions: readonly SummaryQuestion[],
): Record<number, number> {
  const out: Record<number, number> = {};
  for (const q of questions) {
    let sum = 0;
    let n = 0;
    for (const s of students) {
      const it = s.items.find((i) => i.no === q.no);
      if (!it || it.absent) continue;
      n += 1;
      if (q.essay) sum += q.point > 0 ? Math.min(1, Math.max(0, it.earned / q.point)) : 0;
      else sum += it.correct ? 1 : 0;
    }
    out[q.no] = n > 0 ? Math.round((sum / n) * 100) : 0;
  }
  return out;
}

export interface ClassAreaSummary {
  area: string;
  /** 우리 반 평균 성취율(%) */
  rate: number;
  /** 응시 집단 평균 성취율(%) */
  cohortRate: number;
}

export interface ClassSummary {
  count: number;
  mean: number;
  max: number;
  min: number;
  /** 시험 전체 평균 — 우리 반이 어디쯤인지 보려면 이것과 나란히 놓아야 한다 */
  cohortMean: number;
  /** 전체 평균 이상인 학생 수 */
  aboveCohort: number;
  areas: ClassAreaSummary[];
}

export interface ExamGroup {
  examId: string | null;
  examType: ExamType;
  examTitle: string;
  examDate: string | null;
  summary: ClassSummary;
  /** 석차 순. 같은 석차면 이름 가나다순 */
  students: HomeroomReport[];
  /** 시험의 문항 정보 — 정답·영역·배점·전체 정답률(성적표에서 가져온다) */
  questions: SummaryQuestion[];
  /** 우리 반의 문항별 정답률(%) */
  classRates: Record<number, number>;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * 같은 시험에서 같은 학생의 성적표가 여럿이면 마지막 것만 남긴다.
 *
 * 성적표는 다시 만들 수 있고, 그때마다 행이 새로 쌓인다. 거르지 않으면 한
 * 학생이 두 줄로 나오고 반 평균부터 틀린다. 수험번호가 없는 성적표는 서로
 * 구분할 방법이 없어 각각 남긴다.
 */
export function latestPerStudent(rows: readonly HomeroomReport[]): HomeroomReport[] {
  const kept = new Map<string, HomeroomReport>();
  const unkeyed: HomeroomReport[] = [];
  for (const row of rows) {
    const key = (row.studentKey ?? "").trim();
    if (!key) {
      unkeyed.push(row);
      continue;
    }
    const prev = kept.get(key);
    if (!prev || prev.createdAt <= row.createdAt) kept.set(key, row);
  }
  return [...kept.values(), ...unkeyed];
}

/** 한 시험에서 우리 반의 요약 — 반 평균을 시험 전체 평균 옆에 놓는다 */
export function summarizeClass(rows: readonly HomeroomReport[]): ClassSummary {
  const count = rows.length;
  if (count === 0) {
    return { count: 0, mean: 0, max: 0, min: 0, cohortMean: 0, aboveCohort: 0, areas: [] };
  }
  const raws = rows.map((r) => r.raw);
  const mean = raws.reduce((a, b) => a + b, 0) / count;
  // 시험 전체 평균은 성적표마다 같은 값이 실려 있다. 첫 건의 값을 쓴다.
  const cohortMean = rows[0].cohortMean;

  // 영역별 — 학생마다 성취율을 평균 낸다. 집단 성취율은 같은 시험이면 같은 값이다.
  const areaAcc = new Map<string, { sum: number; n: number; cohortRate: number }>();
  for (const row of rows) {
    for (const stat of row.areas ?? []) {
      const entry = areaAcc.get(stat.area) ?? { sum: 0, n: 0, cohortRate: stat.cohortRate };
      entry.sum += stat.rate;
      entry.n += 1;
      areaAcc.set(stat.area, entry);
    }
  }
  const areas: ClassAreaSummary[] = [...areaAcc.entries()]
    .map(([area, e]) => ({ area, rate: round1(e.sum / e.n), cohortRate: round1(e.cohortRate) }))
    // 성적표 안의 영역 순서는 학생마다 다르므로(성취율 낮은 순) 이름으로 고정한다
    .sort((a, b) => a.area.localeCompare(b.area, "ko"));

  return {
    count,
    mean: round1(mean),
    max: Math.max(...raws),
    min: Math.min(...raws),
    cohortMean: round1(cohortMean),
    aboveCohort: raws.filter((r) => r >= cohortMean).length,
    areas,
  };
}

/**
 * 성적표들을 시험별로 묶는다. 담임에게 열지 않는 유형은 여기서 걸러진다.
 * 시험은 최근 것이 위, 학생은 석차 순.
 *
 * canSeePlacement — 이 계정에 '반배치고사 열람'이 열려 있으면 반배치고사도
 * 제 반 것은 보인다(교육운영팀, 지정된 교수부 계정).
 */
export function groupByExam(rows: readonly HomeroomReport[], canSeePlacement = false): ExamGroup[] {
  const byExam = new Map<string, HomeroomReport[]>();
  for (const row of rows) {
    if (!teacherCanSeeExamType(row.examType) && !(row.examType === "placement" && canSeePlacement)) continue;
    if (!row.active) continue;
    const key = row.examId ?? `no-exam:${row.examTitle}`;
    const list = byExam.get(key) ?? [];
    list.push(row);
    byExam.set(key, list);
  }

  const groups: ExamGroup[] = [];
  for (const list of byExam.values()) {
    const sorted = latestPerStudent(list).sort(
      (a, b) => a.rank - b.rank || a.studentName.localeCompare(b.studentName, "ko"),
    );
    const head = sorted[0];
    // 문항 정보는 시험으로 올리고 학생에서는 뺀다 — 성적표마다 같은 값이다.
    // 가장 문항이 많은 성적표에서 가져온다(옛 성적표에 문항이 비어 있을 수 있다).
    const questions =
      sorted.reduce<SummaryQuestion[] | undefined>(
        (best, s) => ((s.questions?.length ?? 0) > (best?.length ?? 0) ? s.questions : best),
        undefined,
      ) ?? [];
    const students = sorted.map((s) => {
      const { questions: _omit, ...rest } = s;
      void _omit;
      return rest;
    });
    groups.push({
      examId: head.examId,
      examType: head.examType,
      examTitle: head.examTitle,
      examDate: head.examDate,
      summary: summarizeClass(students),
      students,
      questions,
      classRates: classItemRates(students, questions),
    });
  }

  // 응시일이 없는 시험은 만든 날짜로 자리를 잡는다
  const when = (g: ExamGroup) => g.examDate ?? g.students[0]?.createdAt.slice(0, 10) ?? "";
  groups.sort((a, b) => when(b).localeCompare(when(a)));
  return groups;
}
