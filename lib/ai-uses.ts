/**
 * AI 를 부르는 기능의 목록 — 설정 화면이 "어디에 어떤 모델이 쓰이는가"를 보여 주는 근거.
 *
 * 설정의 모델을 따르는 기능과, 코드에 모델이 고정된 기능을 나눈다. 고정된 쪽의 모델·추론
 * 강도는 실제 상수를 그대로 읽어 오므로 코드가 바뀌면 화면도 따라간다. 다만 어떤 기능이
 * 고정인지(목록 자체)는 사람이 적는 것이라, 새 AI 기능을 넣을 때 여기에도 한 줄 보태야 한다.
 */
import { AI_REASONING_EFFORT, DEFAULT_AI_MODEL } from "@/lib/ai-models";
import {
  COMMON_ANALYSIS_MODEL,
  COMMON_REASONING_EFFORT,
  STUDENT_COUNSELLING_MODEL,
  STUDENT_REASONING_EFFORT,
} from "@/lib/counselling-models";

export type AiEffort = "low" | "medium" | "high" | "default";

export const AI_EFFORT_LABELS: Record<AiEffort, string> = {
  low: "낮음",
  medium: "보통",
  high: "높음",
  default: "모델 기본값",
};

export interface AiUse {
  /** 화면에 보이는 기능 이름 */
  feature: string;
  /** 어느 화면에서 언제 도는지 */
  where: string;
}

export interface FixedAiUse extends AiUse {
  model: string;
  effort: AiEffort;
  /** 왜 설정을 따르지 않고 고정했는지 */
  reason: string;
}

/** 설정 화면에서 고른 모델(과 AI_REASONING_EFFORT)을 따르는 기능 */
export const SETTING_DRIVEN_AI_USES: AiUse[] = [
  { feature: "국영수 모의고사 AI 총평", where: "국영수 엑셀을 올릴 때 학생 10명씩 묶어 생성" },
  { feature: "담임 의견 AI 초안", where: "OMR 시험의 시험 총평 · 영역별 출제 안내 · 학생별 의견" },
  { feature: "서술형 손글씨 읽기", where: "서술형 AI 채점 때 답안 칸 사진을 글자로 옮김" },
];

/** 설정과 무관하게 코드에 모델이 정해진 기능 */
export const FIXED_AI_USES: FixedAiUse[] = [
  {
    feature: "공통 문항 분석",
    where: "정답 입력 → 상담 분석용 시험지 → '공통 문항 분석 준비'. 시험당 한 번 만들어 저장",
    model: COMMON_ANALYSIS_MODEL,
    effort: COMMON_REASONING_EFFORT,
    reason: "문항마다 정답 근거와 보기별 이유를 쓰는 가장 무거운 일이라 최상위 모델을 쓴다. 시험당 한 번이라 비용은 한 번이다.",
  },
  {
    feature: "학생별 상담 분석",
    where: "반배치고사 상담(Where's My Class?)에서 학생마다 답안과 공통 분석을 엮어 강약점 정리",
    model: STUDENT_COUNSELLING_MODEL,
    effort: STUDENT_REASONING_EFFORT,
    reason: "학생 수만큼 도는 일이라 가장 싼 모델을 쓴다. 공통 문항 분석을 재사용해 학생당 입력을 줄인다.",
  },
  {
    feature: "시험지 읽기",
    where: "정답 입력 → 상담 분석용 시험지 → '시험지 업로드 · 문항 읽기'. 올린 시험지를 문항별로 옮김",
    model: DEFAULT_AI_MODEL,
    effort: "default",
    reason: "기본 모델에 고정. 시험당 한 번 돌고, 읽은 문항은 사람이 확인·수정한다.",
  },
  {
    feature: "학원 프로그램 자료 정리",
    where: "반배치고사 상담에 넣을 학원 프로그램 설명 자료를 올렸을 때 한 번 정리",
    model: DEFAULT_AI_MODEL,
    effort: "default",
    reason: "기본 모델에 고정. 자료를 새로 올릴 때만 돈다.",
  },
];

/** 설정 화면 문구용 — 설정 모델에 붙는 추론 강도 이름 */
export const SETTING_EFFORT_LABEL = AI_EFFORT_LABELS[AI_REASONING_EFFORT];
