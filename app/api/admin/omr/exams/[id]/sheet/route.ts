import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { generateSheet, OmrApiNotConfiguredError } from "@/lib/omr-api";
import { getExam, sheetSpecFor } from "@/lib/omr-exams";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * 이 엔드포인트는 링크로 직접 열린다(파일 내려받기). 실패했을 때 JSON을 그대로
 * 뱉으면 브라우저에 원문이 노출되므로, 읽을 수 있는 안내 페이지로 돌려준다.
 */
function errorPage(title: string, detail: string, status: number) {
  const esc = (text: string) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>답안지 생성 실패</title>
<style>
 body{margin:0;padding:48px 20px;background:#f4f6fa;color:#1f2430;
      font-family:system-ui,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif}
 .card{max-width:620px;margin:0 auto;background:#fff;border:1px solid #dfe4ec;
       border-radius:14px;padding:28px 30px}
 h1{margin:0;font-size:19px;color:#b3261e}
 p{margin:14px 0 0;font-size:14.5px;line-height:1.8}
 a{display:inline-block;margin-top:22px;padding:9px 16px;border-radius:8px;
   background:#183c73;color:#fff;text-decoration:none;font-size:14px;font-weight:700}
</style></head><body><div class="card">
<h1>${esc(title)}</h1><p>${esc(detail)}</p>
<a href="/admin/omr">← 시험 목록으로</a>
</div></body></html>`;
  return new NextResponse(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

// OMR 답안지 PDF 다운로드: 시험 설정 → Python OMR API /generate → PDF 스트림
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApi("createReports");
  if (auth.response) return auth.response;
  const { id } = await context.params;

  try {
    const exam = await getExam(id);
    if (!exam) return errorPage("시험을 찾을 수 없습니다.", "목록에서 다시 선택해 주세요.", 404);

    const result = await generateSheet(sheetSpecFor(exam));
    const pdf = Buffer.from(result.pdf_base64, "base64");
    const filename = `${exam.title.replace(/[^\w가-힣.-]+/g, "_")}_OMR.pdf`;

    return new NextResponse(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error(error);
    if (error instanceof OmrApiNotConfiguredError) {
      return errorPage("답안지 서비스가 아직 연결되지 않았습니다.", error.message, 503);
    }
    return errorPage(
      "답안지를 만들지 못했습니다.",
      error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.",
      500,
    );
  }
}
