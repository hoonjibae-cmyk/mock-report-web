import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { StudentReportData, SubjectReport } from "@/lib/types";
import { buildRuleReview } from "@/lib/analysis";
import { chunk } from "@/lib/utils";
import { DEFAULT_AI_MODEL, resolveAiModel, type AiModelId } from "@/lib/ai-models";
import {
  sanitizeNationalReviewList,
  sanitizeNationalReviewText,
  stripHanja,
} from "@/lib/review-sanitizer";
import {
  aggregateFriendlyStats,
  buildSummerRoadmapHint,
  parentFriendlyWrongItem,
} from "@/lib/learning-roadmap";

const ReviewSchema = z.object({
  id: z.string(),
  headline: z.string(),
  overview: z.string(),
  strengths: z.array(z.string()).min(1).max(3),
  priorities: z.array(z.string()).min(1).max(3),
  actionPlan: z.array(z.string()).min(2).max(3),
  parentNote: z.string(),
});

const BatchSchema = z.object({ reviews: z.array(ReviewSchema) });

function sanitizeParentText(value: string): string {
  // 한자부터 걷어낸다 — 학부모가 읽는 글은 한글로만 나간다.
  return stripHanja(value)
    .replace(/(?:닮음\s*[·,ㆍ/]?\s*내심|내심\s*[·,ㆍ/]?\s*닮음)/g, "삼각형·도형의 성질과 공간 추론")
    .replace(/내심|외심/g, "삼각형·도형의 성질")
    .replace(/닮음/g, "도형 사이의 관계")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function summerRoadmapForReport(report: StudentReportData): string[] {
  return Object.values(report.subjects)
    .filter(Boolean)
    .map((subject) => buildSummerRoadmapHint(subject as SubjectReport))
    .slice(0, 3);
}

function compactSubject(subject: SubjectReport) {
  const wrongHigh = subject.items
    .filter((item) => item.isCorrect === false && ["응용", "고난도"].includes(item.difficulty))
    .slice(0, 8)
    .map((item) => parentFriendlyWrongItem(subject.key, item));

  const broadStats = aggregateFriendlyStats(subject.key, subject.contentStats);
  const strongest = [...broadStats].sort((a, b) => b.rate - a.rate || b.possible - a.possible).slice(0, 3);
  const weakest = [...broadStats].sort((a, b) => a.rate - b.rate || b.possible - a.possible).slice(0, 3);

  return {
    subject: subject.name,
    score: subject.score,
    grade: subject.grade,
    nationalTopEstimate: subject.nationalTopPercent,
    strongest,
    weakest,
    behavior: subject.behaviorStats,
    difficulty: subject.difficultyStats,
    gradeLevel: subject.gradeLevelStats,
    wrongHigh,
    summerRoadmapHint: buildSummerRoadmapHint(subject),
  };
}

export async function addAiReviews(
  reports: StudentReportData[],
  requestedModel: AiModelId = DEFAULT_AI_MODEL,
): Promise<StudentReportData[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return reports.map((report) => ({ ...report, aiReview: buildRuleReview(report) }));

  const client = new OpenAI({ apiKey });
  const model = resolveAiModel(requestedModel);
  const indexed = reports.map((report, index) => ({ id: `student-${index + 1}`, report, index }));

  for (const group of chunk(indexed, 10)) {
    const payload = group.map(({ id, report }) => ({
      id,
      studentSubjectAverage: report.overall.averageScore,
      subjects: Object.values(report.subjects).filter(Boolean).map((subject) => compactSubject(subject as SubjectReport)),
    }));

    try {
      const response = await client.responses.parse({
        model,
        input: [
          {
            role: "system",
            content:
              `당신은 중3 학생의 고1 전국연합학력평가 진단 결과를 학부모에게 설명하는 한국의 학습 컨설턴트입니다. 제공된 수치만 근거로 판단하고 점수만으로 학생의 능력을 단정하지 마세요. 전국 상위 비율은 추정치임을 전제로 하세요. 개인정보는 제공되지 않습니다.

반드시 지킬 작성 원칙:
1. 학부모가 쉽게 이해할 수 있는 표현을 사용하세요. '닮음', '내심', '외심' 같은 세부 교과 용어를 단독으로 나열하지 말고, '삼각형·도형의 성질과 공간 추론'처럼 더 넓고 쉬운 영역으로 설명하세요. 전문 용어가 꼭 필요하면 쉬운 설명을 함께 붙이세요.
2. actionPlan은 '매일 몇 문제', '유사 유형 3~5문항' 같은 단기 숙제가 아니라 이번 여름방학과 고1 진입 전까지의 학습 순서를 제시하는 장기 로드맵으로 작성하세요. 2~3개의 항목으로, 기초 점검→취약 영역 보완→고등 과정 연결의 흐름이 드러나야 합니다.
3. 중3 필수 개념이 부족한 경우 과도한 선행을 권하지 마세요. 여름방학에 중3 핵심 개념을 정확히 복습한 뒤 고등 과정으로 이동하도록 안내하세요.
4. 영어 기본기가 부족한 경우 문제풀이 양보다 중등 필수 및 중3~고1 어휘, 문장 구조 파악, 정확한 해석 연습을 우선하도록 안내하세요.
5. 국어는 단순 문제 수보다 지문 구조, 문단 핵심, 선택지 근거 확인을 중심으로 안내하세요.
6. 입력 데이터의 summerRoadmapHint를 우선 참고하되 문장을 자연스럽게 다듬으세요. 확인되지 않은 학습 습관이나 어휘 부족을 사실처럼 단정하지 마세요.
7. strengths와 priorities에도 세부 전문 용어 대신 학부모용 광역 영역명을 사용하세요. 문장은 따뜻하되 구체적으로 작성하세요.
8. 이 진단의 핵심 목적은 전국 기준에서 학생의 위치를 확인하는 것입니다. 학원 내부 순위, 학원 평균, 같은 업로드 학생 수, '몇 명 중 1위', '학생 중 가장 높다' 같은 내부 비교는 어떤 문장에도 절대 언급하지 마세요. 입력 데이터에 내부 비교 정보가 있더라도 무시하세요.
9. headline과 overview는 과목별 전국 상위 추정 비율과 등급, 전국 시험 문항에서 드러난 강점·보완점 중심으로 작성하세요.`,
          },
          {
            role: "user",
            content: `아래 학생별 익명 진단 데이터를 분석해 각 학생의 학부모용 총평을 작성하세요. 학생별 id를 그대로 반환하세요.\n${JSON.stringify(payload)}`,
          },
        ],
        text: { format: zodTextFormat(BatchSchema, "mock_exam_reviews") },
      });

      const parsed = response.output_parsed;
      if (!parsed) continue;
      for (const review of parsed.reviews) {
        const target = group.find((entry) => entry.id === review.id);
        if (!target) continue;
        reports[target.index] = {
          ...reports[target.index],
          aiReview: {
            ...review,
            headline: sanitizeNationalReviewText(sanitizeParentText(review.headline)),
            overview: sanitizeNationalReviewText(sanitizeParentText(review.overview)),
            strengths: sanitizeNationalReviewList(review.strengths.map(sanitizeParentText)),
            priorities: sanitizeNationalReviewList(review.priorities.map(sanitizeParentText)),
            actionPlan: summerRoadmapForReport(reports[target.index]),
            parentNote: sanitizeNationalReviewText(sanitizeParentText(review.parentNote)),
            source: "ai",
            model,
            generatedAt: new Date().toISOString(),
          },
        };
      }
    } catch (error) {
      console.error("AI 총평 생성 실패, 규칙 기반 총평으로 대체:", error);
      for (const entry of group) {
        reports[entry.index] = { ...reports[entry.index], aiReview: buildRuleReview(reports[entry.index]) };
      }
    }
  }

  return reports;
}
