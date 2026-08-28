import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { createSignedViewUrl, getScan, SCAN_RETENTION_DAYS } from "@/lib/omr-scans";

export const runtime = "nodejs";

/**
 * 검수 화면에서 띄울 미리보기의 임시 열람 주소를 발급한다.
 *
 * 보관함이 비공개라 주소를 그대로 쓸 수 없고, API 키도 브라우저로 내보내지 않는다.
 * 그래서 서버가 짧은 수명(10분)의 서명 주소만 만들어 준다.
 */
export async function GET(_request: Request, context: { params: Promise<{ scanId: string }> }) {
  const auth = await authorizeApi("viewReports");
  if (auth.response) return auth.response;
  const { scanId } = await context.params;

  try {
    const scan = await getScan(scanId);
    if (!scan) return NextResponse.json({ error: "판독 결과를 찾을 수 없습니다." }, { status: 404 });
    if (!scan.previewPath) {
      return NextResponse.json(
        {
          error: `이 답안지는 미리보기가 없습니다. 미리보기 기능이 생기기 전에 올렸거나, 보관 기간(${SCAN_RETENTION_DAYS}일)이 지났을 수 있습니다. 다시 올리면 함께 만들어집니다.`,
        },
        { status: 404 },
      );
    }

    const url = await createSignedViewUrl(scan.previewPath);
    if (!url) {
      return NextResponse.json(
        { error: "미리보기를 불러오지 못했습니다. 보관함 설정을 확인해 주세요." },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true, url });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "미리보기 오류" },
      { status: 500 },
    );
  }
}
