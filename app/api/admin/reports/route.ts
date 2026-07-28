import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function DELETE() {
  const auth = await authorizeApi("deleteReports");
  if (auth.response) return auth.response;

  const supabase = getSupabaseAdmin();
  try {
    const { data: reports, error: reportError } = await supabase.from("student_reports").select("id");
    if (reportError) throw reportError;
    const { data: batches, error: batchError } = await supabase.from("report_batches").select("id");
    if (batchError) throw batchError;
    const batchIds = (batches ?? []).map((batch) => batch.id);
    if (batchIds.length) {
      const { error: deleteError } = await supabase.from("report_batches").delete().in("id", batchIds);
      if (deleteError) throw deleteError;
    }
    return NextResponse.json({ ok: true, deletedCount: reports?.length ?? 0, deletedBatchCount: batchIds.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "전체 성적표 삭제에 실패했습니다." },
      { status: 500 },
    );
  }
}
