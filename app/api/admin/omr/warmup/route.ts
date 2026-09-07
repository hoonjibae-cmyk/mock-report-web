import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { pingOmrApi } from "@/lib/omr-api";

export const runtime = "nodejs";
export const maxDuration = 90;

/**
 * 판독 서버 깨우기.
 *
 * 작은 요금제의 판독 서버는 15분 놀면 잠들고, 깨우는 데 1분쯤 걸린다. 그 1분이
 * 하필 답안지를 뽑거나 스캔을 올리는 순간에 걸리면 실패로 보인다.
 *
 * 그래서 사람이 시험 화면에 들어온 순간 미리 깨워 둔다. 설정을 확인하고 인쇄
 * 매수를 세는 사이에 서버가 일어나므로, 정작 버튼을 누를 때는 기다림이 없다.
 *
 * 응답을 기다리지 않고 불러도 된다 — 깨우는 것 자체가 목적이다.
 */
export async function GET() {
  const auth = await authorizeApi("createReports");
  if (auth.response) return auth.response;

  const started = Date.now();
  const result = await pingOmrApi();
  return NextResponse.json(
    { ...result, ms: Date.now() - started },
    { headers: { "Cache-Control": "no-store" } },
  );
}
