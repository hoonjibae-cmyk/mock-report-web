/**
 * 답안지를 올린 사람 기준으로 범위를 나눈다.
 *
 * 반배치고사는 전 재원생이 보므로 여러 직원이 답안지를 나눠 스캔해 동시에 올린다.
 * 그때 검수와 주관식 채점은 **내가 올린 답안지**를 먼저 보고, 다 마친 뒤 '전체'로
 * 넓혀 다른 사람 것과 합쳐 본다. 범위는 화면의 필터일 뿐 저장되는 값이 아니다 —
 * 성적표는 늘 검수를 마친 모든 답안지로 만든다.
 *
 * 이 파일은 화면(클라이언트)에서도 쓰므로 서버 전용 모듈을 들이지 않는다.
 */
import { essayCellGraded } from "@/lib/essay-grading";

/** 올린 사람 기록이 없는 답안지(이 기능 전에 올린 것)의 범위 열쇠 */
export const NO_UPLOADER = "__none__";

/** 범위 — null 은 전체, NO_UPLOADER 는 기록 없는 것, 그 밖에는 계정 ID */
export type UploaderScope = string | null;

interface Uploaded {
  uploadedBy?: string | null;
}

/** 이 답안지가 속한 범위 열쇠 */
export function scopeKeyOf(scan: Uploaded): string {
  return (scan.uploadedBy ?? "").trim() || NO_UPLOADER;
}

export function inScope(scan: Uploaded, scope: UploaderScope): boolean {
  return scope === null || scopeKeyOf(scan) === scope;
}

export function filterByUploader<T extends Uploaded>(scans: T[], scope: UploaderScope): T[] {
  return scope === null ? scans : scans.filter((scan) => scopeKeyOf(scan) === scope);
}

/**
 * 처음 들어왔을 때의 범위 — 내가 올린 답안지가 있으면 그것만, 없으면 전체.
 * 혼자 올린 시험에서는 어차피 둘이 같아 범위 선택이 눈에 띄지 않는다.
 */
export function defaultUploaderScope(scans: Uploaded[], me: string): UploaderScope {
  const mine = (me ?? "").trim();
  if (!mine) return null;
  return scans.some((scan) => scopeKeyOf(scan) === mine) ? mine : null;
}

/**
 * 요청 파라미터 → 범위. "all"/빈 값은 전체, "auto"는 기본 범위, 그 밖에는 그 열쇠.
 * 서버가 정하므로 화면은 한 번의 요청으로 범위와 자료를 함께 받는다.
 */
export function parseScopeParam(value: unknown, me: string, scans: Uploaded[]): UploaderScope {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "all") return null;
  if (raw === "auto") return defaultUploaderScope(scans, me);
  return raw;
}

/** 화면에 보이는 이름 */
export function uploaderDisplayName(
  key: string,
  names: Record<string, string>,
  me?: string,
): string {
  if (key === NO_UPLOADER) return "올린 사람 기록 없음";
  const name = names[key] ?? key;
  return me && key === me ? `${name} (나)` : name;
}

export interface UploaderSummary {
  /** 범위 열쇠(계정 ID 또는 NO_UPLOADER) */
  key: string;
  displayName: string;
  total: number;
  reviewed: number;
  /** 지금 로그인한 사람인가 */
  mine: boolean;
}

/**
 * 올린 사람별 장수 — 범위 칩에 붙는 숫자. 나를 맨 앞에, 그다음 장수가 많은 순,
 * 기록 없는 것은 맨 뒤.
 */
export function summarizeUploaders(
  scans: Array<Uploaded & { status: string }>,
  names: Record<string, string>,
  me?: string,
): UploaderSummary[] {
  const byKey = new Map<string, UploaderSummary>();
  for (const scan of scans) {
    const key = scopeKeyOf(scan);
    const entry = byKey.get(key) ?? {
      key,
      displayName: uploaderDisplayName(key, names, me),
      total: 0,
      reviewed: 0,
      mine: Boolean(me) && key === me,
    };
    entry.total += 1;
    if (scan.status === "reviewed") entry.reviewed += 1;
    byKey.set(key, entry);
  }
  return [...byKey.values()].sort(sortUploaders);
}

function sortUploaders(a: { key: string; mine: boolean; total: number; displayName: string }, b: typeof a): number {
  if (a.mine !== b.mine) return a.mine ? -1 : 1;
  if ((a.key === NO_UPLOADER) !== (b.key === NO_UPLOADER)) return a.key === NO_UPLOADER ? 1 : -1;
  return b.total - a.total || a.displayName.localeCompare(b.displayName, "ko");
}

export interface UploaderEssayProgress extends UploaderSummary {
  /** 검수를 마쳐 채점 대상이 된 장수 */
  gradable: number;
  /** 채점 대상 중 모든 주관식 칸의 손글씨를 읽은 장수 */
  transcribed: number;
  /** 채점 대상 중 모든 주관식 칸에 점수가 있는 장수 */
  graded: number;
  /** 손글씨 판독이 불확실해 사람이 봐야 하는 칸 수 */
  unclear: number;
}

/**
 * 올린 사람별 주관식 진행 — "누가 어디까지 했는가"를 채점 화면 범위 칩에 붙인다.
 * 다른 사람 범위가 아직 안 끝났으면 '전체'로 합쳐 보기 전에 알 수 있다.
 */
export function summarizeEssayProgress(
  scans: Array<
    Uploaded & {
      status: string;
      studentId: string | null;
      essayAnswers: Record<string, string>;
      essayScores: Record<string, number>;
      essayScoreSources?: Record<string, string>;
      essayFlags?: Record<string, string>;
    }
  >,
  essayKeys: string[],
  names: Record<string, string>,
  me?: string,
): UploaderEssayProgress[] {
  const base = summarizeUploaders(scans, names, me);
  return base.map((entry) => {
    const own = scans.filter((scan) => scopeKeyOf(scan) === entry.key);
    const gradable = own.filter((scan) => scan.status === "reviewed" && scan.studentId);
    const transcribed = gradable.filter((scan) => essayKeys.every((key) => key in (scan.essayAnswers ?? {})));
    // 못 읽은 답안에 자동 점수만 있는 칸은 채점된 것으로 세지 않는다(성적표 생성 확인과 같은 기준)
    const graded = gradable.filter((scan) => essayKeys.every((key) => essayCellGraded(scan, key)));
    const unclear = gradable.reduce(
      (sum, scan) => sum + essayKeys.filter((key) => scan.essayFlags?.[key] === "unclear").length,
      0,
    );
    return {
      ...entry,
      gradable: gradable.length,
      transcribed: transcribed.length,
      graded: graded.length,
      unclear,
    };
  });
}
