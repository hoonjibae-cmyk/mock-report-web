/**
 * 한자를 걷어낸다. 학부모가 읽는 글은 한글로만 나가야 한다.
 *
 * 프롬프트로 "한자를 쓰지 말라"고 해도 모델은 가끔 `학생之間의` 처럼 섞어
 * 낸다. 부탁은 보장이 아니므로 받은 뒤에 한 번 더 거른다.
 *
 * 지우기만 해도 문장이 살아나는 이유는, 한국어 글에서 한자가 끼어들 때는
 * 앞뒤에 띄어쓰기가 없기 때문이다 — `학생之間의` 에서 之間만 빼면 `학생의`가
 * 되어 뜻과 문법이 그대로 유지된다.
 */
export function stripHanja(value: string): string {
  return String(value ?? "")
    // CJK 통합 한자 + 확장 A + 호환 한자
    .replace(/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g, "")
    // 한자만 들어 있던 괄호는 통째로 없앤다 — `듣기() 영역`이 남으면 더 어색하다
    .replace(/\s*[(（[]\s*[)）\]]/g, "")
    // 한자를 지운 자리에 남는 겹공백·공백 뒤 문장부호를 정리한다
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.!?%)\]}])/g, "$1")
    .replace(/([(\[{])\s+/g, "$1")
    .trim();
}

/** 한자가 섞여 있는가 — 화면에서 경고하거나 다시 만들 때 쓴다 */
export function containsHanja(value: string): boolean {
  return /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/.test(String(value ?? ""));
}

const KOREAN_COUNT = "(?:\\d+|한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)";

const ACADEMY_COMPARISON_PATTERNS = [
  /학원\s*(?:내|응시자|평균|순위|상위|전체)/,
  /(?:같은|전체|이번)\s*(?:학원\s*)?(?:응시자|응시생)\s*중/,
  /(?:학생|응시자|응시생)\s*중\s*(?:가장|제일|최고|상위|1위)/,
  new RegExp(`${KOREAN_COUNT}\\s*(?:명(?:의)?\\s*)?(?:학생|응시자|응시생)\\s*중`),
];

function normalizeInternalRankClause(value: string): string {
  let text = value;

  // 예: "전체 평균은 80.3점으로 네 학생 중 가장 높고, ..."
  text = text.replace(
    new RegExp(
      `((?:전체|과목)\\s*평균은\\s*[\\d.]+점)(?:으로|이며)\\s*${KOREAN_COUNT}\\s*(?:명(?:의)?\\s*)?(?:학생|응시자|응시생)\\s*중\\s*(?:가장|제일)\\s*높고\\s*,?`,
      "g",
    ),
    "$1이며,",
  );

  // 일반적인 학원 내부 순위·최고 표현은 문장 안에서 제거합니다.
  text = text
    .replace(/학원\s*내(?:에서)?\s*(?:가장|제일)\s*(?:높은|높고|우수한|좋은)\s*(?:점수|성적)?\s*(?:이며|이고|로|,)?\s*/g, "")
    .replace(/학원\s*내\s*상위\s*[\d.]+%\s*(?:이고|이며|,)?\s*/g, "")
    .replace(/학원\s*내\s*순위\s*[\d.]+위\s*(?:이고|이며|,)?\s*/g, "")
    .replace(new RegExp(`${KOREAN_COUNT}\\s*(?:명(?:의)?\\s*)?(?:학생|응시자|응시생)\\s*중\\s*(?:가장|제일|최고|1위)\\s*[^,.!?]*[,，]?`, "g"), "")
    .replace(/\s+,/g, ",")
    .replace(/,{2,}/g, ",")
    .replace(/^이며,?\s*/g, "")
    .replace(/^[,，]\s*/g, "")
    .replace(/\s+\./g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();

  return text;
}

export function containsAcademyComparison(value: string): boolean {
  return ACADEMY_COMPARISON_PATTERNS.some((pattern) => pattern.test(value));
}

export function sanitizeNationalReviewText(value: string): string {
  const normalized = normalizeInternalRankClause(String(value ?? ""));
  if (!containsAcademyComparison(normalized)) return normalized;

  // 남아 있는 내부 비교 문장은 삭제하고 전국 기준 문장만 유지합니다.
  const sentences = normalized
    .split(/(?<=[.!?。！？])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .filter((sentence) => !containsAcademyComparison(sentence));

  return sentences.join(" ").trim();
}

export function sanitizeNationalReviewList(values: string[]): string[] {
  return values.map(sanitizeNationalReviewText).filter(Boolean);
}
