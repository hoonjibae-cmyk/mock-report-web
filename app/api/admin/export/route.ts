import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { csvEscape, siteBaseUrl } from "@/lib/utils";

/** PostgREST 가 한 요청에 주는 최대 행 수 — 그 이상은 끊어 읽어야 한다 */
const PAGE = 1000;
/** 안전선 — 표가 이보다 커지면 CSV 가 아니라 다른 길이 필요하다 */
const MAX_ROWS = 50000;

interface ExportRow {
  student_name: string;
  school: string | null;
  grade: string | null;
  public_token: string;
  is_active: boolean;
  pin_required: boolean;
  created_at: string;
  batch_id: string | null;
}

/**
 * 성적표 링크 전체를 CSV 로. 예전에는 한 번에 읽어 1000행에서 조용히 잘렸다 —
 * 이제 1000행씩 끝까지 읽는다. 이름순, 같은 이름은 id 로 순서를 고정해 페이지
 * 경계에서 빠지거나 겹치지 않게 한다.
 */
export async function GET(request: Request) {
  const auth = await authorizeApi("exportReports");
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const batchId = url.searchParams.get("batchId");
  const supabase = getSupabaseAdmin();

  const rows: ExportRow[] = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
    let query = supabase
      .from("student_reports")
      .select("student_name,school,grade,public_token,is_active,pin_required,created_at,batch_id")
      .order("student_name", { ascending: true })
      .order("id", { ascending: true });
    if (batchId) query = query.eq("batch_id", batchId);
    const { data, error } = await query.range(offset, offset + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const page = (data ?? []) as ExportRow[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }

  const baseUrl = siteBaseUrl(request.url);
  const lines = [
    ["학생명", "학교", "학년", "웹리포트 링크", "상태", "PIN 보호", "생성일"],
    ...rows.map((row) => [
      row.student_name,
      row.school ?? "",
      row.grade ?? "3",
      `${baseUrl}/r/${row.public_token}`,
      row.is_active ? "활성" : "중지",
      row.pin_required ? "사용" : "미사용",
      row.created_at,
    ]),
  ];
  const csv = `﻿${lines.map((row) => row.map(csvEscape).join(",")).join("\r\n")}`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="mock-report-links.csv"`,
    },
  });
}
