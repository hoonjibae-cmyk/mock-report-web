import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { createSignedViewUrl, getScan } from "@/lib/omr-scans";

export const runtime = "nodejs";

/**
 * 주관식 답안 칸 이미지의 임시 열람 주소를 발급한다.
 *
 * 채점 화면에서 전사한 글자 옆에 손글씨 원본을 나란히 띄우기 위한 것이다.
 * 잘못 읽은 것이 있으면 눈으로 바로 확인되고, 그 자리에서 고칠 수 있다.
 * 보관함이 비공개라 짧은 수명(10분)의 서명 주소만 만들어 준다.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ scanId: string; questionNo: string }> },
) {
  const auth = await authorizeApi("viewReports");
  if (auth.response) return auth.response;
  const { scanId, questionNo } = await context.params;

  try {
    const scan = await getScan(scanId);
    if (!scan) return NextResponse.json({ error: "답안지를 찾을 수 없습니다." }, { status: 404 });

    const path = scan.essayCrops?.[String(Number(questionNo))];
    if (!path) {
      return NextResponse.json(
        {
          error:
            "이 답안지에는 주관식 이미지가 없습니다. 전사 기능이 생기기 전에 올렸다면 스캔을 다시 올려 주세요.",
        },
        { status: 404 },
      );
    }

    const url = await createSignedViewUrl(path);
    if (!url) {
      return NextResponse.json(
        { error: "이미지를 불러오지 못했습니다. 보관함 설정을 확인해 주세요." },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true, url });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "주관식 이미지 오류" },
      { status: 500 },
    );
  }
}
