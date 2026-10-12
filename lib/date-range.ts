/**
 * 생성일 기간 — 웹 리포트 목록을 서버에서 기간으로 잘라 가져올 때의 규칙.
 *
 * 날짜는 한국 시간(KST, UTC+9) 기준의 하루다. created_at 은 UTC 로 저장되어
 * 있어, 'YYYY-MM-DD' 글자를 그대로 잘라 비교하면 새벽 0~9시에 만든 성적표가
 * 전날로 넘어간다. 서버 조건(rangeBounds)과 화면 필터(inRange)가 같은 규칙을
 * 써야 둘이 어긋나지 않는다.
 */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface DateRange {
  from: string | null;
  to: string | null;
}

export const EMPTY_RANGE: DateRange = { from: null, to: null };

function pickDay(value: unknown): string | null {
  const text = Array.isArray(value) ? value[0] : value;
  if (typeof text !== "string" || !DAY_RE.test(text)) return null;
  return Number.isNaN(Date.parse(`${text}T00:00:00Z`)) ? null : text;
}

/** 주소(?from=&to=)에서 온 값 — 'YYYY-MM-DD' 모양이 아니면 버리고, 앞뒤가 바뀌었으면 바로잡는다 */
export function parseDateRange(from: unknown, to: unknown): DateRange {
  let a = pickDay(from);
  let b = pickDay(to);
  if (a && b && a > b) [a, b] = [b, a];
  return { from: a, to: b };
}

export function hasRange(range: DateRange): boolean {
  return Boolean(range.from || range.to);
}

/** ISO 시각의 한국 날짜 'YYYY-MM-DD' */
export function kstDay(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return String(iso).slice(0, 10);
  return new Date(t + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 서버 조건 — created_at >= gte 이고 < lt (한국 시간 하루의 경계를 UTC 로) */
export function rangeBounds(range: DateRange): { gte: string | null; lt: string | null } {
  const startOf = (day: string) => Date.parse(`${day}T00:00:00+09:00`);
  return {
    gte: range.from ? new Date(startOf(range.from)).toISOString() : null,
    lt: range.to ? new Date(startOf(range.to) + DAY_MS).toISOString() : null,
  };
}

/** 화면 필터 — 서버 조건과 같은 하루 경계 */
export function inRange(iso: string, range: DateRange): boolean {
  const day = kstDay(iso);
  if (range.from && day < range.from) return false;
  if (range.to && day > range.to) return false;
  return true;
}

/** 기간을 글로 — "2026-10-01 ~ 2026-10-12", 한쪽만 있으면 "2026-10-01 ~" */
export function rangeLabel(range: DateRange): string {
  if (!hasRange(range)) return "";
  return `${range.from ?? ""} ~ ${range.to ?? ""}`.trim();
}
