/**
 * AI 호출이 실패했을 때 사람이 읽을 문장으로 바꾼다.
 *
 * "초안을 만들지 못했습니다"만 보이면 선생님은 다시 눌러야 할지, 기다려야 할지, 누구에게
 * 말해야 할지 모른다. 왜 실패했는지에 따라 할 일이 다르다 — 요청이 몰린 것이면 잠시 뒤
 * 다시, 시간이 오래 걸린 것이면 다시 한 번, 설정 문제면 관리자에게.
 *
 * OpenAI SDK 오류의 모양(status·code·name)만 보고 가르므로 서버 모듈 없이 시험할 수 있다.
 */

export type AiFailureKind =
  /** 요청이 몰려 거절(429) */
  | "rate_limit"
  /** 응답이 너무 오래 걸려 끊음 */
  | "timeout"
  /** AI 서비스 쪽 장애(5xx·연결 끊김) */
  | "service"
  /** 설정(키·모델) 문제 — 관리자 */
  | "config"
  /** 모델이 답을 끝내지 못함(길이 제한·내용 필터) */
  | "incomplete"
  /** 답은 받았는데 비어 있음 */
  | "empty"
  | "unknown";

export class AiDraftError extends Error {
  readonly kind: AiFailureKind;
  // 생성자 매개변수 속성(public readonly …)은 Node 의 타입 지우기가 못 다루므로 풀어 쓴다
  constructor(kind: AiFailureKind, message: string) {
    super(message);
    this.name = "AiDraftError";
    this.kind = kind;
  }
}

const MESSAGES: Record<AiFailureKind, string> = {
  rate_limit: "AI 요청이 한꺼번에 몰려 잠시 거절되었습니다. 10초쯤 뒤 다시 눌러 주세요.",
  timeout: "AI 응답이 너무 오래 걸려 중단했습니다. 다시 한 번 눌러 주세요(대개 두 번째는 됩니다).",
  service: "AI 서비스가 잠시 응답하지 않습니다. 잠시 뒤 다시 시도해 주세요.",
  config: "AI 설정에 문제가 있어 초안을 만들 수 없습니다. 관리자에게 알려 주세요.",
  incomplete: "AI가 글을 끝맺지 못했습니다. 다시 한 번 눌러 주세요.",
  empty: "AI가 빈 글을 돌려주었습니다. 다시 한 번 눌러 주세요.",
  unknown: "AI 초안을 만들지 못했습니다. 다시 시도해 주세요.",
};

/** 다시 눌러 볼 만한 실패인가 — 화면이 한 번 더 자동으로 시도하는 기준 */
export function isTransient(kind: AiFailureKind): boolean {
  return kind === "rate_limit" || kind === "timeout" || kind === "service" || kind === "incomplete" || kind === "empty";
}

interface ErrorShape {
  name?: unknown;
  status?: unknown;
  code?: unknown;
  message?: unknown;
}

/** OpenAI SDK 오류(또는 아무 오류)를 종류로 가른다 */
export function classifyAiError(error: unknown): AiFailureKind {
  if (error instanceof AiDraftError) return error.kind;
  const shape = (typeof error === "object" && error !== null ? error : {}) as ErrorShape;
  const name = String(shape.name ?? "");
  const status = typeof shape.status === "number" ? shape.status : Number(shape.status ?? NaN);
  const code = String(shape.code ?? "");
  const message = String(shape.message ?? (typeof error === "string" ? error : ""));

  if (status === 429 || name === "RateLimitError" || code === "rate_limit_exceeded") return "rate_limit";
  if (name === "APIConnectionTimeoutError" || /timed? ?out|timeout/i.test(message)) return "timeout";
  if (status === 401 || status === 403 || name === "AuthenticationError" || name === "PermissionDeniedError") return "config";
  if (status === 404 || code === "model_not_found" || /model .* (does not exist|not found)/i.test(message)) return "config";
  if (status === 400 && /max_output_tokens|context length|too long/i.test(message)) return "incomplete";
  if ((status >= 500 && status < 600) || name === "APIConnectionError" || name === "InternalServerError") return "service";
  return "unknown";
}

/** 선생님에게 보여 줄 문장 */
export function describeAiError(error: unknown): string {
  if (error instanceof AiDraftError) return error.message;
  const kind = classifyAiError(error);
  if (kind === "unknown" && error instanceof Error && error.message && !/^\s*$/.test(error.message)) {
    // 우리가 던진 설명(예: 키가 없다)은 그대로 — 모양만 다듬는다
    return error.message;
  }
  return MESSAGES[kind];
}

export function messageFor(kind: AiFailureKind): string {
  return MESSAGES[kind];
}
