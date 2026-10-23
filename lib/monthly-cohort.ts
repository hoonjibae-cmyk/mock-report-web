// 월말평가의 비교 집단 — 우리 반 평균 / 같은 레벨 평균.
//
// 월말평가는 반마다 시험을 따로 만들어 치르므로 성적표의 평균은 그 반 하나였다.
// 담임이 같은 레벨(예: M4)의 반을 둘 이상 가르치면 레벨 전체와 견주고 싶을 수
// 있다. 그때 어느 시험을 합칠지 여기서 정한다.
//
//   같은 레벨  ·  같은 시행월  ·  같은 담임  ·  같은 시험지(문항 수·정답·배점)
//
// 담임이 다른 반은 같은 레벨이어도 넣지 않는다 — 가르친 사람이 다르면 비교 대상이
// 아니다(요구사항). 레벨과 시행월은 시험에 적혀 있으면 그것을, 없으면(이 기능 전에
// 만든 시험) 반 이름과 제목에서 유추한다.

import { homeroomKey } from "@/lib/homeroom";
import { sameChoices } from "@/lib/omr-answers";
import { essayCountOf, pointFor } from "@/lib/omr-scoring";
import type { CohortMode, OmrExam } from "@/lib/omr-types";

const WEEKDAY = "[월화수목금토일]";

/**
 * 반 이름에서 레벨을 떼어 낸다 — 요일 토큰 앞까지.
 *
 *   'M4 화목 R' → 'M4'        '중2 유클래스A 월수 H' → '중2 유클래스A'
 *   '고등 입학반 수금' → '고등 입학반'    'M4화목R' → 'M4'    '중3A' → '중3A'(요일 없음)
 *
 * 반 이름 규칙은 "<레벨> <요일> <담임 이니셜>"이라 요일이 경계가 된다. 요일이
 * 없으면 이름 전체가 레벨이다.
 */
