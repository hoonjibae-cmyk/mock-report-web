import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { getTestPhone } from "@/lib/app-settings";
import {
  MessagingNotConfiguredError,
  maskPhone,
  messagingConfigured,
  sendAlimtalk,
} from "@/lib/messaging/solapi";
import { templateVariables } from "@/lib/report-send";
import { siteBaseUrl } from "@/lib/utils";

export const runtime = "nodejs";

/**
 * 시험 발송에 쓰는 가짜 값.
 *
 * 실제 성적표 링크를 쓰지 않는 것은 의도한 것이다. 그 링크는 어느 학생의
 * 것이고, 시험해 보자고 남의 성적표 주소를 내 휴대전화로 부를 이유가 없다.
 * 여기서 확인할 것은 '메시지가 오는가, 문구가 맞는가, 버튼이 우리 주소를
 * 여는가'까지다. 성적표 화면 자체는 발송 화면에서 한 명만 골라 보내 본다.
 */
const SAMPLE_TOKEN = "test-preview";

/** 시험 발송 대상 확인 — 지금 어느 번호로 나가는지 */
export async function GET() {
  const auth = await authorizeApi("viewReports");
  if (auth.response) return auth.response;

  const phone = await getTestPhone();
  const siteUrl = siteBaseUrl();
  return NextResponse.json({
    ok: true,
    phone,
    phoneMasked: maskPhone(phone),
    messagingConfigured: messagingConfigured(),
    siteUrlReady: /^https:\/\//.test(siteUrl),
    siteUrl,
    linkPreview: `${siteUrl.replace(/\/$/, "")}/r/${SAMPLE_TOKEN}`,
  });
}

/** 설정된 번호로 알림톡을 한 건 보낸다 */
export async function POST() {
  // 실제로 돈이 나가고 되돌릴 수 없는 발송이므로 관리자만 누른다.
  const auth = await authorizeApi("createReports");
  if (auth.response) return auth.response;
  if (auth.user?.role !== "admin") {
    return NextResponse.json({ error: "관리자만 시험 발송을 할 수 있습니다." }, { status: 403 });
  }

  try {
    const siteUrl = siteBaseUrl();
    if (!/^https:\/\//.test(siteUrl)) {
      return NextResponse.json(
        {
          error:
            "성적표 주소(NEXT_PUBLIC_SITE_URL)가 설정되어 있지 않습니다. " +
            "이대로 보내면 버튼이 엉뚱한 주소를 엽니다. Vercel 환경변수를 넣고 다시 배포해 주세요.",
        },
        { status: 400 },
      );
    }

    const phone = await getTestPhone();
    const [result] = await sendAlimtalk([
      {
        phone,
        key: "test",
        variables: templateVariables({
          studentName: "홍길동",
          examTitle: "발송 테스트",
          // 응시일은 빈 값이면 발송이 거부될 수 있어, 오늘 날짜를 넣는다.
          examDate: new Date().toISOString().slice(0, 10),
          token: SAMPLE_TOKEN,
        }),
      },
    ]);

    if (!result?.ok) {
      return NextResponse.json(
        { error: result?.error ?? "시험 발송에 실패했습니다." },
        { status: 502 },
      );
    }
    return NextResponse.json({
      ok: true,
      phoneMasked: maskPhone(phone),
      channel: result.channel,
      // 시험 발송은 성적표에 딸린 것이 아니라 report_messages에 남기지 않는다.
      // 그 표는 "누가 성적표를 받았는가"를 답하는 곳이라, 시험 기록이 섞이면
      // 발송 현황을 잘못 읽게 된다.
    });
  } catch (error) {
    if (error instanceof MessagingNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "시험 발송 오류" },
      { status: 500 },
    );
  }
}
