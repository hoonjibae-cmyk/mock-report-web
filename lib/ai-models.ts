/**
 * 설정 화면에서 고르는 AI 모델.
 *
 * 세 선택지 모두 GPT-6 세대다. 5.6 세대일 때 저장해 둔 값은 같은 등급의 6 세대로
 * 옮겨 읽는다(LEGACY_AI_MODELS) — 설정을 다시 고르지 않아도 되고 등급 선택은 그대로다.
 * 여기서 고른 모델을 따르는 기능과, 코드에 고정된 기능의 목록은 lib/ai-uses.ts 에 있다.
 */
export const AI_MODEL_OPTIONS = [
  {
    value: "gpt-6-luna",
    label: "GPT-6 Luna",
    note: "비용 절감·대량 생성 추천",
  },
  {
    value: "gpt-6.1-terra",
    label: "GPT-6.1 Terra",
    note: "품질과 비용의 균형",
  },
  {
    value: "gpt-6.1-sol",
    label: "GPT-6.1 Sol",
    note: "가장 정교한 총평·비용 높음",
  },
] as const;

export type AiModelId = (typeof AI_MODEL_OPTIONS)[number]["value"];
export const DEFAULT_AI_MODEL: AiModelId = "gpt-6-luna";

/**
 * 설정에서 고른 모델로 부를 때 붙이는 추론 강도.
 *
 * 6 세대 모델은 답을 내기 전에 '생각하는' 토큰도 출력으로 과금한다. 초안·총평·전사처럼
 * 학생 수만큼 도는 일은 낮게 고정해야 보이지 않는 출력이 쌓이지 않고 응답도 빠르다.
 */
export const AI_REASONING_EFFORT = "low" as const;

/** Responses API 호출에 공통으로 넣는 값 — 모델과 추론 강도를 한곳에서 정한다 */
export function aiModelParams(model: AiModelId): { model: AiModelId; reasoning: { effort: typeof AI_REASONING_EFFORT } } {
  return { model, reasoning: { effort: AI_REASONING_EFFORT } };
}

/** 이전 세대 모델 ID → 같은 등급의 현재 모델 */
const LEGACY_AI_MODELS: Record<string, AiModelId> = {
  "gpt-5.6-luna": "gpt-6-luna",
  "gpt-5.6-terra": "gpt-6.1-terra",
  "gpt-5.6-sol": "gpt-6.1-sol",
};

export function resolveAiModel(value: unknown): AiModelId {
  const candidate = String(value ?? "").trim();
  const matched = AI_MODEL_OPTIONS.find((option) => option.value === candidate);
  return matched?.value ?? LEGACY_AI_MODELS[candidate] ?? DEFAULT_AI_MODEL;
}

/** 화면 표기용 이름. 선택지에 없는 ID 는 그대로 보여 준다. */
export function aiModelLabel(model: string): string {
  return AI_MODEL_OPTIONS.find((option) => option.value === model)?.label ?? model;
}
