// 한 문항의 '표기' 또는 '정답'을 다루는 공용 헬퍼.
//
// 값은 세 가지 모양으로 저장된다(과거 데이터 호환):
//   null / undefined → 무응답·미등록
//   3                → 보기 하나
//   [2, 4]           → 보기 여럿 ('모두 고르기' 문항, 또는 학생의 중복 표기)
// 계산은 항상 정규화된 배열로 하고, 저장할 때만 다시 압축한다.

/** 문항 하나의 정답/표기 값 (객관식 버블) */
export type MarkValue = number | number[] | null;

/**
 * 정답표에 담기는 값.
 *
 * 객관식은 보기번호지만 주관식은 문장이다. 주관식 정답이 여럿이면 `|`로 나눠
 * 한 문자열에 적는다(lib/essay-grading.ts의 parseAcceptedAnswers가 읽는다).
 */
export type AnswerKeyValue = MarkValue | string;

/** 어떤 모양이든 오름차순·중복 없는 보기번호 배열로 정규화 */
export function toChoices(value: AnswerKeyValue | undefined): number[] {
  if (value == null) return [];
  // 주관식 정답(문장)은 보기번호가 아니다. "24" 같은 답을 24번 보기로
  // 오해하면 채점이 조용히 틀어지므로 여기서 명확히 걸러 낸다.
  if (typeof value === "string") return [];
  const list = Array.isArray(value) ? value : [value];
  const seen = new Set<number>();
  for (const entry of list) {
    const n = typeof entry === "number" ? entry : Number(entry);
    if (Number.isFinite(n) && n >= 1) seen.add(Math.floor(n));
  }
  return [...seen].sort((a, b) => a - b);
}

/** 저장용으로 압축 — 없으면 null, 하나면 숫자, 여럿이면 배열 */
export function compactMark(choices: number[]): MarkValue {
  const list = toChoices(choices);
  if (list.length === 0) return null;
  if (list.length === 1) return list[0];
  return list;
}

/** 두 표기가 완전히 같은 집합인가 (채점 기준) */
export function sameChoices(a: AnswerKeyValue | undefined, b: AnswerKeyValue | undefined): boolean {
  const left = toChoices(a);
  const right = toChoices(b);
  if (left.length === 0 || right.length === 0) return false;
  if (left.length !== right.length) return false;
  return left.every((value, i) => value === right[i]);
}

/** 정답이 둘 이상 = '모두 고르기' 문항 */
export function isMultiAnswer(value: AnswerKeyValue | undefined): boolean {
  return toChoices(value).length > 1;
}

const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];

/** 화면 표기용 — [2,4] → "②④", 빈 값은 dash */
export function formatChoices(value: AnswerKeyValue | undefined, dash = "—"): string {
  const list = toChoices(value);
  if (list.length === 0) return dash;
  return list.map((n) => CIRCLED[n - 1] ?? String(n)).join("");
}

/** 엑셀·CSV 입력 파싱 — "2,4" / "2 4" / "24" / "②④" 모두 허용 */
export function parseChoices(input: unknown, numChoices: number): number[] {
  if (input == null) return [];
  if (typeof input === "number") return toChoices(input);
  const text = String(input).trim();
  if (!text) return [];

  const found: number[] = [];
  for (const ch of text) {
    const circled = CIRCLED.indexOf(ch);
    if (circled >= 0) {
      found.push(circled + 1);
      continue;
    }
    if (ch >= "1" && ch <= "9") found.push(Number(ch));
  }
  // 보기 수를 넘는 값이 섞였다면(예: 두 자리 숫자를 붙여 쓴 경우) 버린다.
  return toChoices(found.filter((n) => n <= numChoices));
}

/** 엑셀 저장용 — [2,4] → "2,4" */
export function serializeChoices(value: AnswerKeyValue | undefined): string {
  const list = toChoices(value);
  return list.length ? list.join(",") : "";
}
