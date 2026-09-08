import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getExam } from "@/lib/omr-exams";
import { isGenericReport } from "@/lib/omr-report-types";
import { buildScoreSheet, type ScoreSource } from "@/lib/omr-score-export";
import { makeXlsx } from "@/lib/xlsx-lite";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * 응시생 성적 엑셀 다운로드 — 학생명 · 총점수 · 영역별 점수.
 *
 * 채점을 마친 뒤 반 편성이나 상담 자료로 점수만 한눈에 볼 때 쓴다. 값은
 * 성적표에서 그대로 가져오므로 학부모가 받은 점수와 어긋날 일이 없다.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApi("exportReports");
  if (auth.response) return auth.response;
  const { id } = await context.params;

  try {
    const exam = await getExam(id);
    if (!exam) return NextResponse.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("student_reports")
      // supabase-js는 select 문자열을 그대로 읽어 행 타입을 만든다. 변수로 빼면
      // 타입이 무너지므로 문자열을 여기 직접 적는다.
      .select("student_key,student_name,report_data,created_at")
      .eq("exam_id", id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(`성적표 조회 실패: ${error.message}`);

    const reports: ScoreSource[] = [];
    for (const row of data ?? []) {
      if (!isGenericReport(row.report_data)) continue;
      reports.push({
        studentKey: (row.student_key as string | null) ?? "",
        name: (row.student_name as string | null)?.trim() || "이름 없음",
        createdAt: (row.created_at as string | null) ?? "",
        data: row.report_data,
      });
    }

    if (reports.length === 0) {
      return NextResponse.json(
        {
          error:
            "이 시험으로 만든 성적표가 아직 없습니다. 학생 이름은 성적표를 만들 때 입력하므로, '성적표 생성'을 먼저 마쳐 주세요.",
        },
        { status: 400 },
      );
    }

    const buf = makeXlsx("성적", buildScoreSheet(reports));
    const filename = `${exam.title.replace(/[^\w가-힣.-]+/g, "_")}_성적.xlsx`;
    const encoded = encodeURIComponent(filename).replace(/'/g, "%27");
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="exam-scores.xlsx"; filename*=UTF-8''${encoded}`,
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "성적 엑셀 생성 오류" },
      { status: 500 },
    );
  }
}
