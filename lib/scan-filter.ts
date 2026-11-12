/**
 * 답안지 찾기 — 이름·수험번호로 검색하고, 올린 날짜로 좁힌다.
 *
 * 100명 넘게 보는 토요모의고사에서는 답안지 목록을 위아래로 훑어 한 학생을 찾기 어렵다.
 * 검수·성적표 생성·결과 요약 화면이 같은 규칙으로 좁힌다. 날짜는 답안지를 **올린 날**
 * (한국 시간)이다 — 답안지에는 응시일이 적혀 있지 않지만, 대개 본 날 스캔해 올리므로
 * 응시일과 같다. 따로 와서 본 학생은 그날 올린 묶음에서 찾으면 된다.
 */

import { kstDay } from "@/lib/date-range";

/** 검색어 정규화 — 공백을 모두 없애고 소문자로. '김 예시'도 '김예시'를 찾는다 */
export function normalizeQuery(text: string | null | undefined): string {
  return String(text ?? "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

export interface ScanSearchFields {
  name?: string | null;
  studentId?: string | null;
  filename?: string | null;
  school?: string | null;
}

/** 이름·수험번호·파일명·학교 가운데 하나라도 검색어를 품으면 참. 빈 검색어는 모두 통과 */
export function matchesScanQuery(fields: ScanSearchFields, query: string): boolean {
  const needle = normalizeQuery(query);
  if (!needle) return true;
  return [fields.name, fields.studentId, fields.filename, fields.school].some((value) =>
    normalizeQuery(value).includes(needle),
  );
}

export interface ScanDay {
  /** 한국 날짜 YYYY-MM-DD */
  key: string;
  /** 예: "11월 7일 (토)" */
  label: string;
  total: number;
  reviewed: number;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 'YYYY-MM-DD' → "11월 7일 (토)" */
export function dayLabel(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  if (!year || !month || !day) return key;
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${month}월 ${day}일 (${weekday})`;
}

/** 올린 날짜(한국 시간)별 장수 — 오래된 날부터. 날짜를 못 읽는 답안지는 세지 않는다 */
export function summarizeScanDays(scans: readonly { createdAt: string; status: string }[]): ScanDay[] {
  const byDay = new Map<string, ScanDay>();
  for (const scan of scans) {
    const key = kstDay(scan.createdAt);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
    const entry = byDay.get(key) ?? { key, label: dayLabel(key), total: 0, reviewed: 0 };
    entry.total += 1;
    if (scan.status === "reviewed") entry.reviewed += 1;
    byDay.set(key, entry);
  }
  return [...byDay.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** 이 답안지를 그 날짜에 올렸는가 — day 가 null 이면 모두 통과 */
export function onDay(scan: { createdAt: string }, day: string | null): boolean {
  return day === null || kstDay(scan.createdAt) === day;
}
