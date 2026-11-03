// 주관식(영작) 채점 — 전사한 답안을 묶어서 채점한다.
//
// 60명을 학생 단위로 채점하면 60번 판단해야 하지만, 영작은 답이 몇 갈래로
// 수렴한다. 같은 답끼리 묶으면 12~15번으로 줄고, 덤으로 "같은 답에 같은 점수"가
// 구조적으로 보장된다 — 손으로 채점할 때 생기는 들쭉날쭉함이 없어진다.
//
// 자동 채점에는 비대칭이 있다.
//   전사 == 정답  → 거의 확실히 정답. OCR이 우연히 정답 문장을 만들 확률은 낮다.
//   전사 != 정답  → 학생이 틀렸는지 우리가 잘못 읽었는지 구분할 수 없다.
// 예전에는 그래서 정답 판정만 자동으로 넘기고 나머지는 사람에게 남겼다. 그러나
// 60명 중 오답·백지가 40명이면 그 40명을 하나하나 0점으로 누르는 것이 일이었다.
// 지금은 오답으로 보이는 답안과 백지도 **우선 0점**으로 매기되, 점수의 출처를
// 'auto'로 남긴다. 자동 점수는 화면에서 '확인 필요'로 보이고, 선생님이 확인하거나
// 고치면 'teacher'가 되어 자동 채점을 다시 돌려도 건드리지 않는다. 학생 점수를
// 깎는 방향의 실수는 이렇게 사람의 눈을 한 번 거쳐 막는다.

/** 채점 상태 — 점수가 어디서 왔는지 남긴다 */
export type EssayGradeSource = "auto" | "teacher";

/**
 * 전사 표시 — 'unclear' 는 손글씨를 읽긴 했지만 확실하지 않다는 뜻이다.
 * 백지로 읽혔어도 정말 백지인지 모르므로 자동 채점이 0점으로 넘기지 않고
 * 사람에게 남긴다. 전사 자체가 실패한 칸은 저장하지 않는다(다음에 다시 읽는다).
 */
export type EssayFlag = "unclear";

/** 한 학생의 한 문항 현재 점수 — 자동 채점이 덮어써도 되는지 가르는 근거 */
export interface CurrentScore {
  score: number;
  source: EssayGradeSource;
}

/**
 * 아직 글로 옮기지 못한 답안 — **백지가 아니다.**
 *   unread   손글씨 칸 이미지는 있는데 아직 읽지 않았다('손글씨 읽기'로 읽힌다)
 *   noImage  손글씨 칸 이미지가 없어 읽을 수 없다(다시 올리거나 종이를 보고 매긴다)
 * 예전에는 이 둘을 빈 글로 보아 백지 묶음에 넣고 자동 0점을 매겼다. 학생이 쓴 답이
 * 통째로 0점이 되어 반배정 요청까지 나간 일이 있었다.
 */
export type EssayMissing = "unread" | "noImage";

export interface EssayAnswer {
  scanId: string;
  studentId: string | null;
  /** 전사된 답안(선생님이 고쳤으면 고친 값) */
  text: string;
  /** 손글씨 판독이 불확실한가 — 같은 글이라도 확실한 답안과 따로 묶는다 */
  unclear?: boolean;
  /** 전사가 없다 — 있으면 text 는 무시하고 따로 묶으며 자동 채점하지 않는다 */
  missing?: EssayMissing;
}

/** 같은 답안끼리 묶은 결과 */
export interface EssayGroup {
  /** 비교용으로 다듬은 문자열 — 묶음의 열쇠(불확실 묶음은 UNCLEAR_PREFIX, 미판독 묶음은 MISSING_PREFIX 로 시작) */
  key: string;
  /** 화면에 보여줄 대표 원문(묶음에서 가장 흔한 표기) */
  text: string;
  /** 이 답을 쓴 학생들 */
  members: EssayAnswer[];
  /** 허용 답안과 정확히 일치하는가 — 자동 정답 처리의 근거 */
  matchesKey: boolean;
  /** 아무것도 쓰지 않았는가(확실한 백지만) */
  blank: boolean;
  /** 손글씨 판독이 불확실한 묶음 — 사람이 봐야 한다 */
  unclear: boolean;
  /**
   * 아직 글로 옮기지 못한 답안들 — 학생마다 답이 다르므로 묶음 한 번에 점수를 줄 수
   * 없고, 자동 채점도 하지 않는다. null 이면 보통 묶음.
   */
  missing: EssayMissing | null;
}

