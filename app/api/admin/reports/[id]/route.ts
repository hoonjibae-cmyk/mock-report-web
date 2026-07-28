import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { createPublicToken } from "@/lib/crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { siteBaseUrl } from "@/lib/utils";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApi("manageReports");
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { action?: string } | null;
  const action = body?.action;
  const supabase = getSupabaseAdmin();

  try {
    if (action === "activate" || action === "deactivate") {
      const { error } = await supabase.from("student_reports").update({ is_active: action === "activate" }).eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true, active: action === "activate" });
    }

    if (action === "regenerate") {
      const token = createPublicToken();
      const { error } = await supabase.from("student_reports").update({ public_token: token, is_active: true }).eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true, token, url: `${siteBaseUrl(request.url)}/r/${token}` });
    }

    return NextResponse.json({ error: "지원하지 않는 작업입니다." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "성적표 상태 변경에 실패했습니다." },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApi("deleteReports");
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const supabase = getSupabaseAdmin();
  try {
    const { data: report, error: readError } = await supabase
      .from("student_reports")
      .select("id,batch_id,student_name")
      .eq("id", id)
      .maybeSingle();
    if (readError) throw readError;
    if (!report) return NextResponse.json({ error: "삭제할 성적표를 찾을 수 없습니다." }, { status: 404 });

    const { error: deleteError } = await supabase.from("student_reports").delete().eq("id", id);
    if (deleteError) throw deleteError;

    const { count, error: countError } = await supabase
      .from("student_reports")
      .select("id", { count: "exact", head: true })
      .eq("batch_id", report.batch_id);
    if (countError) throw countError;

    let batchDeleted = false;
    if ((count ?? 0) === 0) {
      const { error: batchError } = await supabase.from("report_batches").delete().eq("id", report.batch_id);
      if (batchError) throw batchError;
      batchDeleted = true;
    } else {
      const { error: updateError } = await supabase.from("report_batches").update({ report_count: count ?? 0 }).eq("id", report.batch_id);
      if (updateError) throw updateError;
    }

    return NextResponse.json({
      ok: true,
      deletedId: report.id,
      studentName: report.student_name,
      batchId: report.batch_id,
      batchDeleted,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "성적표 삭제에 실패했습니다." },
      { status: 500 },
    );
  }
}
