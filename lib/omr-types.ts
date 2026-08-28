// OMR 시험/성적표 공통 타입

import type { MarkValue } from "@/lib/omr-answers";
import type { MockReference } from "@/lib/mock-reference";

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

/**
 * 국영수 모의고사는 과목마다 시험지 구성이 달라 답안지를 따로 만든다.
 * (수능 기준 — 국어 45문항 1교시 · 수학 30문항 2교시 · 영어 45문항 3교시)
 */
export const MOCK_SUBJECTS = [
  { value: "korean", label: "국어", questions: 45, period: "1", subjectLabel: "국어 영역" },
  { value: "math", label: "수학", questions: 30, period: "2", subjectLabel: "수학 영역" },
  { value: "english", label: "영어", questions: 45, period: "3", subjectLabel: "영어 영역" },
] as const;

export type MockSubject = (typeof MOCK_SUBJECTS)[number]["value"];

/** 저장된 subject 문자열을 국영수 과목으로 해석(아니면 null) */
export function mockSubjectOf(subject: string | null | undefined) {
  const key = String(subject ?? "").trim().toLowerCase();
  return MOCK_SUBJECTS.find((s) => s.value === key) ?? null;
}

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
  /**
   * {문항번호: 분류} — 문항별 분석 정보. 미설정 시 해당 분석만 생략한다.
   *
   * 두 계층으로 나눈 것은 성적표에서 서로 다른 질문에 답하기 때문이다.
   *   area    분석영역 — '어느 갈래가 약한가'(듣기·문법·독해)
   *   content 내용     — '어떤 유형에서 막히는가'(빈칸추론·어법성 판단…)
   * 같은 문항이 '독해' 영역이면서 '빈칸추론' 유형일 수 있다.
   */
  questionMeta: Record<
    string,
    {
      area?: string;
      content?: string;
      /** 출제자가 지정한 난이도. 없으면 집단 정답률에서 도출한다 */
      difficulty?: string;
    }
  >;
  /**
   * 국영수 모의고사 기준 자료(문항분류표 · 전국비교기준).
   * 성적표 산출 전에 엑셀로 올린다. 다른 유형은 null.
   */
  mockReference: MockReference | null;
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
