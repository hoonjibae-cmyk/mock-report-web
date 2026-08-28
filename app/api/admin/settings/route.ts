import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { readSettings, setAiModel, setCommentStyle } from "@/lib/app-settings";

export const runtime = "nodejs";

/** 현재 시스템 설정 */
export async function GET() {
  const auth = await authorizeApi("viewReports");
  if (auth.response) return auth.response;
  return NextResponse.json({ ok: true, settings: await readSettings() });
}

/** 설정 변경 — 관리자만 */
export async function PUT(request: Request) {
  const auth = await authorizeApi("viewReports");
  if (auth.response) return auth.response;
  if (auth.user?.role !== "admin") {
    return NextResponse.json({ error: "관리자만 시스템 설정을 바꿀 수 있습니다." }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    // 두 설정을 한 화면에서 다루므로, 보내온 항목만 골라 저장한다
    if (body.commentStyle !== undefined) {
      const commentStyle = await setCommentStyle(body.commentStyle, auth.user.username);
      return NextResponse.json({ ok: true, settings: { commentStyle, storageReady: true } });
    }
    const aiModel = await setAiModel(body.aiModel, auth.user.username);
    return NextResponse.json({ ok: true, settings: { aiModel, storageReady: true } });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "설정 저장 오류" },
      { status: 500 },
    );
  }
}
