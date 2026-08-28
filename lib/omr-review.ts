// 자동 검수 통과 판정 — "이 답안지를 사람이 봐야 하는가"를 한 곳에서 결정한다.
//
// 60~100명 시험에서 답안지를 한 장씩 눌러 확인하는 건 현실적이지 않다. 그렇다고
// 전부 그냥 통과시키면 잘못 읽힌 답안지가 조용히 성적표가 된다. 그래서 판독기가
// 확신한 것만 자동으로 넘기고, 조금이라도 걸리는 것만 사람에게 남긴다.
//
// 판정 근거는 세 갈래다.
//   ① 마킹 판독의 확신     — 판독기가 경계에 걸쳐 읽은 문항이 있는가
//   ② 수험번호의 신뢰성     — 이게 틀리면 성적표가 통째로 다른 학생에게 간다
//   ③ 답안지 사이의 모순    — 같은 수험번호가 두 장에 있는가

import { isMultiAnswer, toChoices, type MarkValue } from "@/lib/omr-answers";
import type { OmrScan } from "@/lib/omr-scans";

/** 사람이 봐야 하는 이유 — 화면에 그대로 띄운다. */
export type ReviewReasonCode =
  | "readError"
  | "noConfidence"
  | "noStudentId"
  | "idLength"
  | "idUncertain"
  | "idConflict"
  | "duplicateId"
  | "unknownId"
  | "uncertainQuestions"
  | "unexpectedMultiMark"
  | "allBlank";

export interface ReviewReason {
  code: ReviewReasonCode;
  /** 화면에 띄울 한 줄 설명 */
  label: string;
  /** 관련 문항 번호(있으면) */
  questions?: number[];
}

export interface ReviewVerdict {
  /** 사람 확인 없이 성적표에 써도 되는가 */
  auto: boolean;
  reasons: ReviewReason[];
}

export interface ReviewContext {
  /** 시험의 총 문항 수 */
  numQuestions: number;
  /** 수험번호 자리수 — 자리수가 안 맞으면 마킹을 흘려 읽은 것이다 */
  idDigits?: number;
  /** 정답표 — '모두 고르기' 문항을 알아야 복수 표기가 정상인지 판단할 수 있다 */
  answerKey?: Record<string, MarkValue>;
  /** 이 시험에서 두 번 이상 나온 수험번호 */
  duplicateIds?: Set<string>;
  /**
   * 학생 명부의 수험번호 목록(Student-Card 연동). 없으면 이 검사는 건너뛴다 —
   * 연동이 꺼져 있다고 해서 전부 검수 대상으로 만들면 기능이 무용지물이 된다.
   */
  knownIds?: Set<string> | null;
}

/** 표기된 문항 수 */
function markedCount(answers: Record<string, MarkValue>): number {
  return Object.values(answers).filter((v) => toChoices(v).length > 0).length;
}

/** 앞의 0을 뗀 비교용 수험번호 — '0123'과 '123'은 같은 학생이다 */
export function normalizeId(id: string | null | undefined): string {
  const trimmed = (id ?? "").trim();
  if (!trimmed) return "";
  const stripped = trimmed.replace(/^0+/, "");
  return stripped || "0";
}

/** 한 시험 안에서 중복으로 쓰인 수험번호를 찾는다. */
export function findDuplicateIds(scans: OmrScan[]): Set<string> {
  const seen = new Map<string, number>();
  for (const scan of scans) {
    const key = normalizeId(scan.studentId);
    if (!key) continue;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([key]) => key));
}

/**
 * 답안지 한 장이 자동 통과 대상인지 판정한다.
 *
 * 판단이 서지 않으면 무조건 사람에게 넘긴다 — 확신 정보가 아예 없는 예전
 * 답안지도 마찬가지다. 자동 통과는 "확실히 괜찮다"일 때만이지, "문제를 못
 * 찾았다"일 때가 아니다.
 */
