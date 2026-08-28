// 담임 의견 AI 초안 생성 (OpenAI) — 총평(시험 공통) / 개별 코멘트

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { resolveAiModel, DEFAULT_AI_MODEL, type AiModelId } from "@/lib/ai-models";
import type { OmrExam } from "@/lib/omr-types";
import { EXAM_TYPE_LABELS } from "@/lib/omr-types";
import type { GenericReportData } from "@/lib/omr-report-types";

const DraftSchema = z.object({ draft: z.string() });

/**
 * 개별 코멘트 초안 — 종합 평가와 영역별 평가를 한 번에 받는다.
 *
 * 나눠서 두 번 부르면 같은 학생을 두 번 읽어야 하고 말이 어긋나기 쉽다.
 * 등급은 성취율에서 이미 제안해 두었으므로, AI에게는 서술만 맡긴다.
 */
const StudentDraftSchema = z.object({
  overall: z.string(),
  areas: z.array(z.object({ area: z.string(), text: z.string() })),
});

/** 영역별 출제 안내 초안 — 응시생 전원에게 똑같이 실린다 */
const AreaNotesSchema = z.object({
  areas: z.array(z.object({ area: z.string(), text: z.string() })),
});

function getClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

const COMMON_RULES = `반드시 지킬 작성 원칙:
- 학원 담임 선생님이 직접 쓴 글처럼 자연스러운 존댓말로 작성합니다. AI, 인공지능, 자동 생성 같은 표현은 절대 쓰지 않습니다.
- 제공된 수치만 근거로 하고, 확인되지 않은 학습 태도나 습관을 사실처럼 단정하지 않습니다.
- 따뜻하되 구체적으로 씁니다. 막연한 칭찬·격려("잘했어요", "화이팅")만으로 채우지 않습니다.
- 학원 자체 시험이므로 학원 평균·석차·표준점수 언급은 자연스럽게 허용됩니다.`;

/** 시험 공통 총평 초안 — 응시 집단 전체에 대한 분석 */
export async function draftOverviewComment(
  exam: OmrExam,
  stats: {
    count: number;
    mean: number;
    stdev: number;
    max: number;
    min: number;
    hardestItems: Array<{ no: number; correctRate: number }>;
  },
  teacherMemo: string,
  requestedModel: AiModelId = DEFAULT_AI_MODEL,
): Promise<string> {
  const client = getClient();
  if (!client) {
    throw new Error("OPENAI_API_KEY가 설정되어 있지 않아 AI 초안을 만들 수 없습니다. 직접 작성해 주세요.");
  }
  const model = resolveAiModel(requestedModel);
  const payload = {
    examTitle: exam.title,
    examType: EXAM_TYPE_LABELS[exam.examType],
    examDate: exam.examDate,
    numQuestions: exam.numQuestions,
    cohort: stats,
    teacherMemo: teacherMemo || null,
  };

  const response = await client.responses.parse({
    model,
    input: [
      {
        role: "system",
        content: `당신은 영어학원 담임 선생님을 돕는 보조 작가입니다. 이번 시험에 응시한 학생 모두의 성적표에 공통으로 실릴 '이번 시험 총평'의 초안을 작성합니다. 특정 학생이 아니라 시험과 응시 집단 전체에 대한 분석입니다.

${COMMON_RULES}
- 4~6문장으로 작성합니다: 이번 시험의 성격·난이도 → 응시 집단의 전반적 성취 → 많이 어려워한 부분(정답률 낮은 문항 경향) → 다음 학습에서 함께 챙길 방향.
- teacherMemo가 있으면 그 관찰을 자연스럽게 반영합니다.
- 문항 번호를 그대로 나열하기보다 그 문항들이 요구한 능력을 풀어 설명합니다.`,
      },
      {
        role: "user",
        content: `아래 시험 데이터를 바탕으로 총평 초안을 작성하세요.\n${JSON.stringify(payload)}`,
      },
    ],
    text: { format: zodTextFormat(DraftSchema, "overview_draft") },
  });

  const draft = response.output_parsed?.draft?.trim();
  if (!draft) throw new Error("AI 초안 생성에 실패했습니다. 다시 시도해 주세요.");
  return draft;
}

