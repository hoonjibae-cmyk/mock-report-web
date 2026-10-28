// 담임 의견에서 학생을 부르는 법 — "김도영은" 대신 "김도영 학생은".
//
// AI 초안에 이름 뒤에 '학생'을 붙이라고 일러 두지만, 모델이 가끔 빼먹는다. 그래서
// 초안을 받은 뒤 한 번 더 손본다. 이름 바로 뒤에 조사가 붙은 자리를 찾아 '학생'을
// 끼우고, '학생'은 받침이 있으므로 조사를 거기에 맞춘다(는→은, 가→이, 를→을, 와→과,
// 로→으로). 이미 '김도영 학생'이라 적힌 곳은 건드리지 않는다.

const PARTICLES = ["은", "는", "이", "가", "을", "를", "의", "도", "에게", "께서", "과", "와", "으로", "로", "만", "부터", "까지", "처럼", "보다", "한테"];

/** '학생' 뒤에 오도록 조사를 받침 있는 꼴로 맞춘다 */
const AFTER_CONSONANT: Record<string, string> = { 는: "은", 가: "이", 를: "을", 와: "과", 로: "으로" };

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 본문에서 '이름+조사'를 '이름 학생+조사'로 바꾼다.
 *
 *   "김도영은 이번 시험에서"  → "김도영 학생은 이번 시험에서"
 *   "이수가 맞힌 문항"        → "이수 학생이 맞힌 문항"
 *   "김도영 학생은"           → 그대로
 *
 * 이름이 비었거나 한 글자면(성만 적힌 경우) 잘못 바꿀 위험이 커 손대지 않는다.
 */
export function withStudentTitle(text: string, name: string | null | undefined): string {
  const who = String(name ?? "").trim();
  if (!text || who.length < 2) return text;
  const particles = [...PARTICLES].sort((a, b) => b.length - a.length).join("|");
  // 이름 앞은 한글이 아니어야 한다(다른 이름의 일부가 아니게), 뒤의 조사 다음도 한글이 아니어야 한다
  const pattern = new RegExp(`(^|[^가-힣])${escapeRegExp(who)}(?!\\s*학생)(${particles})(?![가-힣])`, "g");
  return text.replace(pattern, (_m, before: string, particle: string) => {
    return `${before}${who} 학생${AFTER_CONSONANT[particle] ?? particle}`;
  });
}
