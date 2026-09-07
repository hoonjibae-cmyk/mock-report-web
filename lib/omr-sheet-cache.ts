// 답안지 PDF 보관 — 한 번 만든 답안지를 다시 만들지 않는다.
//
// 답안지는 시험 설정이 그대로면 몇 번을 만들어도 같은 파일이 나온다. 그런데도
// 뽑을 때마다 판독 서버를 불렀다. 서버가 잠들어 있으면 깨는 데 1분이 걸리고,
// 그 1분이 다운로드 실패로 보인다. 보관해 두면 그 왕복 자체가 없어진다.

import { createHash } from "node:crypto";

import { SCAN_BUCKET } from "@/lib/omr-scans";
import { SHEET_PREFIX } from "@/lib/omr-retention";
import type { OmrSheetSpec } from "@/lib/omr-types";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

/**
 * 보관해 둔 답안지를 통째로 무효로 만들 때 올리는 번호.
 *
 * **판독기의 레이아웃(omr/layout.py 의 LAYOUT_VERSION)을 바꾸면 여기도 올려야
 * 한다.** 안 올리면 옛 배치로 만든 답안지가 계속 나가고, 새 배치를 기준으로
 * 읽는 판독기와 어긋난다. 검수 화면이 답안지 QR의 지문과 판독 설정의 지문을
 * 대조해 경고하므로 조용히 오채점되지는 않지만, 그 경고를 보기 전에 이미
 * 학생들이 그 답안지로 시험을 친 뒤다.
 */
const SHEET_CACHE_VERSION = 3;

/**
 * 시험 설정에서 보관 이름을 만든다.
 *
 * 설정이 한 글자라도 달라지면 다른 이름이 나오므로, 문항 수를 고치거나 제목을
 * 바꾸면 보관해 둔 옛 답안지가 저절로 안 쓰이게 된다.
 */
export function sheetCacheKey(spec: OmrSheetSpec): string {
  // 키 순서가 달라도 같은 이름이 나오도록 정렬해서 직렬화한다.
  const canonical = JSON.stringify(
    Object.fromEntries(Object.entries(spec).sort(([a], [b]) => a.localeCompare(b))),
  );
  return createHash("sha256")
    .update(`v${SHEET_CACHE_VERSION}\n${canonical}`)
    .digest("hex")
    .slice(0, 16);
}

/** 보관함 안에서 이 답안지가 놓일 자리 */
export function sheetCachePath(examId: string, key: string): string {
  return `${SHEET_PREFIX}/${examId}/${key}.pdf`;
}

/**
 * 보관해 둔 답안지를 꺼낸다. 없으면 null.
 *
 * 보관함이 아직 없거나 접근이 막혀도 답안지는 나가야 하므로, 실패를 예외로
 * 올리지 않고 "없음"으로 다룬다. 그러면 원래대로 판독 서버가 만든다.
 */
export async function readCachedSheet(path: string): Promise<Buffer<ArrayBuffer> | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.storage.from(SCAN_BUCKET).download(path);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  } catch (error) {
    console.warn(`보관된 답안지를 읽지 못했습니다(${path})`, error);
    return null;
  }
}

/**
 * 만든 답안지를 보관한다.
 *
 * 실패해도 조용히 넘긴다 — 이번 다운로드는 이미 성공했고, 보관은 다음 사람을
 * 위한 것이다. 여기서 예외를 올리면 잘 만든 답안지를 못 받게 된다.
 */
export async function writeCachedSheet(path: string, pdf: Buffer): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.storage
      .from(SCAN_BUCKET)
      .upload(path, pdf, { contentType: "application/pdf", upsert: true });
    if (error) console.warn(`답안지 보관 실패(${path}): ${error.message}`);
  } catch (error) {
    console.warn(`답안지 보관 실패(${path})`, error);
  }
}
