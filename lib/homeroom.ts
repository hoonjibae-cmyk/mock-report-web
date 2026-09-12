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

import type { AreaStat } from "@/lib/omr-report-types";
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
  active: boolean;
  /** 학부모가 열어 본 횟수 — 직원 열람은 세지 않는다 */
  viewCount: number;
  createdAt: string;
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
 */
export function groupByExam(rows: readonly HomeroomReport[]): ExamGroup[] {
  const byExam = new Map<string, HomeroomReport[]>();
  for (const row of rows) {
    if (!teacherCanSeeExamType(row.examType)) continue;
    if (!row.active) continue;
    const key = row.examId ?? `no-exam:${row.examTitle}`;
    const list = byExam.get(key) ?? [];
    list.push(row);
    byExam.set(key, list);
  }

  const groups: ExamGroup[] = [];
  for (const list of byExam.values()) {
    const students = latestPerStudent(list).sort(
      (a, b) => a.rank - b.rank || a.studentName.localeCompare(b.studentName, "ko"),
    );
    const head = students[0];
    groups.push({
      examId: head.examId,
      examType: head.examType,
      examTitle: head.examTitle,
      examDate: head.examDate,
      summary: summarizeClass(students),
      students,
    });
  }

  // 응시일이 없는 시험은 만든 날짜로 자리를 잡는다
  const when = (g: ExamGroup) => g.examDate ?? g.students[0]?.createdAt.slice(0, 10) ?? "";
  groups.sort((a, b) => when(b).localeCompare(when(a)));
  return groups;
}
