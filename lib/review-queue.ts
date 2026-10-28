// 운영진 검토 대기열 — 슬랙 링크 없이도 프로그램 안에서 검토 올라온 시험을 찾는다.
//
// 검토가 필요한 유형(월말평가)만 모아 상태별로 나눈다.
//   requested  검토 기다리는 중 — 오래 기다린 것이 위
//   approved   컨펌됨 — 최근 컨펌이 위
//   pending    검토 요청 전 — 최근 만든 것이 위
//
// 계산만 한다. 어디에 그리는지는 ReviewQueueView(목록)·AdminHome(홈의 대기 건)이 안다.

import type { OmrExam } from "@/lib/omr-types";
import { reviewRequired, type ReviewStatus } from "@/lib/review";

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  none: "검토 요청 전",
  requested: "검토 기다리는 중",
  approved: "컨펌됨",
};

export interface ReviewQueue {
  requested: OmrExam[];
  approved: OmrExam[];
  pending: OmrExam[];
}

function when(value: string | null | undefined): string {
  return value ?? "";
}

export function reviewQueue(exams: readonly OmrExam[]): ReviewQueue {
  const requested: OmrExam[] = [];
  const approved: OmrExam[] = [];
  const pending: OmrExam[] = [];
  for (const exam of exams) {
    if (!reviewRequired(exam.examType)) continue;
    if (exam.review.status === "requested") requested.push(exam);
    else if (exam.review.status === "approved") approved.push(exam);
    else pending.push(exam);
  }
  requested.sort((a, b) => when(a.review.requestedAt).localeCompare(when(b.review.requestedAt)));
  approved.sort((a, b) => when(b.review.approvedAt).localeCompare(when(a.review.approvedAt)));
  pending.sort((a, b) => when(b.createdAt).localeCompare(when(a.createdAt)));
  return { requested, approved, pending };
}

/** 요청한 지 얼마나 됐는지 — "오늘 요청" · "3일째 기다리는 중" */
export function waitingText(requestedAt: string | null | undefined, now: Date = new Date()): string {
  if (!requestedAt) return "";
  const at = new Date(requestedAt);
  if (Number.isNaN(at.getTime())) return "";
  const days = Math.floor((now.getTime() - at.getTime()) / 86_400_000);
  if (days <= 0) return "오늘 요청";
  if (days === 1) return "어제 요청";
  return `${days}일째 기다리는 중`;
}
