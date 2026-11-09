/**
 * A4 쪽 나누기 — 성적표의 덩어리(머리글·점수·영역·문항·의견…)를 몇 쪽에 나눠 실을지 정한다.
 *
 * 브라우저는 고정 높이 쪽(`.a4-page`) 안에서 스스로 쪽을 넘기지 못한다. 그래서
 * 서버에서 덩어리마다 대략의 높이(mm)를 어림잡아 **순서대로** 담고, 다음 덩어리가
 * 안 들어가면 새 쪽을 연다. 덩어리는 쪼개지 않는다 — 표나 의견 글이 쪽 사이에서
 * 잘리는 것보다 아래가 조금 비는 편이 낫다.
 *
 * 어림이 조금 빗나가도 괜찮다. 화면에서 `fitA4Pages`가 넘치는 쪽을 70%까지 줄여
 * 넣으므로, 여기서는 '대체로 맞는' 높이면 된다.
 */

/** A4 한 쪽에서 내용이 들어가는 세로 길이(mm) — 297 − 위 여백 10 − 아래 여백·바닥글 19 */
export const A4_BODY_MM = 268;
/** 덩어리 사이 간격(mm) — CSS의 .a4g-body gap 과 같아야 한다 */
export const A4_GAP_MM = 4;

export interface A4Block {
  key: string;
  /** 어림한 높이(mm) */
  height: number;
}

/**
 * 덩어리를 순서대로 쪽에 담는다. 한 쪽에 안 들어가면 다음 쪽으로 넘기고,
 * 혼자서도 한 쪽을 넘는 덩어리는 제 쪽을 홀로 차지한다(화면에서 줄여 넣는다).
 */
export function packA4Pages<T extends A4Block>(
  blocks: readonly T[],
  capacity: number = A4_BODY_MM,
  gap: number = A4_GAP_MM,
): T[][] {
  const pages: T[][] = [];
  let page: T[] = [];
  let used = 0;
  for (const block of blocks) {
    if (page.length > 0 && used + gap + block.height > capacity) {
      pages.push(page);
      page = [];
      used = 0;
    }
    used += (page.length > 0 ? gap : 0) + block.height;
    page.push(block);
  }
  if (page.length > 0) pages.push(page);
  return pages;
}

/**
 * 글자 하나의 너비를 한글 한 글자(전각) 기준 1로 센다. 영문·숫자·공백은 반각(0.55)이다.
 * 성적표 의견은 한글이 대부분이라 전각 기준으로 줄 수를 어림한다.
 */
export function textWidthUnits(text: string): number {
  let units = 0;
  for (const ch of text) units += ch.codePointAt(0)! >= 0x2e80 ? 1 : 0.55;
  return units;
}

/** 글이 몇 줄을 차지하는지 — 줄바꿈 문단마다 적어도 한 줄, 빈 글은 0줄 */
export function estimateLines(text: string | null | undefined, unitsPerLine: number): number {
  if (!text || !text.trim()) return 0;
  return text
    .split(/\r?\n/)
    .reduce((sum, paragraph) => sum + Math.max(1, Math.ceil(textWidthUnits(paragraph) / unitsPerLine)), 0);
}

/** 글 덩어리의 높이(mm) — 줄 수 × 줄 높이 + 제목·여백 */
export function estimateTextHeight(
  text: string | null | undefined,
  options: { unitsPerLine: number; lineMm: number; extraMm?: number },
): number {
  const lines = estimateLines(text, options.unitsPerLine);
  if (lines === 0) return 0;
  return lines * options.lineMm + (options.extraMm ?? 0);
}
