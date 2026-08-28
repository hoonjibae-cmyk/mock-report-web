// OMR 시험/성적표 공통 타입

import type { MarkValue } from "@/lib/omr-answers";

export type ExamType = "mock" | "saturday" | "monthly" | "placement" | "inclass";
export type ReportFamily = "A_rich" | "B_english" | "C_generic";

export const EXAM_TYPE_LABELS: Record<ExamType, string> = {
  mock: "국영수 모의고사",
  saturday: "토요모의고사(영어)",
  monthly: "월말평가",
  placement: "반배치고사(레벨테스트)",
  inclass: "인클래스 테스트",
};

// 문항수를 유저가 고르는 유형(범용). mock/saturday는 정해진 구성.
export const USER_QUESTION_COUNT: Record<ExamType, boolean> = {
  mock: false,
  saturday: false,
  monthly: true,
  placement: true,
  inclass: true,
};

export function reportFamilyFor(type: ExamType): ReportFamily {
  if (type === "mock") return "A_rich";
  if (type === "saturday") return "B_english";
  return "C_generic";
}

export interface OmrConfig {
  per_column?: number;
  period?: string;
  subject_label?: string;
  essay_count?: number;
  [key: string]: unknown;
}

export interface OmrExam {
  id: string;
  examType: ExamType;
  reportFamily: ReportFamily;
  title: string;
  subject: string | null;
  examDate: string | null;
  numQuestions: number;
  numChoices: number;
  idDigits: number;
  omrStyle: "exam" | "basic";
  omrConfig: OmrConfig;
  /**
   * {문항번호: 정답} — 키는 문자열(jsonb).
   * 값이 숫자면 보기 하나, 배열이면 '모두 고르기' 문항(전부 맞혀야 정답).
   */
  answerKey: Record<string, MarkValue>;
  /** {문항번호: 배점} — 비어 있으면 100점 만점 균등 배점 */
  points: Record<string, number>;
  /** {문항번호: {area}} — 문항별 영역(듣기·어법 등). 미설정 시 영역 분석 생략 */
  questionMeta: Record<string, { area?: string }>;
  /** 절대평가 등급컷 [{grade, min}] — min은 100점 환산 하한. 비어 있으면 등급 미표기 */
  gradeCuts: Array<{ grade: number; min: number }>;
  useTeacherComment: boolean;
  createdByName: string | null;
  createdAt: string;
}

// Python OMR API `/generate` 요청 스펙
export interface OmrSheetSpec {
  exam_id: string;
  title: string;
  num_questions: number;
  num_choices: number;
  id_digits: number;
  per_column: number;
  style: string;
  period?: string;
  subject_label?: string;
  academy?: string;
  essay_count?: number;
  dpi?: number;
}

export const ACADEMY_NAME = "목동유쌤영어학원";
