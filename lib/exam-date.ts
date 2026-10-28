// 시험일 입력값 정리 — 만든 뒤에 시험일을 고칠 때 쓴다.
//
// 비우면 null(응시일 없음), 'YYYY-MM-DD'이면서 달력에 있는 날이어야 한다.
// 알림톡의 '응시일'과 목록·성적표 머리글이 이 값을 쓰므로 모양을 엄격히 본다.

export type ExamDateInput = { ok: true; value: string | null } | { ok: false; error: string };

export function normalizeExamDate(input: unknown): ExamDateInput {
  if (input === null || input === undefined) return { ok: true, value: null };
  if (typeof input !== "string") return { ok: false, error: "시험일은 2026-10-24 처럼 적어 주세요." };
  const text = input.trim();
  if (!text) return { ok: true, value: null };
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return { ok: false, error: "시험일은 2026-10-24 처럼 적어 주세요." };
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  const real =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  if (!real || year < 2000 || year > 2100) return { ok: false, error: "달력에 없는 날짜입니다." };
  return { ok: true, value: text };
}
