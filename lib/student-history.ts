// 학생별 시험 이력 — 한 학생이 OMR 리포트로 본 모든 시험을 한 줄로 늘어놓는다.
//
// 담임은 제 학생(성적표에 담임으로 적힌 학생)을 이름으로 찾고, 그 학생이 본 시험은
// 담임이 바뀌기 전의 것까지 전부 본다. 어느 유형을 볼 수 있는지는 '내 반'과 같다
// (반배치고사는 열람 권한이 있는 계정만).
//
// 이 파일은 계산만 한다 — 어디서 가져오는지는 lib/reports, 어떻게 그리는지는
// StudentHistoryView 가 안다. 그래서 node 테스트로 바로 검증한다.

import { teacherCanSeeExamType, type HomeroomReport } from "@/lib/homeroom";
import type { ExamType } from "@/lib/omr-types";
import { dedupeHistory, type HistoryPoint } from "@/lib/score-history";

/** 성적표 한 건 + 그때의 담임 */
export interface StudentReport extends HomeroomReport {
  /** 성적표를 만들 때 학생 관리 프로그램에 적혀 있던 담임 */
  teacher: string;
}

/** 이름 열쇠 — 공백을 빼고 소문자로 */
export function nameKey(name: string | null | undefined): string {
  return String(name ?? "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

/**
 * 학생을 가리키는 열쇠. 수험번호(카드번호 또는 sc<학생ID>)가 있으면 그것, 없으면
 * 이름+학교 — 옛 성적표는 수험번호가 없어 이름으로밖에 못 묶는다.
 */
export function studentIdentity(row: Pick<StudentReport, "studentKey" | "studentName" | "school">): string {
  const key = (row.studentKey ?? "").trim();
  return key ? `key:${key}` : `name:${nameKey(row.studentName)}|${row.school.trim()}`;
}

/** 이 계정이 볼 수 있는 유형인가 — '내 반'과 같은 규칙 */
export function visibleExamType(type: ExamType, canSeePlacement: boolean): boolean {
  return teacherCanSeeExamType(type) || (type === "placement" && canSeePlacement);
}

/** 검색어가 이름에 맞는가 — 공백·대소문자를 무시한 부분 일치. 숫자만이면 수험번호 */
export function matchesQuery(row: Pick<StudentReport, "studentName" | "studentKey">, query: string): boolean {
  const q = nameKey(query);
  if (!q) return false;
  if (/^\d+$/.test(q)) return (row.studentKey ?? "").replace(/^0+/, "") === q.replace(/^0+/, "");
  return nameKey(row.studentName).includes(q);
}

export interface StudentCandidate {
  identity: string;
  studentKey: string | null;
  studentName: string;
  school: string;
  /** 가장 최근 성적표에 적힌 반·담임 */
  className: string;
  teacher: string;
  reportCount: number;
  lastExamDate: string | null;
}

function dateOf(row: Pick<StudentReport, "examDate" | "createdAt">): string {
  return row.examDate ?? row.createdAt.slice(0, 10);
}

/**
 * 검색 결과 — 성적표들을 학생 단위로 묶는다. 동명이인은 학교·반으로 가른다.
 * 이름순, 같은 이름이면 최근 응시가 위.
 */
export function candidatesFrom(rows: readonly StudentReport[], query: string): StudentCandidate[] {
  const byId = new Map<string, StudentCandidate & { _latest: string }>();
  for (const row of rows) {
    if (!row.active || !matchesQuery(row, query)) continue;
    const identity = studentIdentity(row);
    const when = dateOf(row);
    const prev = byId.get(identity);
    if (!prev) {
      byId.set(identity, {
        identity,
        studentKey: (row.studentKey ?? "").trim() || null,
        studentName: row.studentName,
        school: row.school,
        className: row.className,
        teacher: row.teacher,
        reportCount: 1,
        lastExamDate: when,
        _latest: row.createdAt,
      });
      continue;
    }
    prev.reportCount += 1;
    if (when > (prev.lastExamDate ?? "")) prev.lastExamDate = when;
    if (row.createdAt > prev._latest) {
      prev._latest = row.createdAt;
      prev.className = row.className;
      prev.teacher = row.teacher;
      prev.studentName = row.studentName;
      prev.school = row.school;
    }
  }
  return [...byId.values()]
    .map(({ _latest: _omit, ...rest }) => rest)
    .sort(
      (a, b) =>
        a.studentName.localeCompare(b.studentName, "ko") ||
        (b.lastExamDate ?? "").localeCompare(a.lastExamDate ?? ""),
    );
}

/** 이력 화면에 보이는 유형 순서 */
export const HISTORY_TYPE_ORDER: ExamType[] = ["monthly", "saturday", "mock", "inclass", "placement"];

export interface HistoryGroup {
  examType: ExamType;
  /** 최근 시험이 위 */
  rows: StudentReport[];
  /** 추이 그래프 재료 — 날짜순(오래된 것부터) */
  points: HistoryPoint[];
}

export function historyPoint(row: StudentReport): HistoryPoint {
  return {
    examId: row.examId ?? `no-exam:${row.examTitle}`,
    title: row.examTitle,
    date: dateOf(row),
    raw: row.raw,
    max: row.max,
    standardScore: row.standardScore,
    mean: row.cohortMean,
    areas: (row.areas ?? []).map((a) => ({ area: a.area, earned: a.earned, possible: a.possible, rate: a.rate })),
  };
}

/**
 * 한 학생의 성적표를 시험 유형별로 묶는다. 같은 시험이 여러 장이면(다시 만든 성적표)
 * 마지막 것만 남기고, 살아 있는 성적표만 본다. 유형 안에서는 최근 시험이 위.
 */
export function groupHistory(rows: readonly StudentReport[]): HistoryGroup[] {
  const latest = new Map<string, StudentReport>();
  for (const row of rows) {
    if (!row.active) continue;
    const key = row.examId ?? `no-exam:${row.examTitle}`;
    const prev = latest.get(key);
    if (!prev || prev.createdAt <= row.createdAt) latest.set(key, row);
  }
  const byType = new Map<ExamType, StudentReport[]>();
  for (const row of latest.values()) {
    const list = byType.get(row.examType) ?? [];
    list.push(row);
    byType.set(row.examType, list);
  }
  const groups: HistoryGroup[] = [];
  for (const type of HISTORY_TYPE_ORDER) {
    const list = byType.get(type);
    if (!list || list.length === 0) continue;
    list.sort((a, b) => dateOf(b).localeCompare(dateOf(a)) || b.createdAt.localeCompare(a.createdAt));
    groups.push({ examType: type, rows: list, points: dedupeHistory(list.map(historyPoint)) });
  }
  return groups;
}

/** 이력 머리글에 쓸 학생 정보 — 가장 최근 성적표 기준 */
export function studentHeader(rows: readonly StudentReport[]): StudentCandidate | null {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const head = sorted[0];
  const dates = rows.map(dateOf).sort();
  return {
    identity: studentIdentity(head),
    studentKey: (head.studentKey ?? "").trim() || null,
    studentName: head.studentName,
    school: head.school,
    className: head.className,
    teacher: head.teacher,
    reportCount: rows.length,
    lastExamDate: dates[dates.length - 1] ?? null,
  };
}
