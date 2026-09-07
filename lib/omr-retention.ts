// 오래된 파일 정리 — 스캔 원본 보관 기간, 답안지 PDF 보관 기간.
//
// 정리 대상과 남길 것을 여기 한곳에 모아 둔다. 지우는 코드가 여러 군데 흩어지면
// "이건 왜 아직 남아 있지" 를 아무도 답할 수 없게 된다.

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { SCAN_BUCKET } from "@/lib/omr-scans";

/**
 * 스캔 원본 보관 기간(일).
 *
 * 원본은 판독이 끝나면 쓰이지 않는다. 검수 화면은 미리보기를, 주관식 채점은
 * 칸 이미지를 쓴다. 그런데도 원본이 제일 크다(300dpi 기준 1MB, 미리보기의 10배).
 *
 * 그래서 원본만 지우고 미리보기와 주관식 칸 이미지는 남긴다. 나중에 "이 학생
 * 답안이 왜 이렇게 채점됐지" 를 되짚을 때 필요한 것은 그 둘이다.
 *
 * 기간을 일주일로 둔 것은, 시험을 보고 성적표를 내보내기까지가 대개 그 안이라
 * 그 사이에 다시 판독해야 할 일이 생기면 원본이 아직 있어야 하기 때문이다.
 */
export const SCAN_RETENTION_DAYS = 7;

/**
 * 답안지 PDF 보관 기간(일).
 *
 * 한 번 만든 답안지는 그대로 다시 뽑는 일이 잦다(결시생 추가 응시, 인쇄 실패).
 * 그때마다 판독 서버를 깨워 다시 만드는 대신 보관해 둔 것을 바로 내려준다.
 */
export const SHEET_RETENTION_DAYS = 90;

/** 보관함에서 답안지 PDF를 두는 곳 — 시험 id 폴더와 섞이지 않게 앞에 붙인다. */
export const SHEET_PREFIX = "sheets";

/** 한 번에 지울 파일 수 — 너무 많이 보내면 요청이 거부된다. */
const DELETE_CHUNK = 100;

export interface PurgeResult {
  /** 실제로 지운 파일 수 */
  removed: number;
  /** 지우려 했으나 실패한 것(보관함에 이미 없거나 권한 문제) */
  failed: number;
  /** 사람이 읽을 요약 */
  detail: string;
}

/** 기준 시각에서 days일 뒤로 물러난 시각(ISO) */
export function cutoffIso(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

/** 목록을 chunk 크기로 나눈다 — 삭제 요청 한 번에 담을 만큼씩 */
export function chunk<T>(items: readonly T[], size: number = DELETE_CHUNK): T[][] {
  if (size <= 0) throw new Error("chunk 크기는 1 이상이어야 합니다.");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * 보관함 파일 목록에서 기간이 지난 것만 고른다.
 *
 * 만들어진 시각을 모르는 항목은 **지우지 않는다.** 정리 작업이 판단을 못 하는
 * 파일을 지우기 시작하면, 잘못 지웠을 때 되돌릴 방법이 없다.
 */
export function expiredNames(
  entries: ReadonlyArray<{ name: string; created_at?: string | null }>,
  cutoff: string,
): string[] {
  return entries
    .filter((entry) => {
      if (!entry.name) return false;
      const created = entry.created_at;
      if (typeof created !== "string" || !created) return false;
      return created < cutoff;
    })
    .map((entry) => entry.name);
}

/** 보관함에서 경로 목록을 지운다(나눠 보냄) */
async function removePaths(paths: string[]): Promise<{ removed: number; failed: number }> {
  if (paths.length === 0) return { removed: 0, failed: 0 };
  const supabase = getSupabaseAdmin();
  let removed = 0;
  let failed = 0;
  for (const group of chunk(paths)) {
    const { error } = await supabase.storage.from(SCAN_BUCKET).remove(group);
    if (error) {
      console.warn(`보관함 정리 실패(${group.length}건): ${error.message}`);
      failed += group.length;
    } else {
      removed += group.length;
    }
  }
  return { removed, failed };
}

/**
 * 보관 기간이 지난 스캔 원본을 지운다.
 *
 * 파일을 지운 뒤 omr_scans.scan_path 도 비운다. 경로만 남아 있으면 나중에
 * 없는 파일을 가리키게 되고, 그것은 "있는데 못 읽는 것"과 구분되지 않는다.
 */
export async function purgeExpiredScanOriginals(now: Date = new Date()): Promise<PurgeResult> {
  const cutoff = cutoffIso(SCAN_RETENTION_DAYS, now);
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("omr_scans")
    .select("id,scan_path")
    .not("scan_path", "is", null)
    .lt("created_at", cutoff)
    .limit(2000);
  if (error) throw new Error(`정리 대상 조회 실패: ${error.message}`);

  const rows = (data ?? []).filter((row) => typeof row.scan_path === "string" && row.scan_path);
  if (rows.length === 0) {
    return { removed: 0, failed: 0, detail: "기간이 지난 스캔 원본이 없습니다." };
  }

  const { removed, failed } = await removePaths(rows.map((row) => row.scan_path as string));

  // 보관함에서 지우는 데 실패했더라도 경로는 비운다. 어차피 다음 정리에서
  // 다시 지우려 시도할 대상이 아니고, 화면이 없는 파일을 가리키는 편이 나쁘다.
  const ids = rows.map((row) => row.id as string);
  for (const group of chunk(ids)) {
    const { error: clearError } = await supabase
      .from("omr_scans")
      .update({ scan_path: null })
      .in("id", group);
    if (clearError) console.warn(`scan_path 비우기 실패: ${clearError.message}`);
  }

  return {
    removed,
    failed,
    detail: `${SCAN_RETENTION_DAYS}일 지난 스캔 원본 ${removed}개를 지웠습니다(미리보기·주관식 칸 이미지는 그대로).`,
  };
}

/**
 * 보관 기간이 지난 답안지 PDF를 지운다.
 *
 * 지워도 잃는 것은 없다. 다음에 누가 그 답안지를 뽑으면 판독 서버가 같은
 * 설정으로 다시 만들어 준다.
 */
export async function purgeExpiredSheets(now: Date = new Date()): Promise<PurgeResult> {
  const cutoff = cutoffIso(SHEET_RETENTION_DAYS, now);
  const supabase = getSupabaseAdmin();

  const { data: folders, error } = await supabase.storage
    .from(SCAN_BUCKET)
    .list(SHEET_PREFIX, { limit: 1000 });
  if (error) {
    // 답안지를 한 번도 만든 적 없으면 폴더 자체가 없다 — 오류가 아니다.
    return { removed: 0, failed: 0, detail: `보관된 답안지가 없습니다. (${error.message})` };
  }

  const stale: string[] = [];
  for (const folder of folders ?? []) {
    if (!folder.name) continue;
    const { data: files } = await supabase.storage
      .from(SCAN_BUCKET)
      .list(`${SHEET_PREFIX}/${folder.name}`, { limit: 1000 });
    for (const name of expiredNames(files ?? [], cutoff)) {
      stale.push(`${SHEET_PREFIX}/${folder.name}/${name}`);
    }
  }

  const { removed, failed } = await removePaths(stale);
  return {
    removed,
    failed,
    detail: `${SHEET_RETENTION_DAYS}일 지난 답안지 PDF ${removed}개를 지웠습니다.`,
  };
}
