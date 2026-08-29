import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getExam } from "@/lib/omr-exams";
import { lookupStudents, directoryConfigured } from "@/lib/student-directory";
import { messagingConfigured, sendAlimtalk, MessagingNotConfiguredError } from "@/lib/messaging/solapi";
import { listExamMessages, recordMessages, type RecipientType } from "@/lib/report-messages";
import {
  buildSendTargets,
  countTargets,
  resolveSelections,
  templateVariables,
  type SendReportRow,
  type SendSelection,
} from "@/lib/report-send";
import { siteBaseUrl } from "@/lib/utils";

export const runtime = "nodejs";
// 60명에게 보내면 대행사 왕복이 길어질 수 있다. 기본 제한(10초)으로는 모자란다.
export const maxDuration = 120;

/** 한 번에 보낼 수 있는 최대 건수 — 실수로 전교생에게 나가는 것을 막는 안전선 */
const SEND_MAX = 300;

async function loadReports(examId: string): Promise<SendReportRow[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("student_reports")
    .select("id,public_token,student_name,student_key,is_active,created_at")
    .eq("exam_id", examId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`성적표 목록을 불러오지 못했습니다: ${error.message}`);

  // 같은 학생의 성적표를 여러 번 만들었다면 **가장 최근 것만** 보낸다.
  // 예전 링크를 함께 보내면 학부모가 어느 쪽을 봐야 할지 알 수 없다.
  const seen = new Set<string>();
  const rows: SendReportRow[] = [];
  for (const row of data ?? []) {
    const key = (row.student_key as string | null) ?? `#${row.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      id: row.id as string,
      token: row.public_token as string,
      studentName: (row.student_name as string) ?? "",
      studentKey: (row.student_key as string | null) ?? null,
      active: row.is_active !== false,
      createdAt: row.created_at as string,
    });
  }
  return rows;
}

/** 발송 대상 표를 만든다. 평문 번호는 여기서만 살아 있고 밖으로 나가지 않는다. */
async function prepare(examId: string) {
  const reports = await loadReports(examId);
  const keys = [...new Set(reports.map((r) => r.studentKey).filter((v): v is string => Boolean(v)))];
  const lookup = await lookupStudents(keys);
  const messages = await listExamMessages(examId).catch(() => []);
  const targets = buildSendTargets({
    reports,
    directory: lookup.students,
    directoryConfigured: lookup.configured,
    messages,
  });
  return { reports, lookup, targets };
}

/** 발송 대상 현황 — 누구에게 보낼 수 있고, 누구는 왜 못 보내는가 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApi("viewReports");
  if (auth.response) return auth.response;
  const { id } = await context.params;

  try {
    const exam = await getExam(id);
    if (!exam) return NextResponse.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });

    const { lookup, targets } = await prepare(id);
    const siteUrl = siteBaseUrl();

    return NextResponse.json({
      ok: true,
      examTitle: exam.title,
      targets,
      counts: {
        parent: countTargets(targets, "parent"),
        student: countTargets(targets, "student"),
      },
      setup: {
        messagingConfigured: messagingConfigured(),
        directoryConfigured: directoryConfigured(),
        directoryError: lookup.error ?? null,
        siteUrl,
        // 링크 주소가 localhost면 학부모가 열 수 없는 링크가 나간다.
        siteUrlReady: /^https:\/\//.test(siteUrl),
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "발송 대상 조회 오류" },
      { status: 500 },
    );
  }
}

/** 고른 대상에게 알림톡을 보낸다 — {targets: [{reportId, recipientType}]} */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  // 발송은 되돌릴 수 없으므로 성적표를 만들 수 있는 권한과 같은 선에 둔다.
  const auth = await authorizeApi("createReports");
  if (auth.response) return auth.response;
  const { id } = await context.params;

  try {
    const exam = await getExam(id);
    if (!exam) return NextResponse.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });

    const siteUrl = siteBaseUrl();
    if (!/^https:\/\//.test(siteUrl)) {
      return NextResponse.json(
        {
          error:
            "성적표 주소(NEXT_PUBLIC_SITE_URL)가 설정되어 있지 않아 발송할 수 없습니다. " +
            "지금 보내면 학부모가 열 수 없는 링크가 나갑니다. Vercel 환경변수에 https 주소를 넣고 다시 배포해 주세요.",
        },
        { status: 400 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const raw: unknown[] = Array.isArray(body.targets) ? body.targets : [];
    const selections: SendSelection[] = raw
      .map((entry) => entry as { reportId?: unknown; recipientType?: unknown })
      .filter(
        (entry): entry is { reportId: string; recipientType: RecipientType } =>
          typeof entry.reportId === "string" &&
          (entry.recipientType === "parent" || entry.recipientType === "student"),
      )
      .map((entry) => ({ reportId: entry.reportId, recipientType: entry.recipientType }));

    if (selections.length === 0) {
      return NextResponse.json({ error: "보낼 대상을 하나 이상 골라 주세요." }, { status: 400 });
    }
    if (selections.length > SEND_MAX) {
      return NextResponse.json(
        { error: `한 번에 최대 ${SEND_MAX}건까지 보낼 수 있습니다.` },
        { status: 400 },
      );
    }

    const { lookup, targets } = await prepare(id);
    const { send, rejected } = resolveSelections(selections, targets, lookup.students);

    if (send.length === 0) {
      return NextResponse.json(
        {
          error: "보낼 수 있는 대상이 없습니다.",
          rejected,
        },
        { status: 400 },
      );
    }

    const results = await sendAlimtalk(
      send.map((item) => ({
        phone: item.phone,
        key: `${item.reportId}:${item.recipientType}`,
        variables: templateVariables({
          studentName: item.studentName,
          examTitle: exam.title,
          token: item.token,
        }),
      })),
    );

    const byKey = new Map(results.map((r) => [r.key, r]));

    // 대행사 응답과 무관하게 **시도 자체를 남긴다.** 기록이 없으면 실패분만
    // 다시 보낼 수 없다.
    await recordMessages(
      send.map((item) => {
        const result = byKey.get(`${item.reportId}:${item.recipientType}`);
        return {
          reportId: item.reportId,
          examId: id,
          recipientType: item.recipientType,
          phoneMasked: item.phoneMasked,
          status: result?.ok ? ("sent" as const) : ("failed" as const),
          channel: result?.channel ?? null,
          providerMessageId: result?.messageId ?? null,
          error: result?.ok ? null : (result?.error ?? "발송 결과를 확인하지 못했습니다."),
          sentBy: auth.user.displayName,
        };
      }),
    ).catch((error) => {
      // 기록에 실패해도 이미 나간 메시지는 되돌릴 수 없다. 발송 결과를 감추는
      // 것보다 기록 실패를 알리는 편이 낫다.
      console.error("발송 기록 저장 실패", error);
    });

    const sent = results.filter((r) => r.ok).length;
    return NextResponse.json({
      ok: true,
      sent,
      failed: results.length - sent,
      rejected,
      results: send.map((item) => {
        const result = byKey.get(`${item.reportId}:${item.recipientType}`);
        return {
          reportId: item.reportId,
          recipientType: item.recipientType,
          studentName: item.studentName,
          phoneMasked: item.phoneMasked,
          ok: Boolean(result?.ok),
          channel: result?.channel ?? null,
          error: result?.ok ? null : (result?.error ?? "발송 결과를 확인하지 못했습니다."),
        };
      }),
    });
  } catch (error) {
    if (error instanceof MessagingNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "발송 오류" },
      { status: 500 },
    );
  }
}
