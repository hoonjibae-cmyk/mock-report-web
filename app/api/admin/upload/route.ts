import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { addAiReviews } from "@/lib/ai";
import { getAiModel } from "@/lib/app-settings";
import { analyzeCohort, mergeStudents } from "@/lib/analysis";
import { createPublicToken, hashPin } from "@/lib/crypto";
import { mergeParsedResults, parseWorkbookBuffer } from "@/lib/parser";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { phoneLast4, siteBaseUrl } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const auth = await authorizeApi("createReports");
  if (auth.response) return auth.response;
  const currentUser = auth.user;

  try {
    const formData = await request.formData();
    const files = formData.getAll("files").filter((value): value is File => value instanceof File);
    const reportTitle = String(formData.get("reportTitle") || "중3 국영수 전국 모의고사 개인 성적표").trim();
    const examLabel = String(formData.get("examLabel") || "2026년도").trim();
    const requestPin = String(formData.get("pinRequired") ?? "false") === "true";
    // AI 모델은 설정(관리자 → 설정)에서 정한 값을 전체가 공유한다
    const aiModel = await getAiModel();

    if (files.length === 0) return NextResponse.json({ error: "엑셀 파일을 한 개 이상 선택해 주세요." }, { status: 400 });
    if (files.reduce((sum, file) => sum + file.size, 0) > 4 * 1024 * 1024) {
      return NextResponse.json({ error: "한 번에 업로드할 파일의 총크기는 4MB 이하로 제한됩니다." }, { status: 400 });
    }
    if (files.some((file) => !file.name.toLowerCase().endsWith(".xlsx"))) {
      return NextResponse.json({ error: "보안을 위해 .xlsx 형식만 업로드할 수 있습니다." }, { status: 400 });
    }

    const parsedResults = [];
    for (const file of files) parsedResults.push(await parseWorkbookBuffer(await file.arrayBuffer(), file.name));
    const parsed = mergeParsedResults(parsedResults);
    const bundles = mergeStudents(parsed.students);
    if (bundles.length === 0) {
      return NextResponse.json({ error: "분석 가능한 학생 데이터를 찾지 못했습니다.", warnings: parsed.warnings }, { status: 400 });
    }

    let reports = analyzeCohort(bundles, reportTitle, examLabel);
    reports = await addAiReviews(reports, aiModel);

    const supabase = getSupabaseAdmin();
    const { data: batch, error: batchError } = await supabase
      .from("report_batches")
      .insert({
        title: reportTitle,
        exam_label: examLabel,
        source_filename: files.map((file) => file.name).join(", "),
        report_count: reports.length,
        warnings: parsed.warnings,
        created_by_name: currentUser.displayName,
        created_by_username: currentUser.username,
      })
      .select("id")
      .single();
    if (batchError || !batch) throw new Error(`성적표 묶음 저장 실패: ${batchError?.message ?? "알 수 없는 오류"}`);

    const rows = reports.map((report, index) => {
      const bundle = bundles[index];
      const token = createPublicToken();
      const pin = phoneLast4(bundle.parentPhone);
      const pinRequired = requestPin && Boolean(pin);
      return {
        batch_id: batch.id,
        public_token: token,
        student_name: report.student.name,
        school: report.student.school,
        grade: report.student.grade,
        parent_phone_masked: report.student.phoneMasked,
        access_pin_hash: pinRequired ? hashPin(pin) : null,
        pin_required: pinRequired,
        is_active: true,
        report_data: report,
        ai_summary: report.aiReview,
      };
    });

    const { data: inserted, error: insertError } = await supabase
      .from("student_reports")
      .insert(rows)
      .select("id,public_token,student_name,school,is_active,pin_required,created_at");
    if (insertError || !inserted) {
      await supabase.from("report_batches").delete().eq("id", batch.id);
      throw new Error(`학생별 성적표 저장 실패: ${insertError?.message ?? "알 수 없는 오류"}`);
    }

    const baseUrl = siteBaseUrl(request.url);
    return NextResponse.json({
      ok: true,
      batchId: batch.id,
      reportCount: inserted.length,
      aiModel,
      warnings: parsed.warnings,
      reports: inserted.map((row) => ({
        id: row.id,
        studentName: row.student_name,
        school: row.school ?? "",
        token: row.public_token,
        url: `${baseUrl}/r/${row.public_token}`,
        active: row.is_active,
        pinRequired: row.pin_required,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "성적표 생성 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
