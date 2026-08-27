import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { createExam, listExams } from "@/lib/omr-exams";
import { EXAM_TYPE_LABELS, type ExamType, type OmrConfig } from "@/lib/omr-types";

export const runtime = "nodejs";

const VALID_TYPES = Object.keys(EXAM_TYPE_LABELS) as ExamType[];

export async function GET() {
  const auth = await authorizeApi("viewReports");
  if (auth.response) return auth.response;
  try {
    return NextResponse.json({ exams: await listExams() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "시험 목록 오류" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await authorizeApi("createReports");
  if (auth.response) return auth.response;

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });

    const examType = String(body.examType) as ExamType;
    const title = String(body.title ?? "").trim();
    const numQuestions = Number(body.numQuestions);
    const numChoices = Number(body.numChoices ?? 5);
    const idDigits = Number(body.idDigits ?? 5);
    const omrStyle = body.omrStyle === "basic" ? "basic" : "exam";

    if (!VALID_TYPES.includes(examType)) {
      return NextResponse.json({ error: "시험 유형이 올바르지 않습니다." }, { status: 400 });
    }
    if (!title) return NextResponse.json({ error: "시험 제목을 입력해 주세요." }, { status: 400 });
    if (!Number.isInteger(numQuestions) || numQuestions < 1 || numQuestions > 120) {
      return NextResponse.json({ error: "문항 수는 1~120 사이여야 합니다." }, { status: 400 });
    }
    if (!Number.isInteger(numChoices) || numChoices < 2 || numChoices > 8) {
      return NextResponse.json({ error: "보기 수는 2~8 사이여야 합니다." }, { status: 400 });
    }
    if (!Number.isInteger(idDigits) || idDigits < 3 || idDigits > 9) {
      return NextResponse.json({ error: "수험번호 자리수는 3~9 사이여야 합니다." }, { status: 400 });
    }

    const omrConfig: OmrConfig = {};
    if (body.perColumn != null && Number.isInteger(Number(body.perColumn))) {
      omrConfig.per_column = Number(body.perColumn);
    }
    if (typeof body.period === "string" && body.period.trim()) omrConfig.period = body.period.trim();
    if (typeof body.subjectLabel === "string" && body.subjectLabel.trim()) {
      omrConfig.subject_label = body.subjectLabel.trim();
    }
    const essayCount = Number(body.essayCount);
    if (Number.isInteger(essayCount) && essayCount > 0) {
      if (essayCount > 20) {
        return NextResponse.json({ error: "서술형 문항 수는 0~20 사이여야 합니다." }, { status: 400 });
      }
      omrConfig.essay_count = essayCount;
    }

    const exam = await createExam(
      {
        examType,
        title,
        subject: typeof body.subject === "string" ? body.subject : undefined,
        examDate: typeof body.examDate === "string" ? body.examDate : undefined,
        numQuestions,
        numChoices,
        idDigits,
        omrStyle,
        omrConfig,
        useTeacherComment: Boolean(body.useTeacherComment),
      },
      { username: auth.user.username, displayName: auth.user.displayName },
    );
    return NextResponse.json({ ok: true, exam });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "시험 생성 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
