import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getExam } from "@/lib/omr-exams";
import { draftOverviewComment, draftStudentComment } from "@/lib/omr-ai";
import { isGenericReport } from "@/lib/omr-report-types";
import { resolveAiModel } from "@/lib/ai-models";

export const runtime = "nodejs";
export const maxDuration = 120;

function asKeywords(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry).trim()).filter(Boolean).slice(0, 12);
}

/**
 * AI 초안 생성 (저장하지 않고 초안 텍스트만 반환)
 * body: {target:"overview", memo?} | {target:"student", reportId, displayKeywords[], weaveKeywords[]}
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApi("createReports");
  if (auth.response) return auth.response;
  const { id } = await context.params;

  try {
    const exam = await getExam(id);
    if (!exam) return NextResponse.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const model = resolveAiModel(body.model);

    if (body.target === "overview") {
      // 집단 통계는 이 시험의 아무 성적표에서나 동일하게 들어 있다
      const supabase = getSupabaseAdmin();
      const { data } = await supabase
        .from("student_reports")
        .select("report_data")
        .eq("exam_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data || !isGenericReport(data.report_data)) {
        return NextResponse.json(
          { error: "총평 초안은 성적표를 먼저 생성한 뒤 만들 수 있습니다(집단 통계 필요)." },
          { status: 400 },
        );
      }
      const report = data.report_data;
      const hardestItems = [...report.items]
        .sort((a, b) => a.correctRate - b.correctRate)
        .slice(0, 5)
        .map((item) => ({ no: item.no, correctRate: item.correctRate }));
      const draft = await draftOverviewComment(
        exam,
        { ...report.cohort, hardestItems },
        String(body.memo ?? "").slice(0, 1000),
        model,
      );
      return NextResponse.json({ ok: true, draft });
    }

    if (body.target === "student") {
      const reportId = String(body.reportId ?? "");
      if (!reportId) return NextResponse.json({ error: "reportId가 필요합니다." }, { status: 400 });
      const supabase = getSupabaseAdmin();
      const { data } = await supabase
        .from("student_reports")
        .select("id,exam_id,report_data")
        .eq("id", reportId)
        .maybeSingle();
      if (!data || data.exam_id !== id || !isGenericReport(data.report_data)) {
        return NextResponse.json({ error: "이 시험의 성적표가 아닙니다." }, { status: 404 });
      }
      const draft = await draftStudentComment(
        exam,
        data.report_data,
        { display: asKeywords(body.displayKeywords), weave: asKeywords(body.weaveKeywords) },
        model,
      );
      return NextResponse.json({ ok: true, draft });
    }

    return NextResponse.json({ error: "target은 overview 또는 student여야 합니다." }, { status: 400 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "AI 초안 생성 오류" },
      { status: 500 },
    );
  }
}
