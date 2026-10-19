/**
 * 클립보드에 글을 넣는다 — 브라우저에서만 부른다.
 *
 * 클립보드 API 가 막힌 브라우저(http, 권한 거부)에서는 보이지 않는 입력칸을
 * 골라 복사하는 옛 방식으로 한 번 더 시도한다. 둘 다 안 되면 false.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 아래 옛 방식으로
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}
