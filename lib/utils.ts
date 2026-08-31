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

/**
 * 성적표 잠금 화면에 띄울 번호 — `010-1234-****`
 *
 * **뒤 4자리를 가린다.** 그 네 자리가 곧 열쇠이기 때문이다. 예전에는 반대로
 * 가운데를 가리고 뒷자리를 드러냈는데, 그러면 화면이 답을 인쇄하는 셈이라
 * 링크만 받은 사람도 그대로 열 수 있었다.
 *
 * 가운데를 보여 주는 것은 "누구 번호인가"를 알리기 위해서다. 아버지·어머니
 * 번호가 헷갈려 엉뚱한 번호로 시도하는 일을 막아 준다. 가운데 네 자리만으로는
 * 아무것도 열 수 없다.
 */
export function maskPhoneForGate(value: unknown): string {
  const phone = normalizePhone(value);
  if (phone.length < 8) return phone ? "***" : "";
  const head = phone.slice(0, 3);
  const middle = phone.slice(3, -4);
  return `${head}-${middle}-****`;
}

/**
 * 저장된 마스킹 번호를 잠금 화면에 띄워도 되는지 거른다.
 *
 * 이 함수가 있는 이유는 **예전 성적표** 때문이다. 예전에는 `010-****-4316`
 * 처럼 뒤 4자리가 드러난 채로 저장했는데, 그 값을 그대로 띄우면 열쇠가
 * 노출된다. 형식이 맞는 것만 통과시키고, 나머지는 아무것도 보여 주지 않는다.
 */
export function gatePhoneHint(stored: string | null | undefined): string {
  const text = String(stored ?? "").trim();
  return /^01[0-9]-\d{3,4}-\*{4}$/.test(text) ? text : "";
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
