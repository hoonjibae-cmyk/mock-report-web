// 범용(C 계열) OMR 성적표 데이터 스키마 — student_reports.report_data에 저장
// 기존 국영수 성적표(schemaVersion 1)와 family 필드로 구분한다.

import type { ExamType } from "@/lib/omr-types";

export interface GenericItemResult {
  no: number;
  /** 정답 보기번호(1-base) */
  answer: number | null;
  /** 학생 표기(1-base, 미표기는 null) */
  marked: number | null;
  correct: boolean;
  point: number;
  /** 응시 집단 정답률(%) */
  correctRate: number;
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
    /** 100점 만점 환산 원점수 */
    raw: number;
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
  /** 학생이 틀렸고 집단 정답률도 낮은 문항 번호(오답 우선 복습) */
  weakItems: number[];
  /** 같은 유형 시험의 표준점수 추이(이번 시험 포함, 날짜순) */
  growth: GrowthPoint[];
  /** 서술형 문항 수(손채점 별도 안내) */
  essayCount: number;
  /** Phase B에서 채움 */
  teacherComment: { text: string } | null;
  generatedAt: string;
}

export function isGenericReport(data: unknown): data is GenericReportData {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { family?: string }).family === "C_generic"
  );
}
