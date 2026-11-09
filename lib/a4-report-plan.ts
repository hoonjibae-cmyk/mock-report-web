/**
 * OMR 성적표의 A4 쪽 계획 — 어떤 덩어리를 어느 쪽에 실을지.
 *
 * 성적표 한 장은 머리글·점수·위치·영역·문항·추이·복습·의견 덩어리로 이뤄진다.
 * 덩어리마다 높이를 mm로 어림한 뒤 `packA4Pages`로 순서대로 쪽에 담는다. 첫 쪽에는
 * 머리글부터 문항별 결과까지 — 학부모가 가장 먼저 찾는 것 — 가 들어가고, 성적 추이는
 * 자리가 남을 때 첫 쪽에, 아니면 둘째 쪽 첫머리에 온다. 의견 글은 길이가 천차만별이라
 * 글자 수로 줄 수를 어림한다.
 *
 * 그림을 그리는 것은 components/A4GenericReport 이고, 여기는 숫자만 다룬다(시험 가능).
 */

import { A4_BODY_MM, estimateLines, packA4Pages, type A4Block } from "@/lib/a4-layout";
import type { GenericReportData } from "@/lib/omr-report-types";
import { visibleComments, type ReportComments } from "@/lib/report-comments";
import { gradeRangeSentence } from "@/lib/school-grade";

/** 문항 격자의 열 수 — 45문항이면 세 줄 */
export const A4_ITEM_COLUMNS = 15;
/** 바닥 안내문 자리(mm) — 마지막 쪽 아래에 늘 들어가므로 모든 쪽에서 미리 비워 둔다 */
export const A4_FOOTNOTE_MM = 9;
/** 우선 복습 문항 표의 최대 행 수(웹 성적표와 같다) */
export const A4_REVIEW_ROWS = 8;

/** 본문 글(8pt) 한 줄에 들어가는 전각 글자 수 — 카드 안쪽 너비 약 178mm 기준 */
const UNITS_PER_LINE = 58;
/** 본문 글 한 줄의 높이(mm) */
const LINE_MM = 4.6;
/** 카드 위아래 안쪽 여백·테두리(mm) */
const CARD_MM = 7;
/** 카드 제목 줄(mm) */
const HEAD_MM = 7;
/** 표 머리 줄(mm) */
const TABLE_HEAD_MM = 6;
/** 표 한 행(mm) */
const TABLE_ROW_MM = 6.9;
/** 우선 복습 표 한 행(mm) — 정답률 막대와 난이도 칩이 있어 조금 높다 */
const REVIEW_ROW_MM = 7.6;

/**
 * 덩어리 열쇠. 'position' 은 성적 추이가 있으면 '응시 집단 내 위치'와 '성적 추이'를 반씩 나눠
 * 한 줄에 놓은 것이다 — 따로 두면 첫 쪽에 추이 그래프가 들어가지 않아 아래가 비고 둘째 쪽
 * 첫머리에 그래프만 덩그러니 남는다.
 */
export type A4BlockKey =
  | "header"
  | "kpis"
  | "position"
  | "national"
  | "areas"
  | "items"
  | "review"
  | "contents"
  | "classification"
  | "comment-overview"
  | "comment-notes"
  | "comment-personal"
  | "comment-feedback";

export interface A4ReportBlock extends A4Block {
  key: A4BlockKey;
}

export interface A4ReportPlan {
  blocks: A4ReportBlock[];
  /** 쪽마다 실을 덩어리 열쇠, 순서대로 */
  pages: A4BlockKey[][];
}

function lines(text: string | null | undefined): number {
  return estimateLines(text, UNITS_PER_LINE);
}

function tableHeight(rows: number, noteLines: number, rowMm: number = TABLE_ROW_MM): number {
  return CARD_MM + HEAD_MM + TABLE_HEAD_MM + rows * rowMm + noteLines * 4;
}

/** 성적 추이가 있어 위치 카드와 나란히 놓는가(각각 반 너비) */
export function growthBeside(report: Pick<GenericReportData, "growth">): boolean {
  return report.growth.length >= 2;
}