export function levelOfClassName(name: string | null | undefined): string {
  const text = String(name ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const spaced = text.match(new RegExp(`^(.*?)\\s${WEEKDAY}{2,7}(?:\\s|$)`));
  if (spaced && spaced[1].trim()) return spaced[1].trim();
  // 붙여 쓴 요일('M4화목R') — 영문·숫자 바로 뒤에 요일 두세 글자
  const attached = text.match(new RegExp(`^(.*?[A-Za-z0-9)])${WEEKDAY}{2,3}(?:[A-Za-z]|\\s|$)`));
  if (attached && attached[1].trim()) return attached[1].trim();
  return text;
}

/** 반 이름이 없는 옛 시험용 — 제목에서 'N월'·'월말평가' 같은 말을 걷어낸 나머지 */
export function levelFromTitle(title: string): string {
  return String(title ?? "")
    .normalize("NFKC")
    .replace(/\d{1,2}\s*월/g, " ")
    .replace(/월말\s*평가|월말|평가|시험/g, " ")
    .replace(/[·\-–—:/|,()[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 시험의 레벨 — 적혀 있으면 그것, 없으면 반 이름(첫 반)에서, 그것도 없으면 제목에서 */
export function inferLevel(exam: Pick<OmrExam, "level" | "classNames" | "title">): string {
  if (exam.level?.trim()) return exam.level.trim();
  for (const name of exam.classNames ?? []) {
    const level = levelOfClassName(name);
    if (level) return level;
  }
  return levelFromTitle(exam.title);
}

/** 제목의 'N월' — 없거나 1~12 밖이면 null */
export function monthFromTitle(title: string): number | null {
  const match = String(title ?? "").normalize("NFKC").match(/(\d{1,2})\s*월/);
  if (!match) return null;
  const n = Number(match[1]);
  return n >= 1 && n <= 12 ? n : null;
}

/**
 * 시행월 'YYYY-MM' — 적혀 있으면 그것. 없으면 제목의 'N월'을 우선 쓰고(같은 기간을
 * 묶어야 하므로), 연도는 시험일(없으면 만든 날)에서 가져온다. 해가 바뀌는 자리는
 * 바로잡는다 — 12월 시험을 1월에 만들었으면 지난해 12월이다. 제목에 달이 없으면
 * 시험일, 그것도 없으면 만든 날의 달.
 */
export function inferPeriodMonth(exam: Pick<OmrExam, "periodMonth" | "title" | "examDate" | "createdAt">): string {
  if (exam.periodMonth && /^\d{4}-\d{2}$/.test(exam.periodMonth)) return exam.periodMonth;
  const dated = exam.examDate && /^\d{4}-\d{2}/.test(exam.examDate) ? exam.examDate : exam.createdAt ?? "";
  const ref = /^\d{4}-\d{2}/.test(dated) ? dated.slice(0, 7) : "";
  const titled = monthFromTitle(exam.title);
  if (titled && ref) {
    let year = Number(ref.slice(0, 4));
    const refMonth = Number(ref.slice(5, 7));
    if (titled - refMonth > 6) year -= 1;
    else if (refMonth - titled > 6) year += 1;
    return `${year}-${String(titled).padStart(2, "0")}`;
  }
  return ref;
}

/** 반 이름 → 담임(학생 관리 프로그램의 반 현황) */
export type ClassTeacherMap = ReadonlyMap<string, string>;

/** 시험의 담임 — 반 현황에 적힌 그 반의 담임, 없으면 시험을 만든 사람 */
export function teacherOf(
  exam: Pick<OmrExam, "classNames" | "createdByName" | "createdByUsername">,
  board: ClassTeacherMap,
): string {
  for (const name of exam.classNames ?? []) {
    const teacher = board.get(name)?.trim();
    if (teacher) return teacher;
  }
  return exam.createdByName?.trim() || exam.createdByUsername?.trim() || "";
}

/** 같은 시험지인가 — 문항 수·서술형 수·객관식 정답·배점이 모두 같아야 점수를 합칠 수 있다 */
export function samePaper(a: OmrExam, b: OmrExam): boolean {
  if (a.numQuestions !== b.numQuestions || essayCountOf(a) !== essayCountOf(b)) return false;
  for (let q = 1; q <= a.numQuestions; q += 1) {
    const ka = a.answerKey?.[String(q)];
    const kb = b.answerKey?.[String(q)];
    if (ka === undefined || ka === null || kb === undefined || kb === null) return false;
    if (typeof ka === "string" || typeof kb === "string") {
      if (ka !== kb) return false;
    } else if (!sameChoices(ka, kb)) return false;
  }
  const total = a.numQuestions + essayCountOf(a);
  for (let q = 1; q <= total; q += 1) {
    if (Math.abs(pointFor(a, q) - pointFor(b, q)) > 1e-9) return false;
  }
  return true;
}

export interface SiblingCandidate {
  exam: OmrExam;
  /** 레벨 평균에 넣는가 */
  included: boolean;
  /** 넣지 않는 이유 — 화면에 그대로 보인다 */
  reason?: string;
}

/**
 * 같은 레벨·같은 달의 다른 월말평가를 찾는다.
 *
 * 레벨이나 달이 다르면 후보조차 아니다. 레벨과 달이 같은데 담임이 다르거나 시험지가
 * 다르면 '제외'로 남겨 담임이 왜 안 합쳐지는지 볼 수 있게 한다.
 */
export function levelSiblings(exam: OmrExam, all: readonly OmrExam[], board: ClassTeacherMap): SiblingCandidate[] {
  const level = homeroomKey(inferLevel(exam));
  const month = inferPeriodMonth(exam);
  const teacher = homeroomKey(teacherOf(exam, board));
  const out: SiblingCandidate[] = [];
  for (const other of all) {
    if (other.id === exam.id || other.examType !== "monthly") continue;
    if (!level || homeroomKey(inferLevel(other)) !== level) continue;
    if (!month || inferPeriodMonth(other) !== month) continue;
    if (homeroomKey(teacherOf(other, board)) !== teacher) {
      out.push({ exam: other, included: false, reason: "담임이 다른 반" });
      continue;
    }
    if (!samePaper(exam, other)) {
      out.push({ exam: other, included: false, reason: "문항 수·정답·배점이 달라 같은 시험지가 아님" });
      continue;
    }
    out.push({ exam: other, included: true });
  }
  return out;
}

export function cohortLabelFor(mode: CohortMode): string {
  return mode === "level" ? "레벨 평균" : "반 평균";
}

/** 성적표에 적는 비교 집단 설명 — 어느 반들이 들어갔는지 */
export function cohortNoteFor(exam: Pick<OmrExam, "level" | "classNames" | "title" | "cohortMode">, included: readonly OmrExam[]): string {
  const classesOf = (e: Pick<OmrExam, "classNames" | "title">) => (e.classNames.length > 0 ? e.classNames : [e.title]);
  if (exam.cohortMode !== "level" || included.length === 0) {
    const classes = classesOf(exam);
    return `${classes.length > 1 ? `${classes.length}개 반` : "우리 반"} 기준 — ${classes.join(", ")}`;
  }
  const classes = [exam, ...included].flatMap(classesOf);
  return `같은 레벨(${inferLevel(exam)}) ${classes.length}개 반 기준 — ${classes.join(", ")}`;
}
