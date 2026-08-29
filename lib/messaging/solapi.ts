// 솔라피(SOLAPI) 발송 어댑터 — 카카오 알림톡 + 실패 시 문자 대체발송.
//
// 대행사에 종속되는 코드는 이 파일 하나로 가둔다. 나중에 다른 대행사로 옮겨도
// 같은 모양(sendAlimtalk)만 지키면 나머지 코드는 손대지 않아도 된다.
//
// 알림톡은 카카오에 직접 보낼 수 없다. 대행사를 거쳐야 하고, 문구는 미리
// 심사받은 템플릿만 나간다. 우리가 채우는 것은 `#{변수}` 자리뿐이다.

import { createHmac, randomBytes } from "node:crypto";

const ENDPOINT = "https://api.solapi.com/messages/v4/send-many/detail";

export class MessagingNotConfiguredError extends Error {
  constructor(missing: string[]) {
    super(
      `카카오 알림톡 설정이 비어 있습니다(${missing.join(", ")}). ` +
        "Vercel → Settings → Environment Variables 에 값을 넣고 다시 배포해 주세요.",
    );
    this.name = "MessagingNotConfiguredError";
  }
}

export interface AlimtalkRecipient {
  /** 하이픈 없는 휴대전화 번호 */
  phone: string;
  /** 템플릿의 #{변수} 자리에 채울 값 */
  variables: Record<string, string>;
  /** 호출 측이 결과를 되짚을 수 있게 하는 열쇠(성적표ID:수신자유형) */
  key: string;
}

export interface AlimtalkResult {
  key: string;
  ok: boolean;
  /** 'alimtalk' | 'sms' — 알림톡이 실패해 문자로 나간 경우를 구분 */
  channel: string | null;
  messageId: string | null;
  error: string | null;
}

interface SolapiConfig {
  apiKey: string;
  apiSecret: string;
  pfId: string;
  templateId: string;
  sender: string;
}

function readConfig(): SolapiConfig {
  const config = {
    apiKey: process.env.SOLAPI_API_KEY ?? "",
    apiSecret: process.env.SOLAPI_API_SECRET ?? "",
    pfId: process.env.SOLAPI_PFID ?? "",
    templateId: process.env.SOLAPI_TEMPLATE_ID ?? "",
    sender: process.env.SOLAPI_SENDER ?? "",
  };
  const missing = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => `SOLAPI_${key.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}`);
  if (missing.length > 0) throw new MessagingNotConfiguredError(missing);
  return config;
}

/** 설정이 갖춰졌는지만 확인한다(화면에서 안내를 띄우기 위해) */
export function messagingConfigured(): boolean {
  try {
    readConfig();
    return true;
  } catch {
    return false;
  }
}

/**
 * 솔라피 인증 헤더.
 *
 * 비밀키를 요청에 싣지 않고, 시각+난수를 비밀키로 서명해 보낸다.
 * 서명이 시각을 포함하므로 가로채도 나중에 재사용할 수 없다.
 */
function authHeader(config: SolapiConfig): string {
  const date = new Date().toISOString();
  const salt = randomBytes(32).toString("hex");
  const signature = createHmac("sha256", config.apiSecret).update(date + salt).digest("hex");
  return `HMAC-SHA256 apiKey=${config.apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

/** 하이픈·공백을 걷어낸 번호. 휴대전화가 아니면 null */
export function normalizePhone(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  // 010-xxxx-xxxx 형태만 받는다. 유선번호로는 알림톡이 가지 않는다.
  if (/^01[0-9]{8,9}$/.test(digits)) return digits;
  return null;
}

/** 화면·기록용 마스킹 — 실제 번호는 어디에도 저장하지 않는다 */
export function maskPhone(raw: string | null | undefined): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length < 8) return "번호 없음";
  return `${digits.slice(0, 3)}-****-${digits.slice(-4)}`;
}

/**
 * 알림톡을 보낸다. 실패하면 문자로 대체 발송된다(disableSms=false).
 *
 * 한 건이 실패해도 나머지는 나가야 하므로, 통째로 예외를 던지지 않고
 * 수신자별 성공·실패를 돌려준다. 설정 자체가 없을 때만 예외다.
 */
export async function sendAlimtalk(recipients: AlimtalkRecipient[]): Promise<AlimtalkResult[]> {
  if (recipients.length === 0) return [];
  const config = readConfig();

  const body = {
    messages: recipients.map((r) => ({
      to: r.phone,
      from: config.sender,
      kakaoOptions: {
        pfId: config.pfId,
        templateId: config.templateId,
        variables: r.variables,
        // false면 알림톡이 실패했을 때 문자로 자동 전환된다.
        // 카톡을 안 쓰는 학부모에게도 닿아야 하므로 켜 둔다.
        disableSms: false,
      },
    })),
  };

  let payload: {
    groupInfo?: { count?: { total?: number } };
    messageList?: Array<{
      messageId?: string;
      statusCode?: string;
      statusMessage?: string;
      to?: string;
      type?: string;
    }>;
    failedMessageList?: Array<{ to?: string; statusMessage?: string; statusCode?: string }>;
  };

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader(config),
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      // 접수 자체가 거부된 경우 — 전원 실패로 기록한다
      const reason = text.slice(0, 300) || `HTTP ${res.status}`;
      return recipients.map((r) => ({
        key: r.key,
        ok: false,
        channel: null,
        messageId: null,
        error: `발송 요청이 거부되었습니다: ${reason}`,
      }));
    }
    payload = JSON.parse(text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "알 수 없는 오류";
    return recipients.map((r) => ({
      key: r.key,
      ok: false,
      channel: null,
      messageId: null,
      error: `발송 요청에 실패했습니다: ${reason}`,
    }));
  }

  // 응답은 번호 기준으로 오므로 번호 → 수신자로 되짚는다.
  // 같은 번호가 둘 이상이면(학부모=학생 번호) 순서대로 나눠 준다.
  const byPhone = new Map<string, AlimtalkRecipient[]>();
  for (const r of recipients) {
    const list = byPhone.get(r.phone) ?? [];
    list.push(r);
    byPhone.set(r.phone, list);
  }
  const take = (phone: string | undefined): AlimtalkRecipient | undefined => {
    const list = byPhone.get(String(phone ?? ""));
    return list?.shift();
  };

  const results = new Map<string, AlimtalkResult>();
  for (const entry of payload.messageList ?? []) {
    const recipient = take(entry.to);
    if (!recipient) continue;
    results.set(recipient.key, {
      key: recipient.key,
      ok: true,
      // type이 ATA면 알림톡, 그 외(SMS/LMS)는 대체 발송된 것이다
      channel: entry.type === "ATA" ? "alimtalk" : (entry.type?.toLowerCase() ?? "alimtalk"),
      messageId: entry.messageId ?? null,
      error: null,
    });
  }
  for (const entry of payload.failedMessageList ?? []) {
    const recipient = take(entry.to);
    if (!recipient) continue;
    results.set(recipient.key, {
      key: recipient.key,
      ok: false,
      channel: null,
      messageId: null,
      error: entry.statusMessage ?? entry.statusCode ?? "발송에 실패했습니다.",
    });
  }

  // 응답에 없는 건은 결과를 알 수 없다 — 성공으로 넘기면 안 된다
  return recipients.map(
    (r) =>
      results.get(r.key) ?? {
        key: r.key,
        ok: false,
        channel: null,
        messageId: null,
        error: "발송 결과를 확인하지 못했습니다. 솔라피 콘솔에서 확인해 주세요.",
      },
  );
}