/** 틀린 문항(듣기 미응시는 오답이 아니다) — 우선 복습 표의 재료 */
export function wrongItemsOf(report: Pick<GenericReportData, "items">) {
  return report.items.filter((item) => !item.correct && !item.absent);
}

/** 성적표의 덩어리와 어림 높이를 순서대로 */
export function a4ReportBlocks(report: GenericReportData, comments?: ReportComments): A4ReportBlock[] {
  const blocks: A4ReportBlock[] = [];
  const push = (key: A4BlockKey, height: number) => blocks.push({ key, height: Math.round(height * 10) / 10 });

  push("header", 40);
  push("kpis", 21);

  // 응시 집단 내 위치 — 분포 막대(위아래 이름표 포함)와 문항 수 한 줄, 안내문이 있으면 더.
  // 성적 추이와 나란히 반 너비로 놓이면 글줄이 두 줄로 접혀 더 높아진다.
  const narrow = growthBeside(report);
  let position = CARD_MM + HEAD_MM + 24 + (narrow ? 9 : 4.5);
  if (report.examType === "saturday" && gradeRangeSentence(report.cohortGrades)) position += narrow ? 9.5 : 6;
  if (report.cohortNote) position += narrow ? 8 : 4.5;
  if (report.listeningAbsent) position += narrow ? 13 : 9;
  // 성적 추이 카드(반 너비) — 제목 + 그래프(가로 320 : 세로 150 비율) + 추이 문장 두 줄
  const growth = narrow ? CARD_MM + HEAD_MM + 38 + 8 : 0;
  push("position", Math.max(position, growth));

  if (report.national) push("national", CARD_MM + HEAD_MM + 14 + 8);

  if (report.areas.length > 0) push("areas", tableHeight(report.areas.length, 2));

  const itemRows = Math.ceil(report.items.length / A4_ITEM_COLUMNS);
  push("items", CARD_MM + HEAD_MM + itemRows * 10.2 + 7.5);

  const wrong = wrongItemsOf(report).length;
  if (wrong > 0) push("review", tableHeight(Math.min(A4_REVIEW_ROWS, wrong), 1, REVIEW_ROW_MM));

  if (report.contents && report.contents.length > 0) push("contents", tableHeight(report.contents.length, 2));

  if (report.classificationStats && report.classificationStats.length > 0) {
    const groups = report.classificationStats.reduce((sum, group) => sum + 5.5 + group.rows.length * 5.2, 0);
    push("classification", CARD_MM + HEAD_MM + groups + 8);
  }

  // 선생님 의견 — 첫 덩어리에만 '담임 · 선생님 의견' 머리띠가 붙는다
  const visible = visibleComments(comments, report.teacherComment?.text ?? null);
  let first = true;
  const band = () => {
    const height = first ? 8 : 0;
    first = false;
    return height;
  };
  if (visible.overview) push("comment-overview", CARD_MM + band() + 5 + lines(visible.overview) * LINE_MM);
  if (visible.areaNotes.length > 0) {
    const entries = visible.areaNotes.reduce((sum, entry) => sum + 7 + lines(entry.text) * LINE_MM, 0);
    push("comment-notes", CARD_MM + band() + 5 + entries);
  }
  if (visible.personal) {
    const chips = visible.keywords.length > 0 ? 6 : 0;
    push("comment-personal", CARD_MM + band() + 5 + chips + lines(visible.personal) * LINE_MM);
  }
  if (visible.areaFeedback.length > 0) {
    const entries = visible.areaFeedback.reduce((sum, entry) => sum + 8 + lines(entry.text) * LINE_MM, 0);
    push("comment-feedback", CARD_MM + band() + 5 + entries);
  }

  return blocks;
}

/** 덩어리를 쪽에 나눠 담은 계획 */
export function planA4Report(report: GenericReportData, comments?: ReportComments): A4ReportPlan {
  const blocks = a4ReportBlocks(report, comments);
  const pages = packA4Pages(blocks, A4_BODY_MM - A4_FOOTNOTE_MM).map((page) => page.map((block) => block.key));
  return { blocks, pages };
}
