/**
 * A4 쪽 맞춤 — 한 쪽의 내용이 종이보다 길면 그 쪽 전체를 조금 줄여 넣는다.
 *
 * 화면(브라우저)에서만 돌아가는 코드다. 성적표의 A4 판(`.a4-page`)은 쪽마다
 * 높이가 297mm로 고정돼 있어, 내용이 조금만 넘쳐도 인쇄할 때 바닥글만 남은
 * 빈 쪽이 생긴다. 그래서 그리기 전에 쪽마다 본문의 실제 높이를 재어 넘치는
 * 만큼 `--a4-content-scale` 배율로 줄인다. 글이 아주 길어도 70% 아래로는
 * 줄이지 않는다 — 그보다 작은 글씨는 종이에서 읽히지 않는다.
 *
 * 성적표 화면(ReportLayoutEffects)과 시험 전체 인쇄 화면(A4PrintShell)이 같이 쓴다.
 */

export const A4_MIN_SCALE = 0.7;

export function fitA4Pages(): void {
  const pages = [...document.querySelectorAll<HTMLElement>(".a4-page")];
  if (!pages.length) return;

  for (const page of pages) page.style.setProperty("--a4-content-scale", "1");

  // 이전 배율을 되돌린 뒤 한 번 다시 그리게 한다.
  void document.documentElement.offsetHeight;

  for (const page of pages) {
    const body = page.querySelector<HTMLElement>(".a4-page-body");
    if (!body) continue;

    const availableHeight = body.clientHeight;
    const naturalHeight = body.scrollHeight;
    if (!availableHeight || naturalHeight <= availableHeight + 1) continue;

    // 크롬이 인쇄할 때 반올림으로 바닥글만 남은 쪽을 만들지 않도록 조금 여유를 둔다.
    const scale = Math.max(A4_MIN_SCALE, Math.min(1, (availableHeight / naturalHeight) * 0.975));
    page.style.setProperty("--a4-content-scale", scale.toFixed(4));
  }
}

/** 글꼴·배치가 자리 잡은 뒤(두 프레임 뒤)에 실행한다 */
export function afterTwoFrames(callback: () => void): void {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(callback);
  });
}
