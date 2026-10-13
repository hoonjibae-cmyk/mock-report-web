/**
 * 학교·학년 글자에서 학년을 읽는다 — "은가람중 2" → 중2.
 *
 * 성적표의 학교 칸은 학생 관리 프로그램의 학교 이름과 학년을 붙인 글이다
 * ("은가람중 2", "양정고 1"). 학년만 따로 저장해 두지 않아서, 이 글에서 학교급
 * (초·중·고)과 학년을 다시 읽는다. 토요모의고사는 중1부터 고등학생까지 한
 * 시험을 보므로, 성적표에 "중1부터 고1까지 응시한 시험"이라고 적어 평균이 낮아
 * 보이는 까닭을 밝힌다. 범위는 성적표를 만드는 시점의 응시생 기준이다.
 */
export type SchoolLevel = "초" | "중" | "고";

export interface SchoolGrade {
  level: SchoolLevel;
  grade: number;
}

export interface GradeRange {
  /** "중1" */
  min: string;
  /** "고1" */
  max: string;
  /** 학년을 읽을 수 있었던 응시생 수 */
  count: number;
}

// 글 끝의 "중 2", "중학교 3", "고1", "고등학교 1학년" — 학교 이름 가운데의 '중'·'고'
// ("고척중 2")에 걸리지 않도록 학년 숫자가 뒤따르는 마지막 것만 본다.
const GRADE_RE = /(초|중|고)(?:등학교|학교)?\s*([1-6])\s*(?:학년)?\s*$/;

export function parseSchoolGrade(text: string | null | undefined): SchoolGrade | null {
  const match = String(text ?? "").trim().match(GRADE_RE);
  if (!match) return null;
  const level = match[1] as SchoolLevel;
  const grade = Number(match[2]);
  const maxGrade = level === "초" ? 6 : 3;
  if (grade < 1 || grade > maxGrade) return null;
  return { level, grade };
}

export function gradeLabel(value: SchoolGrade): string {
  return `${value.level}${value.grade}`;
}

/** 초1 < … < 초6 < 중1 < 중2 < 중3 < 고1 < 고2 < 고3 */
export function gradeOrder(value: SchoolGrade): number {
  const base = value.level === "초" ? 0 : value.level === "중" ? 10 : 20;
  return base + value.grade;
}

/** 응시생들의 학교 칸에서 가장 낮은 학년과 가장 높은 학년 — 하나도 못 읽으면 null */
export function gradeRange(texts: readonly (string | null | undefined)[]): GradeRange | null {
  let lo: SchoolGrade | null = null;
  let hi: SchoolGrade | null = null;
  let count = 0;
  for (const text of texts) {
    const parsed = parseSchoolGrade(text);
    if (!parsed) continue;
    count += 1;
    if (!lo || gradeOrder(parsed) < gradeOrder(lo)) lo = parsed;
    if (!hi || gradeOrder(parsed) > gradeOrder(hi)) hi = parsed;
  }
  if (!lo || !hi) return null;
  return { min: gradeLabel(lo), max: gradeLabel(hi), count };
}

/**
 * 성적표에 적을 문장 — 학년이 섞여 있을 때만. 한 학년만 본 시험이면 평균이
 * 낮은 까닭이 되지 않으므로 빈 글을 돌려준다.
 */
export function gradeRangeSentence(range: Pick<GradeRange, "min" | "max"> | null | undefined): string {
  if (!range || !range.min || !range.max || range.min === range.max) return "";
  return `${range.min}부터 ${range.max}까지 응시한 시험으로 다소 평균이 낮을 수 있습니다.`;
}
