// 수험번호의 마지막 자리 — 학생 명부로 푼다.
//
// 4자리 수험번호를 5자리 그리드에 쓰면 마지막 열이 빈다. 판독기는 그 열의 자국을
// 보고 셋 중 하나로 읽는다.
//
//   '2651?'  자국이 학생의 마킹에 견줄 만큼 진하다(또는 둘 이상) — 사람이 볼 '?'
//   '2651'   자국이 옅어 무시했다 — review_flags에 id_trailing(열·숫자·채움률)
//   '46140'  마킹 임계는 넘었지만 흐리다 — review_flags에 {type:'id', status:'weak'}
//
// 어느 쪽이 맞는지는 명부가 안다. 앞자리 그대로(2651)와 뒤에 0~9를 붙인 번호
// (26510~26519) 중 누가 있는가.
//
//   명부에 하나뿐      → 그 번호로 정한다(id_resolved). 읽은 그대로였으면 확정만(id_confirmed)
//   명부에 둘 이상     → 그대로 두고 후보를 보여 사람이 고른다(id_options / id_ambiguous)
//   명부에 하나도 없음 → 그대로(명부에 없다는 검수 사유가 따로 붙는다)
//
// QR이 있는 답안지는 수험번호가 QR이라 여기 오지 않는다.

import type { ReadConfidence } from "@/lib/omr-scans";

export type ReviewFlag = Record<string, unknown>;

export interface IdCandidateQuery {
  /**
   * 'unknown' 마지막 자리를 못 읽음('2651?')
   * 'faint'   흐린 자국을 무시하고 읽음('2651' + id_trailing)
   * 'weak'    마지막 자리를 흐리게 읽음('46140' + weak)
   */
  kind: "unknown" | "faint" | "weak";
  /** 확실히 읽힌 앞자리 */
  prefix: string;
  /** 명부에서 찾아볼 번호 — 앞자리 그대로와 뒤에 0~9를 붙인 열 개 */
  candidates: string[];
  /** 자국이 있던 열(0부터) */
  col: number;
}

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

function withExtensions(prefix: string): string[] {
  return [prefix, ...DIGITS.map((d) => prefix + d)];
}

/** 명부로 풀어 볼 수험번호인가 — 아니면 null */
export function idCandidateQuery(
  studentId: string | null | undefined,
  studentIdQr: string | null | undefined,
  reviewFlags: readonly ReviewFlag[] | null | undefined,
): IdCandidateQuery | null {
  if ((studentIdQr ?? "").trim()) return null;
  const id = (studentId ?? "").trim();
  const flags = (reviewFlags ?? []).filter((flag): flag is ReviewFlag => Boolean(flag));

  const unknown = id.match(/^(\d{3,8})\?$/);
  if (unknown) {
    const prefix = unknown[1];
    return { kind: "unknown", prefix, candidates: withExtensions(prefix), col: prefix.length };
  }
  if (!/^\d{3,8}$/.test(id)) return null;

  const trailing = flags.find((flag) => flag.type === "id_trailing");
  if (trailing) {
    const col = typeof trailing.col === "number" ? trailing.col : id.length;
    return { kind: "faint", prefix: id, candidates: withExtensions(id), col };
  }
  // 마지막 자리만 흐리게 읽혔을 때 — 다른 자리도 흐리면 명부로 풀 수 없다(앞자리를 믿을 수 없다)
  const idFlags = flags.filter((flag) => flag.type === "id");
  const lastCol = id.length - 1;
  if (
    id.length >= 4 &&
    idFlags.length === 1 &&
    idFlags[0].status === "weak" &&
    idFlags[0].col === lastCol
  ) {
    const prefix = id.slice(0, -1);
    return { kind: "weak", prefix, candidates: withExtensions(prefix), col: lastCol };
  }
  return null;
}

export interface IdResolutionRow {
  studentId: string | null;
  studentIdQr: string | null;
  reviewFlags: readonly ReviewFlag[];
  readConfidence: ReadConfidence | null;
}

/** 바뀐 값만 담는다 — 없는 키는 그대로 둔다는 뜻이다 */
export interface IdResolution {
  studentId?: string;
  reviewFlags: ReviewFlag[];
  readConfidence?: ReadConfidence;
}

/**
 * 명부에 있는 번호(known)로 마지막 자리를 정한다. 바꿀 것이 없으면 null.
 *
 * known은 lookupStudents에 넘긴 번호 중 명부에 있던 것(요청한 문자열 그대로).
 */
export function resolveStudentId(row: IdResolutionRow, known: ReadonlySet<string>): IdResolution | null {
  const query = idCandidateQuery(row.studentId, row.studentIdQr, row.reviewFlags);
  if (!query) return null;
  const id = (row.studentId ?? "").trim();
  const matches = query.candidates.filter((candidate) => known.has(candidate));
  const flags = row.reviewFlags.filter((flag): flag is ReviewFlag => Boolean(flag));

  if (matches.length === 1) {
    const to = matches[0];
    // 읽은 그대로가 명부의 유일한 후보 — 흐린 자국을 무시한 경우는 바꿀 것이 없다
    if (to === id && query.kind === "faint") return null;
    // 그 자리의 검수 플래그는 풀렸다 — 명부가 정했다는 기록으로 바꾼다
    const kept = flags.filter((flag) => !(flag.type === "id" && flag.col === query.col));
    const out: IdResolution = {
      reviewFlags: [
        ...kept,
        to === id
          ? { type: "id_confirmed", id: to, source: "roster" }
          : { type: "id_resolved", from: id, to, source: "roster" },
      ],
    };
    if (to !== id) out.studentId = to;
    if (row.readConfidence) {
      // 다른 자리에 남은 불확실(흐리게 읽힌 자리)은 그대로 둔다
      out.readConfidence = { ...row.readConfidence, idUncertain: kept.some((flag) => flag.type === "id") };
    }
    return out;
  }

  if (matches.length >= 2) {
    const out: IdResolution = {
      reviewFlags: [...flags, { type: query.kind === "unknown" ? "id_options" : "id_ambiguous", options: matches }],
    };
    if (row.readConfidence) out.readConfidence = { ...row.readConfidence, idUncertain: true };
    return out;
  }

  return null;
}
