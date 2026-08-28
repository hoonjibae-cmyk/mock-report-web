// 범용(C 계열) OMR 성적표 데이터 스키마 — student_reports.report_data에 저장
// 기존 국영수 성적표(schemaVersion 1)와 family 필드로 구분한다.

import type { MarkValue } from "@/lib/omr-answers";
import type { ExamType } from "@/lib/omr-types";

/**
 * 문항 난이도.
 *
 * 출제자가 지정한 값을 우선 쓰고, 지정이 없으면 집단 정답률로 자동 분류한다.
 * 둘은 다른 것을 말한다 — 지정 난이도는 '이 문항을 어느 수준으로 냈는가'이고,
 * 자동 난이도는 '실제로 얼마나 맞혔는가'다. 쉽게 낸 문항을 반이 많이 틀렸다면
 * 그 자체가 지도에 필요한 정보라, 지정값이 있으면 덮어쓰지 않는다.
 */
export type Difficulty = "쉬움" | "보통" | "어려움";

export interface GenericItemResult {
  no: number;
  /** 서술형(주관식) 문항 여부 — 손채점 점수를 사용 */
  essay: boolean;
  /** 정답 — 숫자면 보기 하나, 배열이면 '모두 고르기' 문항. 서술형은 null */
  answer: MarkValue;
  /** 학생 표기 — 숫자/배열/미표기(null). 서술형은 null */
  marked: MarkValue;
  correct: boolean;
  /** 이 문항에서 받은 점수 */
  earned: number;
  point: number;
  /** 응시 집단 정답률(%) — 서술형은 평균 득점률 */
  correctRate: number;
  difficulty: Difficulty;
  /** 난이도를 출제자가 직접 지정했는가(false면 정답률에서 도출한 값) */
  difficultySpecified: boolean;
  /** 분석영역 — 듣기·문법·독해 같은 큰 갈래(미지정 시 null) */
  area: string | null;
  /** 내용 — 빈칸추론·어법성 판단 같은 세부 유형(미지정 시 null) */
  content: string | null;
  /** 국영수 모의고사 기준 자료가 있을 때만 채워지는 분류 */
  classification?: {
    behavior: string;
    area: string;
    content: string;
    detail: string;
    difficulty: string;
    gradeLevel: string;
  };
}

/** 국영수 모의고사 전국 비교 (기준 자료를 올린 경우에만) */
export interface NationalComparison {
  subjectLabel: string;
  /** 전국 등급(1~9) */
  grade: number;
  /** 전국 상위 추정 % — 공개 등급컷 구간을 선형 보간한 참고값 */
  topPercent: number;
  /** 전국 평균 원점수(자료에 없으면 null) */
  average: number | null;
  /** 이 학생 원점수 − 전국 평균 */
  diffFromAverage: number | null;
  note: string;
}

/**
 * 갈래별 성취 — 학생 성취율과 집단 평균 성취율 비교.
 *
 * 분석영역(대분류)과 내용(세부 유형) 두 계층에 같은 모양으로 쓴다.
 */
export interface AreaStat {
  area: string;
  earned: number;
  possible: number;
  /** 학생 성취율(%) = 득점/배점 */
  rate: number;
  /** 응시 집단 평균 성취율(%) = 평균득점/배점 */
  cohortRate: number;
  /** 응시 집단 평균 득점(원점수) — 성취율만으론 감이 안 오므로 함께 싣는다 */
  cohortEarned: number;
}

export interface GrowthPoint {
  examId: string;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  standardScore: number;
  raw: number;
  mean: number;
}

export interface GenericReportData {
  schemaVersion: 2;
  family: "C_generic";
  examId: string;
  examType: ExamType;
  examTypeLabel: string;
  examTitle: string;
  examDate: string | null;
  academy: string;
  student: {
    /** 수험번호(student_key) */
    key: string;
    name: string;
    school: string;
  };
  score: {
    /** 100점 만점 환산 원점수(객관식+서술형) */
    raw: number;
    /** 객관식 득점 */
    objectiveRaw: number;
    /** 서술형 득점 */
    essayRaw: number;
    max: number;
    correctCount: number;
    wrongCount: number;
    blankCount: number;
    totalQuestions: number;
  };
  cohort: {
    count: number;
    mean: number;
    stdev: number;
    max: number;
    min: number;
  };
  /** 20 × (원점수 − 평균) ÷ 표준편차 + 100 */
  standardScore: number;
  rank: number;
  /** 상위 % (석차 기준) */
  topPercent: number;
  /** 등급컷이 설정된 경우에만 */
  grade: number | null;
  items: GenericItemResult[];
  /** 분석영역(대분류)별 성취 — 미설정 시 빈 배열 */
  areas: AreaStat[];
  /** 내용(세부 유형)별 성취 — 미설정 시 빈 배열 */
  contents?: AreaStat[];
  /** 학생이 틀렸고 집단 정답률도 낮은 문항 번호(오답 우선 복습) */
  weakItems: number[];
  /** 같은 유형 시험의 표준점수 추이(이번 시험 포함, 날짜순) */
  growth: GrowthPoint[];
  /** 서술형 문항 수(손채점 별도 안내) */
  essayCount: number;
  /** 국영수 모의고사에서 시험 기반 정보를 올린 경우의 전국 비교 */
  national?: NationalComparison | null;
  /** 분류 기준별 성취(행동영역·대영역·난이도·학년수준) */
  classificationStats?: Array<{ kind: string; label: string; rows: AreaStat[] }>;
  /** Phase B에서 채움 */
  teacherComment: { text: string } | null;
  /** 성적표를 만든 시스템 버전 */
  appVersion?: string;
  generatedAt: string;
}

export function isGenericReport(data: unknown): data is GenericReportData {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { family?: string }).family === "C_generic"
  );
}
