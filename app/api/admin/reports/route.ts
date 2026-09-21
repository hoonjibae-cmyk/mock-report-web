import { NextResponse } from "next/server";
import { authorizeAdminApi } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

/** 전체 삭제는 남의 것까지 한꺼번에 지우므로 총괄만 할 수 있다 */
export async function DELETE() {
  const auth = await authorizeAdminApi();
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
