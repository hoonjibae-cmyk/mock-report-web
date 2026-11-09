/**
 * 성적표에 싣는 담임 의견 — 열람 시점에 골라 넣는다.
 *
 * 총평(시험 공통)과 개별 의견(학생별)은 성적표를 만든 뒤에도 고쳐지므로 성적표
 * 본문(report_data)에 넣지 않고 열 때마다 읽는다. 학부모에게는 **확정(final)**한
 * 글만 보인다 — 초안은 선생님 화면에만 있다.
 *
 * 공개 성적표(/r/[token]), 반배치고사 출력, 시험 전체 A4 인쇄가 같은 규칙을 쓴다.
 */

import type { OverviewComment, TeacherComment } from "@/lib/omr-comments";

/** 열람 시점에 주입되는 담임 의견(성적표 생성 후에도 수정 가능) */
export interface ReportComments {
  /** 시험 공통 총평 */
  overview: string | null;
  /**
   * 의견 작성 방식. 'free'면 영역별 항목을 싣지 않는다 — 선생님이 자유 서술로
   * 쓰기로 한 시험이므로, 예전에 잠깐 채워 둔 영역별 글이 있어도 내보내지 않는다.
   */
  style?: "free" | "structured";
  /** 영역별 출제 안내 — 응시생 전원에게 똑같이 실린다 */
  areaNotes?: Array<{ area: string; text: string }>;
  /** 학생별 개별 의견(종합 평가) */
  personal: string | null;
  /** 영역별 평가 — 등급 + 서술 */
  areaFeedback?: Array<{ area: string; rating: string; text: string }>;
  /** 성적표에 칩으로 노출되는 긍정 키워드 */
  keywords: string[];
}

/** 확정된 글만 골라 성적표에 실을 꼴로 만든다 */
export function publishedComments(
  overview: OverviewComment | null | undefined,
  personal: TeacherComment,
): ReportComments {
  const overviewFinal = overview?.status === "final";
  const personalFinal = personal.status === "final";
  return {
    overview: overviewFinal ? overview.final : null,
    style: overview?.style ?? "free",
    areaNotes: overviewFinal ? overview.areaNotes : [],
    personal: personalFinal ? personal.personalFinal : null,
    areaFeedback: personalFinal ? personal.areaFeedback : [],
    keywords: personalFinal ? personal.displayKeywords : [],
  };
}

/** 성적표가 실제로 그릴 의견 — 작성 방식(free)에 따라 영역별 항목을 거른 뒤의 모습 */
export function visibleComments(comments: ReportComments | undefined, fallbackPersonal: string | null) {
  const structured = comments?.style !== "free";
  const overview = (comments?.overview ?? "").trim() || null;
  const personal = (comments?.personal ?? fallbackPersonal ?? "").trim() || null;
  const areaNotes = structured ? (comments?.areaNotes ?? []).filter((entry) => entry.text.trim()) : [];
  const areaFeedback = structured
    ? (comments?.areaFeedback ?? []).filter((entry) => entry.text.trim() || entry.rating)
    : [];
  const keywords = personal ? (comments?.keywords ?? []) : [];
  return { overview, personal, areaNotes, areaFeedback, keywords, any: Boolean(overview || personal) };
}

/** 등급 이름을 CSS 클래스로 — 한글 클래스명 대신 안정적인 영문 키를 쓴다 */
export function ratingClass(rating: string): string {
  if (rating === "매우 우수") return "best";
  if (rating === "우수") return "good";
  if (rating === "보통") return "fair";
  return "work";
}
