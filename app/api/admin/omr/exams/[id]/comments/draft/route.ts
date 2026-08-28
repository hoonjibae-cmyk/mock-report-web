import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getExam } from "@/lib/omr-exams";
import { draftAreaNotes, draftOverviewComment, draftStudentComment } from "@/lib/omr-ai";
import { isGenericReport } from "@/lib/omr-report-types";
import { pointFor } from "@/lib/omr-scoring";
import { getAiModel } from "@/lib/app-settings";

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
    // 요청마다 고르지 않고, 설정에 저장된 모델을 쓴다
    const model = await getAiModel();

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
      const result = await draftStudentComment(
        exam,
        data.report_data,
        { display: asKeywords(body.displayKeywords), weave: asKeywords(body.weaveKeywords) },
        model,
      );
      // 화면은 종합 평가와 영역별 서술을 따로 다룬다(등급은 성취율에서 이미 제안됨)
      return NextResponse.json({ ok: true, draft: result.overall, areaDrafts: result.areas });
    }

    if (body.target === "areaNotes") {
      // 영역별 출제 안내 — 시험에 어떤 영역·유형이 나왔는지는 정답표에서 읽는다
      const groups = new Map<string, { contents: Set<string>; possible: number }>();
      for (const [no, meta] of Object.entries(exam.questionMeta ?? {})) {
        const area = String(meta?.area ?? "").trim();
        if (!area) continue;
        const entry = groups.get(area) ?? { contents: new Set<string>(), possible: 0 };
        const content = String(meta?.content ?? "").trim();
        if (content) entry.contents.add(content);
        entry.possible += pointFor(exam, Number(no));
        groups.set(area, entry);
      }
      if (groups.size === 0) {
        return NextResponse.json(
          {
            error:
              "문항별 분석영역이 아직 없습니다. 정답 입력 엑셀의 '분석영역' 칸을 채워 올린 뒤 다시 시도해 주세요.",
          },
          { status: 400 },
        );
      }
      const areas = await draftAreaNotes(
        exam,
        [...groups.entries()].map(([area, entry]) => ({
          area,
          contents: [...entry.contents],
          possible: Math.round(entry.possible * 10) / 10,
        })),
        String(body.memo ?? "").slice(0, 1000),
        model,
      );
      return NextResponse.json({ ok: true, areas });
    }

    return NextResponse.json(
      { error: "target은 overview · student · areaNotes 중 하나여야 합니다." },
      { status: 400 },
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "AI 초안 생성 오류" },
      { status: 500 },
    );
  }
}
