// 성적표 발송 기록 저장소.
//
// 60명에게 보내고 나면 실패한 몇 건이 조용히 묻힌다. "누가 못 받았는가"를
// 답할 수 있어야 실패분만 다시 보낼 수 있고, "이미 보낸 것을 또 보내는" 사고도
// 막을 수 있다.

import { getSupabaseAdmin } from "@/lib/supabase-admin";

export type RecipientType = "parent" | "student";
export type MessageStatus = "sent" | "failed";

export interface ReportMessage {
  id: string;
  reportId: string;
  examId: string | null;
  recipientType: RecipientType;
  phoneMasked: string;
  status: MessageStatus;
  channel: string | null;
  providerMessageId: string | null;
  error: string | null;
  sentBy: string | null;
  createdAt: string;
}

interface Row {
  id: string;
  report_id: string;
  exam_id: string | null;
  recipient_type: RecipientType;
  phone_masked: string;
  status: MessageStatus;
  channel: string | null;
  provider_message_id: string | null;
  error: string | null;
  sent_by: string | null;
  created_at: string;
}

const SELECT =
  "id,report_id,exam_id,recipient_type,phone_masked,status,channel,provider_message_id,error,sent_by,created_at";

function map(row: Row): ReportMessage {
  return {
    id: row.id,
    reportId: row.report_id,
    examId: row.exam_id,
    recipientType: row.recipient_type,
    phoneMasked: row.phone_masked,
    status: row.status,
    channel: row.channel,
    providerMessageId: row.provider_message_id,
    error: row.error,
    sentBy: row.sent_by,
    createdAt: row.created_at,
  };
}

function describeDbError(message: string): string {
  if (/relation .* does not exist|schema cache/i.test(message)) {
    return "발송 기록 표가 아직 없습니다. Supabase → SQL Editor 에서 supabase/migration_v10_report_messages.sql 을 실행해 주세요.";
  }
  return message;
}

export interface RecordMessageInput {
  reportId: string;
  examId: string | null;
  recipientType: RecipientType;
  phoneMasked: string;
  status: MessageStatus;
  channel?: string | null;
  providerMessageId?: string | null;
  error?: string | null;
  sentBy?: string | null;
}

export async function recordMessages(inputs: RecordMessageInput[]): Promise<void> {
  if (inputs.length === 0) return;
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("report_messages").insert(
    inputs.map((input) => ({
      report_id: input.reportId,
      exam_id: input.examId,
      recipient_type: input.recipientType,
      phone_masked: input.phoneMasked,
      status: input.status,
      channel: input.channel ?? null,
      provider_message_id: input.providerMessageId ?? null,
      error: input.error ?? null,
      sent_by: input.sentBy ?? null,
    })),
  );
  if (error) throw new Error(`발송 기록 저장 실패 — ${describeDbError(error.message)}`);
}

/** 이 시험에서 나간 발송 기록 전체(최신순) */
export async function listExamMessages(examId: string): Promise<ReportMessage[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("report_messages")
    .select(SELECT)
    .eq("exam_id", examId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`발송 기록을 불러오지 못했습니다 — ${describeDbError(error.message)}`);
  return (data as Row[]).map(map);
}

export interface SendSummary {
  /** 성공한 발송이 한 번이라도 있는가 */
  sent: boolean;
  lastAt: string | null;
  lastStatus: MessageStatus | null;
  attempts: number;
  /** 마지막 실패의 사유 — 화면에 '실패'만 뜨면 손쓸 방법이 없다 */
  lastError: string | null;
}

/**
 * 성적표·수신자별로 마지막 상태를 추린다.
 *
 * "이미 보냈는가"의 기준은 **성공한 발송이 있는가**다. 실패만 쌓인 건은
 * 아직 안 보낸 것으로 봐야 다시 보낼 수 있다.
 */
export function summarizeByReport(messages: ReportMessage[]): Map<string, SendSummary> {
  const out = new Map<string, SendSummary>();
  // 최신순으로 들어오므로, 처음 만나는 것이 마지막 시도다
  for (const message of messages) {
    const key = `${message.reportId}:${message.recipientType}`;
    const current = out.get(key);
    if (!current) {
      out.set(key, {
        sent: message.status === "sent",
        lastAt: message.createdAt,
        lastStatus: message.status,
        attempts: 1,
        lastError: message.status === "failed" ? message.error : null,
      });
      continue;
    }
    current.attempts += 1;
    if (message.status === "sent") current.sent = true;
  }
  return out;
}
