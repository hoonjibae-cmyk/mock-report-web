/**
 * 학생이 틀린 문항 — 담임 의견을 쓸 때 참고하는 한 줄들.
 *
 * "몇 번을, 어느 영역에서, 무엇을 골라" 틀렸는지가 있어야 "시제 문항에서 늘
 * 3번을 고르네" 같은 개별 코멘트를 쓸 수 있다. 성적표 전체를 화면으로
 * 내려보내지 않고 이 줄들만 추린다.
 */
import type { MarkValue } from "@/lib/omr-answers";
import type { GenericItemResult } from "@/lib/omr-report-types";

export interface WrongItem {
  no: number;
  /** 분석영역(듣기·문법·독해…) — 안 적어 둔 시험이면 빈 문자열 */
  area: string;
  /** 내용 유형(빈칸추론…) — 없으면 빈 문자열 */
  content: string;
  /** 학생이 고른 것 — "3", "2,4"(모두 고르기), "무응답". 서술형은 받은 점수 */
  marked: string;
  /** 정답 — "1", "2,4". 서술형은 "서술" */
  answer: string;
}

function markText(value: MarkValue): string {
  if (Array.isArray(value)) return value.join(",");
  if (value === null || value === undefined) return "";
  return String(value);
}

/** 틀린 문항만 번호순으로 */
export function wrongItemsOf(items: readonly GenericItemResult[]): WrongItem[] {
  return items
    .filter((item) => !item.correct)
    .sort((a, b) => a.no - b.no)
    .map((item) => ({
      no: item.no,
      area: (item.area ?? "").trim(),
      content: (item.content ?? "").trim(),
      marked: item.essay ? `${item.earned}/${item.point}점` : markText(item.marked) || "무응답",
      answer: item.essay ? "서술" : markText(item.answer),
    }));
}
