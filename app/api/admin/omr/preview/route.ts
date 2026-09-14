import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { OmrApiNotConfiguredError, previewSheet } from "@/lib/omr-api";
import { ACADEMY_NAME, FIXED_ID_DIGITS, type OmrSheetSpec } from "@/lib/omr-types";

export const runtime = "nodejs";
export const maxDuration = 30;

/** 화면이 보낸 값을 판독 서버가 받는 모양으로 — 범위를 벗어난 값은 여기서 잘라 낸다 */
function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function text(value: unknown, max = 60): string {
  return String(value ?? "").trim().slice(0, max);
}

/**
 * 새 시험 만들기 화면의 답안지 미리보기.
 *
 * API 키가 브라우저로 나가지 않도록 서버가 대신 부른다. 판독 서버가 그린
 * PNG를 그대로 넘기고, 설정이 종이에 안 맞으면 그 안내문을 JSON으로 준다 —
 * 화면이 이미지 자리에 그 문장을 띄운다.
 */
export async function POST(request: Request) {
  const auth = await authorizeApi("createReports");
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => ({}));
  const spec: OmrSheetSpec = {
    exam_id: "PREVIEW",
    title: text(body.title) || "OMR 답안지",
    num_questions: clampInt(body.numQuestions, 1, 120, 45),
    num_choices: clampInt(body.numChoices, 2, 8, 5),
    // 학원 전체가 출결번호 5자리를 쓴다 — 화면에서 고르지 않는다
    id_digits: FIXED_ID_DIGITS,
    per_column: clampInt(body.perColumn, 5, 30, 20),
    style: "exam",
    period: text(body.period, 4),
    subject_label: text(body.subjectLabel, 30),
    academy: ACADEMY_NAME,
    essay_count: clampInt(body.essayCount, 0, 20, 0),
    dpi: 100,
  };

  try {
    const png = await previewSheet(spec);
    return new NextResponse(png, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    if (error instanceof OmrApiNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    const message = error instanceof Error ? error.message : "답안지 미리보기 실패";
    // 잠든 서버를 기다리다 끊긴 경우 — 화면이 다시 부르면 된다
    const asleep = /TimeoutError|timeout|aborted/i.test(message);
    return NextResponse.json(
      { error: asleep ? "답안지 서버를 깨우는 중입니다. 잠시 뒤 다시 그립니다." : message, retry: asleep },
      { status: asleep ? 503 : 422 },
    );
  }
}
