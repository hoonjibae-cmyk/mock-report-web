// 시스템 전역 설정 저장소 (app_settings 테이블) — Supabase service-role 경유
//
// AI 총평 모델처럼 "학원 전체가 하나의 값을 공유해야 하는" 설정을 담는다.
// 브라우저 localStorage에 두면 사람마다 달라지고 서버 작업에는 반영되지 않는다.

import { resolveAiModel, DEFAULT_AI_MODEL, type AiModelId } from "@/lib/ai-models";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const AI_MODEL_KEY = "ai_model";

/** 테이블이 없거나 값이 없어도 서비스는 계속 돌아야 하므로, 실패 시 기본값을 쓴다. */
const CACHE_TTL_MS = 30_000;
let cached: { value: AiModelId; at: number } | null = null;

export interface AppSettings {
  aiModel: AiModelId;
  /** 설정 테이블을 읽지 못해 기본값으로 동작 중인지(마이그레이션 안내용) */
  storageReady: boolean;
}

/** 저장된 AI 총평 모델. 모든 AI 호출은 이 값을 쓴다. */
export async function getAiModel(): Promise<AiModelId> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", AI_MODEL_KEY)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const value = resolveAiModel((data?.value as { model?: unknown } | null)?.model);
    cached = { value, at: Date.now() };
    return value;
  } catch {
    // 마이그레이션 전이거나 연결이 끊긴 경우 — 기본 모델로 계속 동작한다.
    return DEFAULT_AI_MODEL;
  }
}

/** 화면 표시용 — 저장소가 준비됐는지까지 알려준다. */
export async function readSettings(): Promise<AppSettings> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", AI_MODEL_KEY)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      aiModel: resolveAiModel((data?.value as { model?: unknown } | null)?.model),
      storageReady: true,
    };
  } catch {
    return { aiModel: DEFAULT_AI_MODEL, storageReady: false };
  }
}

export async function setAiModel(value: unknown, updatedBy?: string): Promise<AiModelId> {
  const model = resolveAiModel(value);
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("app_settings")
    .upsert(
      { key: AI_MODEL_KEY, value: { model }, updated_at: new Date().toISOString(), updated_by: updatedBy ?? null },
      { onConflict: "key" },
    );
  if (error) {
    throw new Error(
      /relation .* does not exist|schema cache/i.test(error.message)
        ? "설정 저장소가 아직 만들어지지 않았습니다. Supabase → SQL Editor 에서 supabase/migration_v5_app_settings.sql 을 실행해 주세요."
        : `설정 저장 실패: ${error.message}`,
    );
  }
  cached = { value: model, at: Date.now() };
  return model;
}
