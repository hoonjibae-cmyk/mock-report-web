// 검수 목록의 여러 장 선택·일괄 처리 — 화면 바깥에서도 검증할 수 있는 순수한 부분.
//
// 60~100장 시험에서 한 장씩 '검수 확인'·'삭제'를 누르는 대신, 체크한 답안지를 한 번에
// 처리한다. 무엇을 건너뛰는지(판독 실패·수험번호 없음·이미 확인됨)와 범위 선택,
// 동시에 몇 장씩 보내는지가 여기 있다.

import type { OmrScan } from "@/lib/omr-scans";

/**
 * order 안에서 from~to 사이(양끝 포함)의 ID — Shift+클릭 범위 선택.
 * from이 없거나 목록에 없으면 to 하나, to가 목록에 없으면 빈 목록.
 */
export function idRange(order: readonly string[], from: string | null | undefined, to: string): string[] {
  const b = order.indexOf(to);
  if (b < 0) return [];
  const a = from ? order.indexOf(from) : -1;
  if (a < 0) return [to];
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return order.slice(lo, hi + 1);
}

export interface ConfirmPlan {
  targets: OmrScan[];
  /** 건너뛴 까닭별 장수 */
  skipped: { readError: number; noStudentId: number; alreadyReviewed: number };
}

/**
 * 일괄 '검수 확인' 대상 고르기.
 *
 * 판독에 실패한 장과 수험번호가 없는 장은 확인해도 성적표가 되지 못하므로 건너뛴다.
 * 이미 검수 완료인 장도 화면에서 고친 값이 없으면 건너뛴다 — 다시 저장할 것이 없다.
 * drafts에는 화면에서 손댄 장만 들어 있다.
 */
export function planConfirm(
  scans: readonly OmrScan[],
  drafts: Readonly<Record<string, { studentId: string } | undefined>>,
): ConfirmPlan {
  const plan: ConfirmPlan = { targets: [], skipped: { readError: 0, noStudentId: 0, alreadyReviewed: 0 } };
  for (const scan of scans) {
    const draft = drafts[scan.id];
    const studentId = (draft ? draft.studentId : scan.studentId ?? "").trim();
    if (scan.readError) {
      plan.skipped.readError += 1;
    } else if (!studentId) {
      plan.skipped.noStudentId += 1;
    } else if (scan.status === "reviewed" && !draft) {
      plan.skipped.alreadyReviewed += 1;
    } else {
      plan.targets.push(scan);
    }
  }
  return plan;
}

/** 건너뛴 까닭을 한 줄로 — 없으면 빈 문자열 */
export function describeSkipped(skipped: ConfirmPlan["skipped"]): string {
  const parts: string[] = [];
  if (skipped.readError) parts.push(`판독 실패 ${skipped.readError}장`);
  if (skipped.noStudentId) parts.push(`수험번호 없음 ${skipped.noStudentId}장`);
  if (skipped.alreadyReviewed) parts.push(`이미 검수 완료 ${skipped.alreadyReviewed}장`);
  return parts.length ? `건너뜀: ${parts.join(" · ")}.` : "";
}

/**
 * items를 limit개씩 동시에 처리한다. worker가 던진 오류는 그 항목에서 끝나고
 * 나머지는 계속 간다 — 한 장이 실패했다고 뒤의 장들을 버리지 않는다.
 * 반환: 실패한 항목과 오류.
 */
export async function runPool<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<Array<{ item: T; error: unknown }>> {
  const failures: Array<{ item: T; error: unknown }> = [];
  let next = 0;
  const lanes = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      try {
        await worker(item);
      } catch (error) {
        failures.push({ item, error });
      }
    }
  });
  await Promise.all(lanes);
  return failures;
}
