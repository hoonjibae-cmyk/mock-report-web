import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { getExam } from "@/lib/omr-exams";
import { createSignedScanUpload } from "@/lib/omr-scans";

export const runtime = "nodejs";

/**
 * 큰 파일용 직접 업로드 URL 발급.
 * Vercel 서버리스 함수는 요청 본문이 4.5MB로 제한되므로, 그보다 큰 스캔 파일은
 * 브라우저가 이 URL로 Storage에 직접 올리고 경로만 서버에 전달한다.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApi("createReports");
  if (auth.response) return auth.response;
  const { id } = await context.params;

  try {
    const exam = await getExam(id);
    if (!exam) return NextResponse.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const names: string[] = Array.isArray(body.filenames)
      ? body.filenames.map((n: unknown) => String(n)).filter(Boolean).slice(0, 60)
      : [];
    if (names.length === 0) {
      return NextResponse.json({ error: "파일 이름이 필요합니다." }, { status: 400 });
    }

    const uploads: Array<{ filename: string; path: string; signedUrl: string; token: string }> = [];
    for (const filename of names) {
      const signed = await createSignedScanUpload(id, filename);
      if (!signed) {
        return NextResponse.json(
          {
            error:
              "큰 파일 업로드에는 스캔 보관함이 필요합니다. Supabase → Storage에서 'omr-scans' 버킷(비공개)을 만든 뒤 다시 시도해 주세요.",
          },
          { status: 400 },
        );
      }
      uploads.push({ filename, ...signed });
    }

    return NextResponse.json({ ok: true, uploads });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "업로드 URL 발급 오류" },
      { status: 500 },
    );
  }
}
