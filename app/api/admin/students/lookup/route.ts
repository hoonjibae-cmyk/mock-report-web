import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { directoryConfigured, lookupStudents, pingDirectory } from "@/lib/student-directory";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_KEYS = 300;

/** 연동 상태 확인 (설정 화면) */
export async function GET() {
  const auth = await authorizeApi("viewReports");
  if (auth.response) return auth.response;
  if (!directoryConfigured()) {
    return NextResponse.json({ ok: true, configured: false });
  }
  const ping = await pingDirectory();
  return NextResponse.json({ ok: true, configured: true, reachable: ping.ok, message: ping.message });
}

/**
 * 수험번호로 학생 기본정보 조회.
 * API 키가 브라우저로 나가지 않도록 서버가 대신 호출한다.
 */
export async function POST(request: Request) {
  const auth = await authorizeApi("createReports");
  if (auth.response) return auth.response;

  try {
    const body = await request.json().catch(() => ({}));
    const raw = Array.isArray(body.examNumbers) ? body.examNumbers : [];
    const examNumbers = raw.map((value: unknown) => String(value ?? "").trim()).filter(Boolean);
    if (examNumbers.length === 0) {
      return NextResponse.json({ error: "조회할 수험번호가 없습니다." }, { status: 400 });
    }
    if (examNumbers.length > MAX_KEYS) {
      return NextResponse.json(
        { error: `한 번에 최대 ${MAX_KEYS}명까지 조회할 수 있습니다.` },
        { status: 400 },
      );
    }

    const result = await lookupStudents(examNumbers);
    return NextResponse.json({
      ok: true,
      configured: result.configured,
      students: Object.fromEntries(result.students),
      missing: result.missing,
      error: result.error ?? null,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "학생 정보 조회 오류" },
      { status: 500 },
    );
  }
}
