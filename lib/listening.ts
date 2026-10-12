/**
 * 듣기 미응시 — 토요모의고사를 개별로 응시해 듣기 평가를 못 본 학생.
 *
 * 토모는 두 부류가 본다. 전체가 모여 듣기까지 함께 보는 학생과, 따로 와서
 * 혼자 풀거나 과제로 풀어 오는 학생. 뒤쪽은 듣기를 틀 수 없어 1~17번이 비어
 * 온다. 예전에는 사람이 정답에 네 문제쯤 오답을 섞어 손으로 마킹해 주었는데,
 * 그러면 듣기를 안 본 학생 때문에 반의 듣기 평균이 움직이는 이상한 일이 생긴다.
 *
 * 그래서 듣기 문항이 거의 비어 온 답안지는 '듣기 미응시 후보'로 잡고, 선생님이
 * 성적표를 만들기 전에 고른다 — 듣기 안 봄(반 평균으로 산출, 기본) / 듣기 봄
 * (마킹한 대로 채점). 안 본 학생의 듣기 점수는 **듣기를 본 학생들만의 평균**이고,
 * 그 학생은 듣기 평균·문항별 정답률의 분모에서 빠진다. 채점 자체는
 * omr-scoring 이 하고, 이 파일은 '누가 듣기를 안 봤나'만 정한다.
 */
import { toChoices, type MarkValue } from "@/lib/omr-answers";
import type { OmrExam } from "@/lib/omr-types";

export type ListeningMode = "absent" | "marked";

export const LISTENING_AREA = "듣기";

/** 영역을 적어 두지 않은 토모에서 듣기로 보는 범위 — 수능형 영어 1~17번 */
export const SATURDAY_LISTENING_LAST = 17;

/** 채점에 필요한 만큼의 답안지 모양 — OmrScan 전체가 아니어도 된다(테스트용) */
export interface ListeningScanLike {
  answers: Record<string, MarkValue>;
  listeningMode?: ListeningMode | null;
}

/** 이 기능을 쓰는 시험 — 지금은 토요모의고사뿐이다 */
export function listeningFeatureEnabled(exam: Pick<OmrExam, "examType">): boolean {
  return exam.examType === "saturday";
}

/**
 * 듣기 문항 번호.
 *
 * 문항 분류에 '듣기' 영역을 적어 두었으면 그 문항들이고, 안 적어 두었으면
 * 토모 기본 구성(1~17번)이다. 토모가 아니면 빈 배열 — 이 기능을 타지 않는다.
 */
export function listeningQuestions(
  exam: Pick<OmrExam, "examType" | "numQuestions" | "questionMeta">,
): number[] {
  if (!listeningFeatureEnabled(exam)) return [];
  const tagged: number[] = [];
  for (let q = 1; q <= exam.numQuestions; q += 1) {
    const area = exam.questionMeta?.[String(q)]?.area;
    if (typeof area === "string" && area.trim() === LISTENING_AREA) tagged.push(q);
  }
  if (tagged.length > 0) return tagged;
  const last = Math.min(SATURDAY_LISTENING_LAST, exam.numQuestions);
  return Array.from({ length: Math.max(0, last) }, (_, i) => i + 1);
}

/** 듣기 문항 중 무엇이든 표기한 문항 수 */
export function listeningMarkedCount(
  exam: Pick<OmrExam, "examType" | "numQuestions" | "questionMeta">,
  scan: ListeningScanLike,
): number {
  let marked = 0;
  for (const q of listeningQuestions(exam)) {
    if (toChoices(scan.answers?.[String(q)] ?? null).length > 0) marked += 1;
  }
  return marked;
}

/**
 * 듣기 미응시로 볼 만한 답안지인가 — 듣기 문항 중 비어 있는 것이 (전체 − 2)개
 * 이상. 17문항이면 15문항 이상이 비어 있을 때다. 한두 문항은 손이 미끄러져
 * 칠해질 수 있어 전부 비어야 한다고는 보지 않는다.
 */
export function isListeningAbsentCandidate(
  exam: Pick<OmrExam, "examType" | "numQuestions" | "questionMeta">,
  scan: ListeningScanLike,
): boolean {
  const qs = listeningQuestions(exam);
  if (qs.length < 5) return false;
  const blank = qs.length - listeningMarkedCount(exam, scan);
  return blank >= qs.length - 2;
}

/**
 * 이 답안지를 어떻게 채점할지 — 선생님이 정해 두었으면 그것, 아니면 후보면
 * '안 봄'(기본값), 아니면 '마킹한 대로'. 듣기 문항이 없는 시험이면 null.
 */
export function resolveListeningMode(
  exam: Pick<OmrExam, "examType" | "numQuestions" | "questionMeta">,
  scan: ListeningScanLike,
): ListeningMode | null {
  if (listeningQuestions(exam).length === 0) return null;
  if (scan.listeningMode === "absent" || scan.listeningMode === "marked") return scan.listeningMode;
  return isListeningAbsentCandidate(exam, scan) ? "absent" : "marked";
}

/** 화면에 적는 범위 — "1~17번" */
export function listeningRangeLabel(
  exam: Pick<OmrExam, "examType" | "numQuestions" | "questionMeta">,
): string {
  const qs = listeningQuestions(exam);
  if (qs.length === 0) return "";
  return qs.length === 1 ? `${qs[0]}번` : `${qs[0]}~${qs[qs.length - 1]}번`;
}
