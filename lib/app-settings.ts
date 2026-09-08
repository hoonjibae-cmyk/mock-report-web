// 시스템 전역 설정 저장소 (app_settings 테이블) — Supabase service-role 경유
//
// AI 총평 모델처럼 "학원 전체가 하나의 값을 공유해야 하는" 설정을 담는다.
// 브라우저 localStorage에 두면 사람마다 달라지고 서버 작업에는 반영되지 않는다.

import { resolveAiModel, DEFAULT_AI_MODEL, type AiModelId } from "@/lib/ai-models";
import { normalizeCommentStyle, type CommentStyle } from "@/lib/omr-comments";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const AI_MODEL_KEY = "ai_model";
const COMMENT_STYLE_KEY = "comment_style";
const TEST_PHONE_KEY = "alimtalk_test_phone";

/**
 * 알림톡 시험 발송을 받을 번호의 기본값.
 *
 * 학부모 60명에게 보내기 전에 한 번 받아 보는 용도다. 값은 설정 화면에서
 * 언제든 바꿀 수 있고, 여기 적힌 것은 처음 한 번의 출발점일 뿐이다.
 */
export const DEFAULT_TEST_PHONE = "01055982753";

/**
 * 새 시험을 만들 때 기본으로 잡히는 의견 작성 방식.
 *
 * 시험마다 바꿀 수 있으므로 여기서 정하는 건 '출발점'일 뿐이다. 늘 같은 방식을
 * 쓰는 학원이 시험마다 고르지 않아도 되게 하는 값이다.
 */
export const DEFAULT_COMMENT_STYLE: CommentStyle = "free";

/** 테이블이 없거나 값이 없어도 서비스는 계속 돌아야 하므로, 실패 시 기본값을 쓴다. */
const CACHE_TTL_MS = 30_000;
let cached: { value: AiModelId; at: number } | null = null;

export interface AppSettings {
  aiModel: AiModelId;
  /** 새 시험의 의견 작성 방식 기본값(시험마다 바꿀 수 있음) */
  commentStyle: CommentStyle;
  /** 알림톡 시험 발송을 받을 번호(하이픈 없는 숫자) */
  testPhone: string;
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

/** 새 시험에 기본으로 잡을 의견 작성 방식 */
export async function getCommentStyle(): Promise<CommentStyle> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", COMMENT_STYLE_KEY)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return normalizeCommentStyle((data?.value as { style?: unknown } | null)?.style) ?? DEFAULT_COMMENT_STYLE;
  } catch {
    return DEFAULT_COMMENT_STYLE;
  }
}

/** 화면 표시용 — 저장소가 준비됐는지까지 알려준다. */
export async function readSettings(): Promise<AppSettings> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("app_settings")
      .select("key,value")
      .in("key", [AI_MODEL_KEY, COMMENT_STYLE_KEY, TEST_PHONE_KEY]);
    if (error) throw new Error(error.message);
    const byKey = new Map((data ?? []).map((row) => [row.key as string, row.value]));
    return {
      aiModel: resolveAiModel((byKey.get(AI_MODEL_KEY) as { model?: unknown } | undefined)?.model),
      commentStyle:
        normalizeCommentStyle((byKey.get(COMMENT_STYLE_KEY) as { style?: unknown } | undefined)?.style) ??
        DEFAULT_COMMENT_STYLE,
      testPhone:
        normalizeTestPhone((byKey.get(TEST_PHONE_KEY) as { phone?: unknown } | undefined)?.phone) ??
        DEFAULT_TEST_PHONE,
      storageReady: true,
    };
  } catch {
    return {
      aiModel: DEFAULT_AI_MODEL,
      commentStyle: DEFAULT_COMMENT_STYLE,
      testPhone: DEFAULT_TEST_PHONE,
      storageReady: false,
    };
  }
}

/** 휴대전화 번호만 통과시킨다 — 알림톡은 유선번호로 가지 않는다 */
function normalizeTestPhone(value: unknown): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  return /^01[0-9]{8,9}$/.test(digits) ? digits : null;
}

/** 알림톡 시험 발송을 받을 번호 */
export async function getTestPhone(): Promise<string> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", TEST_PHONE_KEY)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return normalizeTestPhone((data?.value as { phone?: unknown } | null)?.phone) ?? DEFAULT_TEST_PHONE;
  } catch {
    return DEFAULT_TEST_PHONE;
  }
}

export async function setTestPhone(value: unknown, updatedBy?: string): Promise<string> {
  const phone = normalizeTestPhone(value);
  if (!phone) {
    throw new Error("휴대전화 번호를 010으로 시작하는 숫자로 입력해 주세요. 알림톡은 유선번호로 가지 않습니다.");
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("app_settings")
    .upsert(
      { key: TEST_PHONE_KEY, value: { phone }, updated_at: new Date().toISOString(), updated_by: updatedBy ?? null },
      { onConflict: "key" },
    );
  if (error) {
    throw new Error(
      /relation .* does not exist|schema cache/i.test(error.message)
        ? "설정 저장소가 아직 만들어지지 않았습니다. Supabase → SQL Editor 에서 supabase/migration_v5_app_settings.sql 을 실행해 주세요."
        : `설정 저장 실패: ${error.message}`,
    );
  }
  return phone;
}

export async function setCommentStyle(value: unknown, updatedBy?: string): Promise<CommentStyle> {
  const style = normalizeCommentStyle(value) ?? DEFAULT_COMMENT_STYLE;
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("app_settings")
    .upsert(
      { key: COMMENT_STYLE_KEY, value: { style }, updated_at: new Date().toISOString(), updated_by: updatedBy ?? null },
      { onConflict: "key" },
    );
  if (error) {
    throw new Error(
      /relation .* does not exist|schema cache/i.test(error.message)
        ? "설정 저장소가 아직 만들어지지 않았습니다. Supabase → SQL Editor 에서 supabase/migration_v5_app_settings.sql 을 실행해 주세요."
        : `설정 저장 실패: ${error.message}`,
    );
  }
  return style;
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

/**
 * 인사 연동 자동 실행을 켜 두었는가.
 *
 * 왜 이런 걸 두는가
 * ----------------
 * 첫 동기화는 대상 부서 전원에게 슬랙 DM을 보낸다. 설정을 막 마친 배포에서
 * 그것이 예고 없이 나가면, 잘못된 주소나 잘못된 명단이 그대로 전 직원에게
 * 간다. 되돌릴 수 없다.
 *
 * 그래서 **관리자가 화면에서 한 번 직접 돌려 결과를 눈으로 본 뒤에야**
 * 자동 실행이 시작된다. 그 한 번이 끝나면 이 값이 켜지고, 이후로는 사람이
 * 아무것도 기억하지 않아도 된다 — 환경변수로 껐다 켜게 만들면 끄고 잊는
 * 순간 퇴사자 차단이 조용히 멈춘다.
 */
const HR_SYNC_ARMED_KEY = "hr_sync_armed";

export async function hrSyncArmed(): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", HR_SYNC_ARMED_KEY)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data?.value as { armed?: unknown } | null)?.armed === true;
  } catch {
    // 읽지 못하면 켜지 않은 것으로 본다. 확신이 없을 때 60명에게 DM을 보내는
    // 쪽보다 안 보내는 쪽이 되돌리기 쉽다.
    return false;
  }
}

export async function armHrSync(updatedBy?: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase
    .from("app_settings")
    .upsert(
      {
        key: HR_SYNC_ARMED_KEY,
        value: { armed: true },
        updated_at: new Date().toISOString(),
        updated_by: updatedBy ?? null,
      },
      { onConflict: "key" },
    );
}
