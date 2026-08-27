import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { parseTeacherComment, saveTeacherComment } from "@/lib/omr-comments";

export const runtime = "nodejs";

/** 학생별 개별 코멘트 저장 — body: {comment: TeacherComment} */
export async function PUT(request: Request, context: { params: Promise<{ reportId: string }> }) {
  const auth = await authorizeApi("createReports");
  if (auth.response) return auth.response;
  const { reportId } = await context.params;

  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("student_reports")
      .select("id")
      .eq("id", reportId)
      .maybeSingle();
    if (!data) return NextResponse.json({ error: "성적표를 찾을 수 없습니다." }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const incoming = parseTeacherComment(body.comment);
    if (incoming.personalFinal && incoming.personalFinal.length > 4000) {
      return NextResponse.json({ error: "코멘트는 4000자 이하로 작성해 주세요." }, { status: 400 });
    }
    const saved = await saveTeacherComment(reportId, incoming, auth.user.displayName);
    return NextResponse.json({ ok: true, comment: saved });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "코멘트 저장 오류" },
      { status: 500 },
    );
  }
}
