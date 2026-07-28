export const AI_MODEL_OPTIONS = [
  {
    value: "gpt-5.6-luna",
    label: "GPT-5.6 Luna",
    note: "비용 절감·대량 생성 추천",
  },
  {
    value: "gpt-5.6-terra",
    label: "GPT-5.6 Terra",
    note: "품질과 비용의 균형",
  },
  {
    value: "gpt-5.6-sol",
    label: "GPT-5.6 Sol",
    note: "가장 정교한 총평·비용 높음",
  },
] as const;

export type AiModelId = (typeof AI_MODEL_OPTIONS)[number]["value"];
export const DEFAULT_AI_MODEL: AiModelId = "gpt-5.6-luna";

export function resolveAiModel(value: unknown): AiModelId {
  const candidate = String(value ?? "").trim();
  const matched = AI_MODEL_OPTIONS.find((option) => option.value === candidate);
  return matched?.value ?? DEFAULT_AI_MODEL;
}
