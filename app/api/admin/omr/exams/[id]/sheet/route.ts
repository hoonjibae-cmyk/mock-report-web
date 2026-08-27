import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { generateSheet } from "@/lib/omr-api";
import { getExam, sheetSpecFor } from "@/lib/omr-exams";

export const runtime = "nodejs";
export const maxDuration = 60;

// OMR 답안지 PDF 다운로드: 시험 설정 → Python OMR API /generate → PDF 스트림
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApi("createReports");
  if (auth.response) return auth.response;
  const { id } = await context.params;

  try {
    const exam = await getExam(id);
    if (!exam) return NextResponse.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });

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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "답안지 생성 오류" },
      { status: 500 },
    );
  }
}
