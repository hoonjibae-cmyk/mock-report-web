import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { csvEscape, siteBaseUrl } from "@/lib/utils";

export async function GET(request: Request) {
  const auth = await authorizeApi("exportReports");
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const batchId = url.searchParams.get("batchId");
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("student_reports")
    .select("student_name,school,grade,public_token,is_active,pin_required,created_at,batch_id")
    .order("student_name", { ascending: true });
  if (batchId) query = query.eq("batch_id", batchId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const baseUrl = siteBaseUrl(request.url);
  const rows = [
    ["학생명", "학교", "학년", "웹리포트 링크", "상태", "PIN 보호", "생성일"],
    ...(data ?? []).map((row) => [
      row.student_name,
      row.school ?? "",
      row.grade ?? "3",
      `${baseUrl}/r/${row.public_token}`,
      row.is_active ? "활성" : "중지",
      row.pin_required ? "사용" : "미사용",
      row.created_at,
    ]),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(csvEscape).join(",")).join("\r\n")}`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="mock-report-links.csv"`,
    },
  });
}
