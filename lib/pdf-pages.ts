// 여러 장이 든 PDF를 올리기 전에 쪽수를 세어 미리 알려주기 위한 것.
//
// 왜 필요한가: 화면은 스캔을 20장씩 나눠 보내지만, 60장이 **한 PDF 파일**에
// 들어 있으면 파일이 1개라 나눌 수가 없다. 60쪽이 통째로 한 요청에 실리고,
// 판독 서버가 그것을 다 읽기 전에 요청 제한 시간(5분)이 먼저 지나간다.
// 그러면 올린 것이 통째로 날아가고, 선생님은 처음부터 다시 해야 한다.

/** 한 PDF에 담아도 안전한 쪽수 */
export const PDF_PAGE_LIMIT = 30;

/**
 * 쪽수를 못 셌을 때 대신 보는 크기(바이트).
 *
 * 200dpi 흑백 스캔 한 쪽이 대략 0.3~0.6MB다. 30쪽이면 10~18MB쯤 되므로,
 * 20MB를 넘으면 30쪽을 넘겼다고 보아도 크게 틀리지 않는다.
 */
export const PDF_SIZE_LIMIT = 20 * 1024 * 1024;

/**
 * PDF 바이트에서 쪽수를 센다. 셀 수 없으면 null.
 *
 * PDF 안에는 쪽마다 `/Type /Page` 라는 표시가 있다. 그것을 센다.
 *
 * 이 방법이 늘 통하지는 않는다. 요즘 스캐너는 그 표시까지 압축해 넣기도 하고,
 * 그러면 하나도 못 찾는다. **못 찾았을 때 0쪽이라고 답하지 않고 null을 주는
 * 것이 이 함수의 핵심이다.** 모르면서 안다고 하면, 60쪽짜리를 안전하다고
 * 통과시켜 놓고 5분 뒤에 실패를 보게 된다.
 */
export function countPdfPages(bytes: Uint8Array): number | null {
  // PDF의 구조 표시는 아스키다. 바이트를 그대로 글자로 훑는다.
  let text = "";
  const CHUNK = 0x8000; // 한 번에 넘길 수 있는 인자 수 한계를 넘지 않게 나눈다
  for (let i = 0; i < bytes.length; i += CHUNK) {
    text += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }

  // '/Type /Page' 는 세고 '/Type /Pages'(쪽을 묶는 마디)는 빼야 한다.
  const matches = text.match(/\/Type\s*\/Page(?![sA-Za-z])/g);
  const counted = matches?.length ?? 0;
  return counted > 0 ? counted : null;
}

export interface PickedPdf {
  name: string;
  size: number;
  /** 센 쪽수. 못 셌으면 null */
  pages: number | null;
}

/**
 * 나눠 올려야 하는 PDF가 있으면 그 이유를 문장으로 돌려준다. 없으면 null.
 *
 * 쪽수를 셌으면 그 숫자로 말하고, 못 셌으면 크기로 말한다. 어느 쪽이든
 * **무엇을 어떻게 하라는 것인지** 까지 적는다. "PDF가 큽니다" 만으로는
 * 선생님이 할 수 있는 일이 없다.
 */
export function pdfSplitWarning(files: readonly PickedPdf[]): string | null {
  const tooManyPages = files.filter((f) => typeof f.pages === "number" && f.pages > PDF_PAGE_LIMIT);
  if (tooManyPages.length > 0) {
    const worst = tooManyPages.reduce((a, b) => ((a.pages ?? 0) >= (b.pages ?? 0) ? a : b));
    const others =
      tooManyPages.length > 1 ? ` 외 ${tooManyPages.length - 1}개` : "";
    return (
      `'${worst.name}'${others}에 ${worst.pages}쪽이 들어 있습니다. ` +
      `여러 장이 한 파일에 들어 있으면 나눠 보낼 수 없어 판독 도중 시간이 초과되고, ` +
      `그러면 올린 것이 모두 사라집니다. 스캐너에서 ${PDF_PAGE_LIMIT}쪽 이하로 끊어 다시 저장하거나, ` +
      `PDF 대신 낱장 이미지(JPG)로 저장해 올려 주세요.`
    );
  }

  const tooBig = files.filter((f) => f.pages === null && f.size > PDF_SIZE_LIMIT);
  if (tooBig.length > 0) {
    const worst = tooBig.reduce((a, b) => (a.size >= b.size ? a : b));
    return (
      `'${worst.name}'의 쪽수를 확인하지 못했습니다. 크기로 보아 ${PDF_PAGE_LIMIT}쪽을 ` +
      `넘을 수 있습니다. 여러 장이 든 PDF는 나눠 보낼 수 없어 판독 도중 시간이 초과될 수 있으니, ` +
      `${PDF_PAGE_LIMIT}쪽 이하로 끊어 저장하거나 낱장 이미지(JPG)로 올려 주세요.`
    );
  }

  return null;
}
