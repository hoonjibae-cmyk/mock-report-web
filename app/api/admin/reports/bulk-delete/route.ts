import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { canDeleteOwned } from "@/lib/ownership";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const maxDuration = 60;

/** 한 번에 지울 수 있는 최대 건수 — 실수로 전체가 날아가는 것을 막는 안전선 */
const MAX_IDS = 2000;
/** PostgREST 의 in() 은 너무 길면 거부된다 — 나눠서 보낸다 */
const CHUNK = 200;

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * 고른 성적표를 한꺼번에 지운다 — 웹 리포트 화면에서 필터로 추린 것을 그대로.
 *
 * 화면이 보낸 id 를 그대로 믿지 않는다. 성적표마다 주인(묶음을 만든 사람)을
 * 다시 확인해 만든 사람이거나 총괄일 때만 지우고, 나머지는 세어서 돌려준다.
 * 비게 된 묶음은 함께 지우고, 남은 묶음은 건수를 고친다 — 건별 삭제와 같은 규칙.
 */
export async function POST(request: Request) {
  const auth = await authorizeApi("deleteReports");
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => ({}));
  const raw: unknown[] = Array.isArray(body.ids) ? body.ids : [];
  const ids = [...new Set(raw.filter((v): v is string => typeof v === "string" && v.length > 0))];
  if (ids.length === 0) return NextResponse.json({ error: "지울 성적표가 없습니다." }, { status: 400 });
  if (ids.length > MAX_IDS) {
    return NextResponse.json({ error: `한 번에 최대 ${MAX_IDS}건까지 지울 수 있습니다.` }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  try {
    // 주인 확인 — 성적표의 주인은 그 묶음을 만든 사람이다
    const allowed: string[] = [];
    const batchIds = new Set<string>();
    let denied = 0;
    for (const part of chunks(ids, CHUNK)) {
      const { data, error } = await supabase
        .from("student_reports")
        .select("id,batch_id,report_batches(created_by_username)")
        .in("id", part);
      if (error) throw error;
      for (const row of data ?? []) {
        const rel = Array.isArray(row.report_batches) ? row.report_batches[0] : row.report_batches;
        const owner = (rel as { created_by_username?: string | null } | null)?.created_by_username ?? null;
        if (!canDeleteOwned(auth.user, owner)) {
          denied += 1;
          continue;
        }
        allowed.push(row.id as string);
        if (row.batch_id) batchIds.add(row.batch_id as string);
      }
    }

    for (const part of chunks(allowed, CHUNK)) {
      const { error } = await supabase.from("student_reports").delete().in("id", part);
      if (error) throw error;
    }

    // 비게 된 묶음은 지우고, 남은 묶음은 건수를 고친다
    let deletedBatchCount = 0;
    for (const batchId of batchIds) {
      const { count, error: countError } = await supabase
        .from("student_reports")
        .select("id", { count: "exact", head: true })
        .eq("batch_id", batchId);
      if (countError) throw countError;
      if ((count ?? 0) === 0) {
        const { error } = await supabase.from("report_batches").delete().eq("id", batchId);
        if (error) throw error;
        deletedBatchCount += 1;
      } else {
        const { error } = await supabase.from("report_batches").update({ report_count: count ?? 0 }).eq("id", batchId);
        if (error) throw error;
      }
    }

    return NextResponse.json({
      ok: true,
      deletedCount: allowed.length,
      deniedCount: denied,
      deletedBatchCount,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "성적표 삭제에 실패했습니다." },
      { status: 500 },
    );
  }
}