/**
 * 시험의 영역별 출제 안내 초안.
 *
 * "이번 시험에서 이 영역의 무엇을 확인했는가"를 영역마다 한 단락씩 쓴다.
 * 응시생 전원의 성적표에 똑같이 실리므로 시험당 한 번만 만든다.
 */
export async function draftAreaNotes(
  exam: OmrExam,
  areas: Array<{ area: string; contents: string[]; possible: number }>,
  teacherMemo: string,
  requestedModel: AiModelId = DEFAULT_AI_MODEL,
): Promise<Array<{ area: string; text: string }>> {
  const client = getClient();
  if (!client) {
    throw new Error("OPENAI_API_KEY가 설정되어 있지 않아 AI 초안을 만들 수 없습니다. 직접 작성해 주세요.");
  }
  if (areas.length === 0) return [];
  const model = resolveAiModel(requestedModel);

  const response = await client.responses.parse({
    model,
    input: [
      {
        role: "system",
        content: `당신은 영어학원 담임 선생님을 돕는 보조 작가입니다. 성적표 앞머리에 실릴 '이번 시험 안내'를 영역마다 한 단락씩 작성합니다. 특정 학생이 아니라 시험 자체에 대한 설명이며, 응시생 전원에게 똑같이 나갑니다.

${COMMON_RULES}
- 영역마다 2~3문장으로, "이 영역에서 무엇을 확인하고자 했는가"를 씁니다.
- 주어진 contents(출제된 문항 유형)를 근거로 구체적으로 씁니다. 유형 이름을 그대로 나열하기보다 그 유형이 요구하는 능력을 풀어 설명합니다.
- 점수나 학생 성취는 언급하지 않습니다. 여기는 출제 의도만 적는 칸입니다.
- 문장은 "~를 확인하였습니다", "~로 구성하였습니다" 같은 안내 어투로 끝냅니다.
- 입력으로 받은 area 값을 그대로 돌려주고, 순서도 유지합니다.`,
      },
      {
        role: "user",
        content: `아래 시험의 영역 구성을 바탕으로 영역별 안내를 작성하세요.\n${JSON.stringify({
          examTitle: exam.title,
          examType: EXAM_TYPE_LABELS[exam.examType],
          areas,
          teacherMemo: teacherMemo || null,
        })}`,
      },
    ],
    text: { format: zodTextFormat(AreaNotesSchema, "area_notes_draft") },
  });

  const parsed = response.output_parsed?.areas ?? [];
  if (parsed.length === 0) throw new Error("AI 초안 생성에 실패했습니다. 다시 시도해 주세요.");
  return parsed.map((entry) => ({ area: String(entry.area).trim(), text: String(entry.text).trim() }));
}