export function reviewVerdict(scan: OmrScan, ctx: ReviewContext): ReviewVerdict {
  const reasons: ReviewReason[] = [];
  const add = (code: ReviewReasonCode, label: string, questions?: number[]) =>
    reasons.push({ code, label, questions });

  if (scan.readError) {
    add("readError", scan.readError);
    return { auto: false, reasons };
  }

  const conf = scan.readConfidence;
  if (!conf) {
    // 미리보기와 마찬가지로, 이 기능이 생기기 전에 올린 답안지에는 판정 정보가 없다.
    add("noConfidence", "판독 확신 정보가 없는 답안지입니다(기능 추가 이전 업로드). 눈으로 확인해 주세요.");
    return { auto: false, reasons };
  }

  // --- ① 수험번호 ---
  const id = (scan.studentId ?? "").trim();
  if (!id) {
    add("noStudentId", "수험번호를 읽지 못했습니다.");
  } else {
    if (ctx.idDigits && id.length !== ctx.idDigits && !id.includes("?")) {
      add("idLength", `수험번호가 ${id.length}자리로 읽혔습니다(설정은 ${ctx.idDigits}자리).`);
    }
    if (id.includes("?")) add("idUncertain", "수험번호에 읽지 못한 자리가 있습니다.");
    if (ctx.duplicateIds?.has(normalizeId(id))) {
      add("duplicateId", `수험번호 ${id}가 다른 답안지에도 있습니다. 둘 중 하나는 잘못 읽혔습니다.`);
    }
    if (ctx.knownIds && ctx.knownIds.size > 0 && !ctx.knownIds.has(normalizeId(id))) {
      add("unknownId", `수험번호 ${id}를 학생 명부에서 찾지 못했습니다.`);
    }
  }
  if (conf.idUncertain) add("idUncertain", "수험번호 마킹이 흐려 확실하지 않습니다.");
  if (conf.idConflict) {
    add("idConflict", "답안지 QR의 수험번호와 학생이 마킹한 수험번호가 다릅니다.");
  }

  // --- ② 마킹 판독 ---
  if (conf.uncertain.length > 0) {
    add(
      "uncertainQuestions",
      `${conf.uncertain.length}개 문항의 표기가 흐리거나 경계에 걸쳐 있습니다.`,
      conf.uncertain,
    );
  }

  // 복수 표기는 '모두 고르기' 문항이면 정상이다. 정답표가 없으면 판단할 수
  // 없으므로 전부 사람에게 넘긴다.
  const unexpected = conf.multiMarked.filter(
    (q) => !isMultiAnswer(ctx.answerKey?.[String(q)]),
  );
  if (unexpected.length > 0) {
    add(
      "unexpectedMultiMark",
      ctx.answerKey && Object.keys(ctx.answerKey).length > 0
        ? `${unexpected.length}개 문항에 둘 이상 표기되어 있습니다('모두 고르기' 문항이 아님).`
        : `${unexpected.length}개 문항에 둘 이상 표기되어 있습니다. 정답을 아직 입력하지 않아 정상 여부를 판단할 수 없습니다.`,
      unexpected,
    );
  }

  // --- ③ 백지 ---
  // 판독기는 "확실히 비었다"고 말하지만, 답안지 전체가 비었다면 스캔이 뒤집혔거나
  // 빈 용지가 섞여 들어간 쪽이 더 그럴듯하다.
  const marked = markedCount(scan.answers);
  if (ctx.numQuestions > 0 && marked === 0) {
    add("allBlank", "표기가 하나도 없습니다. 빈 용지가 섞였거나 뒷면을 스캔했을 수 있습니다.");
  }

  return { auto: reasons.length === 0, reasons };
}

export interface ReviewSummary {
  total: number;
  /** 이미 사람이 확인했거나 자동 통과 처리된 것 */
  reviewed: number;
  /** 지금 자동 통과시킬 수 있는 것 */
  autoReady: OmrScan[];
  /** 사람이 봐야 하는 것 */
  needsPerson: Array<{ scan: OmrScan; reasons: ReviewReason[] }>;
}

/** 시험 전체를 훑어 자동 통과 가능 / 사람 확인 필요로 가른다. */
export function summarizeReview(scans: OmrScan[], ctx: Omit<ReviewContext, "duplicateIds">): ReviewSummary {
  const duplicateIds = findDuplicateIds(scans);
  const full: ReviewContext = { ...ctx, duplicateIds };

  const autoReady: OmrScan[] = [];
  const needsPerson: Array<{ scan: OmrScan; reasons: ReviewReason[] }> = [];
  let reviewed = 0;

  for (const scan of scans) {
    if (scan.status === "reviewed") {
      reviewed += 1;
      continue;
    }
    const verdict = reviewVerdict(scan, full);
    if (verdict.auto) autoReady.push(scan);
    else needsPerson.push({ scan, reasons: verdict.reasons });
  }

  return { total: scans.length, reviewed, autoReady, needsPerson };
}
