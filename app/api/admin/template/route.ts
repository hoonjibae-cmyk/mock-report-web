import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DOWNLOAD_NAME = "2026_중3_모의고사_성적입력_템플릿.xlsx";

export async function GET() {
  const auth = await authorizeApi("downloadTemplate");
  if (auth.response) return auth.response;

  try {
    const templatePath = path.join(process.cwd(), "public", "template", "score-input-template-2026.xlsx");
    const file = await readFile(templatePath);
    const encodedName = encodeURIComponent(DOWNLOAD_NAME).replace(/'/g, "%27");
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="score-input-template-2026.xlsx"; filename*=UTF-8''${encodedName}`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Template download failed", error);
    return NextResponse.json({ error: "입력 템플릿 파일을 불러오지 못했습니다." }, { status: 500 });
  }
}
