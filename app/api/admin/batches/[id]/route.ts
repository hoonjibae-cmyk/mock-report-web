import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApi("deleteReports");
  if (auth.response) return auth.response;
  const { id } = await context.params;
  const supabase = getSupabaseAdmin();

  try {
    const { data: reports, error: readError } = await supabase.from("student_reports").select("id").eq("batch_id", id);
    if (readError) throw readError;
    const { data: batch, error: batchReadError } = await supabase.from("report_batches").select("id,title").eq("id", id).maybeSingle();
    if (batchReadError) throw batchReadError;
    if (!batch) return NextResponse.json({ error: "삭제할 성적표 묶음을 찾을 수 없습니다." }, { status: 404 });
    const { error: deleteError } = await supabase.from("report_batches").delete().eq("id", id);
    if (deleteError) throw deleteError;
    return NextResponse.json({
      ok: true,
      batchId: id,
      batchTitle: batch.title,
      deletedCount: reports?.length ?? 0,
      deletedReportIds: (reports ?? []).map((report) => report.id),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "성적표 묶음 삭제에 실패했습니다." },
      { status: 500 },
    );
  }
}
