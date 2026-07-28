import type { SubjectKey } from "@/lib/types";

export function normalizeText(value: unknown): string {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeHeader(value: unknown): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[\s_\-–—·.()[\]{}]/g, "");
}


export function normalizeGradeValue(value: unknown): string {
  const text = normalizeText(value).replace(/\s+/g, "");
  const match = text.match(/[1-3]/);
  return match?.[0] ?? "3";
}

export function formatMiddleGrade(value: unknown): string {
  return `중${normalizeGradeValue(value)}`;
}

export function normalizePhone(value: unknown): string {
  return normalizeText(value).replace(/[^0-9]/g, "");
}

export function phoneLast4(value: unknown): string {
  const phone = normalizePhone(value);
  return phone.length >= 4 ? phone.slice(-4) : "";
}

export function maskPhone(value: unknown): string {
  const phone = normalizePhone(value);
  if (phone.length < 8) return phone ? "***" : "";
  const head = phone.slice(0, 3);
  const tail = phone.slice(-4);
  return `${head}-****-${tail}`;
}

export function studentMergeKey(name: string, school: string, phone: string): string {
  const n = normalizeHeader(name);
  const s = normalizeHeader(school);
  const p = normalizePhone(phone).slice(-4);
  return `${n}|${s}|${p}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function formatPercent(value: number, digits = 1): string {
  return `${round(value, digits).toFixed(digits)}%`;
}

export function subjectLabel(key: SubjectKey): string {
  return key === "korean" ? "국어" : key === "math" ? "수학" : "영어";
}

export function siteBaseUrl(requestUrl?: string): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  if (requestUrl) {
    const url = new URL(requestUrl);
    return `${url.protocol}//${url.host}`;
  }
  return "http://localhost:3000";
}

export function csvEscape(value: unknown): string {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

export function safeDateText(value: unknown, fallback: string): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const text = normalizeText(value);
  if (!text) return fallback;
  const normalized = text.replace(/[./]/g, "-");
  const match = normalized.match(/(20\d{2})-?(\d{1,2})-?(\d{1,2})/);
  if (!match) return text;
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}