/** 학생별 개별 코멘트 초안 — 종합 평가 + 영역별 평가 */
export async function draftStudentComment(
  exam: OmrExam,
  report: GenericReportData,
  keywords: { display: string[]; weave: string[] },
  requestedModel: AiModelId = DEFAULT_AI_MODEL,
): Promise<{ overall: string; areas: Array<{ area: string; text: string }> }> {
  const client = getClient();
  if (!client) {
    throw new Error("OPENAI_API_KEY가 설정되어 있지 않아 AI 초안을 만들 수 없습니다. 직접 작성해 주세요.");
  }
  const model = resolveAiModel(requestedModel);

  const weakDetail = report.items
    .filter((item) => report.weakItems.includes(item.no))
    .map((item) => ({ no: item.no, marked: item.marked, answer: item.answer, correctRate: item.correctRate }));

  const payload = {
    examTitle: exam.title,
    examType: EXAM_TYPE_LABELS[exam.examType],
    studentName: report.student.name,
    score: report.score,
    cohort: report.cohort,
    rank: report.rank,
    topPercent: report.topPercent,
    standardScore: report.standardScore,
    growth: report.growth.map((point) => ({ date: point.date, standardScore: point.standardScore })),
    weakItems: weakDetail,
    /** 영역별 성취 — 각 영역에 대해 한 단락씩 써야 한다 */
    areas: report.areas.map((a) => ({
      area: a.area,
      earned: a.earned,
      possible: a.possible,
      rate: a.rate,
      classAverageRate: a.cohortRate,
    })),
    /** 세부 유형별 성취 — 영역 서술을 구체적으로 만들 근거 */
    contents: (report.contents ?? []).map((c) => ({
      content: c.area,
      earned: c.earned,
      possible: c.possible,
      rate: c.rate,
      classAverageRate: c.cohortRate,
    })),
    /** 성적표에 칩으로도 노출되는 긍정 키워드 — 문장에 자연스럽게 녹일 것 */
    displayKeywords: keywords.display,
    /** 노출되지 않는 참고 키워드(보완점 포함 가능) — 표현을 다듬어 반영하되 그대로 나열하지 말 것 */
    weaveKeywords: keywords.weave,
  };

  const response = await client.responses.parse({
    model,
    input: [
      {
        role: "system",
        content: `당신은 영어학원 담임 선생님을 돕는 보조 작가입니다. 학생 개인 성적표에 실릴 담임 의견 초안을 작성합니다. 읽는 사람은 학부모입니다.

${COMMON_RULES}
- overall(종합 평가)은 6~9문장으로 작성합니다: 이번 시험에서의 성취(점수·석차·표준점수 흐름) → 수업에서 관찰된 강점(displayKeywords 반영) → 이번 시험에서 드러난 보완점(weakItems·weaveKeywords를 다듬어 반영) → 다음 달 학습 방향과 격려.
- areas는 입력으로 받은 areas의 **모든 영역**에 대해 하나씩, 순서를 유지해 작성합니다. area 값은 받은 그대로 돌려줍니다.
- 각 영역 서술은 3~5문장입니다. "N문항 중 M문항을 맞혔습니다"처럼 그 영역의 득점 사실로 시작한 뒤, contents(세부 유형별 성취)를 근거로 무엇을 잘했고 무엇이 아쉬운지 구체적으로 씁니다.
- 성취율이 반 평균보다 낮은 영역은 감추지 말고 무엇을 보완할지 분명히 적되, 학부모가 읽기에 건설적인 표현을 씁니다.
- 등급(매우 우수·우수 등)은 시스템이 따로 표기하므로 서술 안에서 등급을 선언하지 않습니다.
- displayKeywords는 학생의 강점이므로 긍정적 맥락에서 자연스럽게 문장에 녹입니다.
- weaveKeywords는 성적표에 노출되지 않는 참고 사항입니다. 단어를 그대로 옮기지 말고, 학부모가 듣기에 건설적인 표현으로 다듬어 반영합니다.
- growth에 이전 회차가 있으면 표준점수 흐름(상승·유지·하락)을 언급합니다. 첫 응시면 언급하지 않습니다.
- 학생 이름은 "OO 학생" 대신 실제 이름으로 자연스럽게 부릅니다.`,
      },
      {
        role: "user",
        content: `아래 학생 데이터를 바탕으로 담임 의견 초안을 작성하세요.\n${JSON.stringify(payload)}`,
      },
    ],
    text: { format: zodTextFormat(StudentDraftSchema, "student_comment_draft") },
  });

  const overall = response.output_parsed?.overall?.trim();
  if (!overall) throw new Error("AI 초안 생성에 실패했습니다. 다시 시도해 주세요.");
  return {
    overall,
    areas: (response.output_parsed?.areas ?? []).map((entry) => ({
      area: String(entry.area).trim(),
      text: String(entry.text).trim(),
    })),
  };
}