/** 불확실한 답안의 묶음 열쇠 앞에 붙는 표시 — 다듬은 답안 글에는 나올 수 없는 글자 */
export const UNCLEAR_PREFIX = "\u0001?";
/** 미판독 답안의 묶음 열쇠 앞에 붙는 표시 — 뒤에 이유(unread · noImage)가 붙는다 */
export const MISSING_PREFIX = "\u0001!";

export function isUnclearKey(key: string): boolean {
  return key.startsWith(UNCLEAR_PREFIX);
}

function missingOfKey(key: string): EssayMissing | null {
  if (!key.startsWith(MISSING_PREFIX)) return null;
  const reason = key.slice(MISSING_PREFIX.length);
  return reason === "unread" || reason === "noImage" ? reason : null;
}

/**
 * 비교용으로 문자열을 다듬는다.
 *
 * 손글씨 전사에서는 대소문자·공백·따옴표 모양·끝 마침표가 답안의 옳고 그름과
 * 무관하게 흔들린다. 그것들 때문에 같은 답이 다른 묶음으로 갈라지면 묶어서
 * 채점하는 의미가 없다. 철자와 단어는 건드리지 않는다 — 그건 채점 대상이다.
 */
export function normalizeEssay(text: string): string {
  return (text ?? "")
    .replace(/[‘’ʼ´`]/g, "'") // 여러 모양의 작은따옴표 → '
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?]+$/, "") // 끝 마침표·물음표는 정오와 무관하게 자주 빠진다
    .toLowerCase();
}

/**
 * 정답 입력 엑셀의 주관식 정답 칸을 허용 답안 목록으로 읽는다.
 *
 * 영작은 정답이 하나가 아니다. 축약형·어순 차이처럼 똑같이 맞다고 볼 답을
 * `|`로 나눠 적는다. 예:
 *   He is looking forward to seeing you. | He's looking forward to seeing you.
 */
export function parseAcceptedAnswers(raw: unknown): string[] {
  const text = String(raw ?? "").trim();
  if (!text || text === "서술형") return [];
  return [...new Set(text.split("|").map((entry) => entry.trim()).filter(Boolean))].slice(0, 20);
}

/** 전사된 답안이 허용 답안 중 하나와 일치하는가 */
export function matchesAccepted(text: string, accepted: string[]): boolean {
  if (accepted.length === 0) return false;
  const norm = normalizeEssay(text);
  if (!norm) return false;
  return accepted.some((answer) => normalizeEssay(answer) === norm);
}

/**
 * 한 문항의 답안들을 묶는다.
 *
 * 정렬은 사람이 채점하기 좋은 순서로 한다 — 정답으로 보이는 묶음이 먼저, 그다음
 * 판독이 불확실해 사람이 봐야 하는 묶음, 그다음 사람 수가 많은 순. 백지는 판단할
 * 게 없으므로 맨 뒤로 보낸다. 불확실한 답안은 같은 글이라도 확실한 답안과 따로
 * 묶는다 — 확실한 묶음에 섞이면 한 번에 매긴 점수가 보지도 않은 칸에 들어간다.
 */
export function groupEssayAnswers(answers: EssayAnswer[], accepted: string[]): EssayGroup[] {
  const buckets = new Map<string, { texts: Map<string, number>; members: EssayAnswer[] }>();

  for (const answer of answers) {
    // 글로 옮기지 못한 답안은 글이 없으니 이유별로만 묶는다 — 빈 글과 섞이면 백지가 된다
    const norm = answer.missing ? "" : normalizeEssay(answer.text);
    const key = answer.missing
      ? MISSING_PREFIX + answer.missing
      : answer.unclear
        ? UNCLEAR_PREFIX + norm
        : norm;
    const entry = buckets.get(key) ?? { texts: new Map<string, number>(), members: [] };
    const raw = answer.missing ? "" : (answer.text ?? "").trim();
    if (raw) entry.texts.set(raw, (entry.texts.get(raw) ?? 0) + 1);
    entry.members.push(answer);
    buckets.set(key, entry);
  }

  const groups: EssayGroup[] = [...buckets.entries()].map(([key, entry]) => {
    // 대표 원문 = 그 묶음에서 가장 흔한 표기(대소문자 차이 등은 다수를 따른다)
    const text =
      [...entry.texts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ??
      "";
    const missing = missingOfKey(key);
    const unclear = isUnclearKey(key);
    return {
      key,
      text,
      members: entry.members,
      matchesKey: missing ? false : matchesAccepted(text, accepted),
      // 불확실하게 읽힌 빈칸·아직 못 읽은 칸은 백지가 아니라 '모름'이다
      blank: key === "",
      unclear,
      missing,
    };
  });

  groups.sort((a, b) => {
    // 못 읽은 답안이 맨 위 — 사람이 손대기 전에는 채점이 끝날 수 없다
    if (Boolean(a.missing) !== Boolean(b.missing)) return a.missing ? -1 : 1;
    if (a.blank !== b.blank) return a.blank ? 1 : -1;
    if (a.matchesKey !== b.matchesKey) return a.matchesKey ? -1 : 1;
    if (a.unclear !== b.unclear) return a.unclear ? -1 : 1;
    return b.members.length - a.members.length || a.text.localeCompare(b.text);
  });
  return groups;
}

export interface AutoGradeResult {
  /** {scanId: 점수} — 이번에 자동으로 매긴(또는 다시 매긴) 것 */
  scores: Record<string, number>;
  /** 자동 만점 처리된 묶음의 key */
  autoKeys: string[];
  /** 자동 0점 처리된 묶음의 key — 확인이 필요한 쪽 */
  zeroKeys: string[];
  /** 점수를 정하지 못한 학생이 남은 묶음(정답이 없어 판단할 수 없는 답안) */
  pending: EssayGroup[];
  /** 선생님이 매긴 점수가 있어 건드리지 않은 학생 수 */
  kept: number;
  /**
   * 자동 점수를 지울 학생 — 지금은 판정할 수 없는데(못 읽음·불확실·정답 없음) 예전
   * 판정의 자동 점수가 남아 있다. 남겨 두면 근거 없는 점수가 성적표에 들어간다.
   */
  cleared: string[];
}

/**
 * 한 답안의 자동 판정 — 정답과 일치하면 만점, 백지면 0점, 정답이 있는데 다르면
 * 0점(오답으로 보임). 정답을 안 넣었는데 무언가 쓰여 있으면 판단할 수 없어 null.
 * 판독이 불확실한 답안은 일치할 때만 만점이고 나머지는 사람에게 남긴다(null) —
 * 잘못 읽은 글로 0점을 매기는 것이 이 기능이 막아야 할 사고다.
 */
export function autoVerdict(
  text: string,
  accepted: string[],
  point: number,
  unclear = false,
): number | null {
  if (matchesAccepted(text, accepted)) return point;
  if (unclear) return null;
  if (!normalizeEssay(text)) return 0;
  return accepted.length > 0 ? 0 : null;
}

/**
 * 자동 채점 — 일치하면 만점, 오답으로 보이거나 백지면 우선 0점.
 *
 * 선생님이 매긴 점수(source 'teacher')는 절대 덮어쓰지 않는다. 자동으로 매겼던
 * 점수는 다시 매긴다 — 정답을 고치거나 전사를 바로잡은 뒤 다시 돌리면 그에
 * 맞게 바뀌어야 한다. 정답이 없는 문항은 백지만 0점이고 나머지는 사람에게 남긴다.
 * 아직 글로 옮기지 못한 답안은 판정하지 않는다 — 글이 없다고 백지는 아니다.
 * 판정할 수 없는 학생에게 예전 자동 점수가 남아 있으면 지운다(cleared).
 */
export function autoGrade(
  groups: EssayGroup[],
  point: number,
  options: { accepted?: string[]; current?: Record<string, CurrentScore | undefined> } = {},
): AutoGradeResult {
  const accepted = options.accepted ?? [];
  const current = options.current ?? {};
  const scores: Record<string, number> = {};
  const autoKeys: string[] = [];
  const zeroKeys: string[] = [];
  const pending: EssayGroup[] = [];
  const cleared: string[] = [];
  let kept = 0;

  for (const group of groups) {
    // 못 읽은 답안은 판정하지 않는다. 불확실한 묶음은 일치할 때만 만점, 아니면 사람에게.
    const verdict = group.missing
      ? null
      : group.matchesKey
        ? point
        : group.unclear
          ? null
          : group.blank
            ? 0
            : accepted.length > 0
              ? 0
              : null;
    let scored = 0;
    let unresolved = 0;
    for (const member of group.members) {
      if (current[member.scanId]?.source === "teacher") {
        kept += 1;
        continue;
      }
      if (verdict === null) {
        unresolved += 1;
        if (current[member.scanId]?.source === "auto") cleared.push(member.scanId);
        continue;
      }
      scores[member.scanId] = verdict;
      scored += 1;
    }
    if (scored > 0) (verdict === 0 ? zeroKeys : autoKeys).push(group.key);
    if (unresolved > 0) pending.push(group);
  }
  return { scores, autoKeys, zeroKeys, pending, kept, cleared };
}

/**
 * 매긴 점수를 저장할 값으로 맞춘다 — 0~배점 사이로 자르고, 만점은 배점을 그대로,
 * 부분점수는 소수점 첫째 자리로. 배점은 100점을 문항 수로 나눈 값이라(예: 100/45 =
 * 2.222…) 만점을 반올림해 저장하면 다 맞혀도 총점이 100점에 못 미친다.
 */
export function clampEssayScore(score: number, point: number): number {
  const bounded = Math.max(0, Math.min(point, score));
  return bounded >= point - 1e-9 ? point : Math.round(bounded * 10) / 10;
}

/** 한 묶음 전체에 같은 점수를 매긴다 */
export function applyGroupScore(
  group: EssayGroup,
  score: number,
  point: number,
): Record<string, number> {
  const clamped = clampEssayScore(score, point);
  const out: Record<string, number> = {};
  for (const member of group.members) out[member.scanId] = clamped;
  return out;
}

/**
 * 이 칸의 점수를 믿을 수 있는가 — 성적표·반배정 요청 전 확인과 진행 표시에 쓴다.
 *
 * 점수가 없으면 아니다. 글로 옮기지 못한 답안에 **자동** 점수만 있는 것도 아니다 —
 * 예전 버전이 못 읽은 답안을 백지로 보고 0점을 매긴 흔적이고, 그대로 성적표를 만들면
 * 학생이 쓴 답이 0점으로 나간다. 선생님이 매긴 점수는 글이 없어도 믿는다(종이를 보고
 * 매겼거나 엑셀로 넣은 점수). 출처가 적혀 있지 않은 옛 점수는 선생님 것으로 본다.
 */
export function essayCellGraded(
  scan: {
    essayScores?: Record<string, number>;
    essayScoreSources?: Record<string, string>;
    essayAnswers?: Record<string, string>;
  },
  key: string,
): boolean {
  if (typeof scan.essayScores?.[key] !== "number") return false;
  const source = scan.essayScoreSources?.[key] ?? "teacher";
  return !(source === "auto" && !(key in (scan.essayAnswers ?? {})));
}

export interface EssayProgress {
  total: number;
  graded: number;
  groups: number;
  gradedGroups: number;
}

/** 채점이 어디까지 됐는지 — 화면 상단 요약용 */
export function essayProgress(
  groups: EssayGroup[],
  scores: Record<string, number | undefined>,
): EssayProgress {
  let total = 0;
  let graded = 0;
  let gradedGroups = 0;
  for (const group of groups) {
    total += group.members.length;
    const done = group.members.filter((m) => typeof scores[m.scanId] === "number");
    graded += done.length;
    if (done.length === group.members.length && group.members.length > 0) gradedGroups += 1;
  }
  return { total, graded, groups: groups.length, gradedGroups };
}
