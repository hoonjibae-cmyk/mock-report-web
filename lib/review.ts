// 운영진 검토 — 월말평가 성적표는 담임이 의견을 쓴 뒤 운영진이 한 번 보고 나서야 나간다.
//
// 흐름: 담임 의견 저장 → [운영진 검토 요청] → 슬랙 운영진 채널에 알림 →
//       운영진이 성적표 전부를 훑고 [컨펌] → 담임에게 슬랙 DM → 알림톡 발송이 열린다.
//
// 왜 월말평가만인가 — 월말평가는 담임 코멘트가 실려 학부모에게 나가는 성적표다.
// 코멘트는 한 번 나가면 되돌릴 수 없고, 학원 이름으로 나가는 글이다. 토요모의고사·
// 인클래스처럼 점수만 나가는 성적표까지 매번 운영진 손을 거치게 하면 검토가
// 형식이 된다.

import type { ExamType } from "@/lib/omr-types";

export type ReviewStatus = "none" | "requested" | "approved";

export interface ExamReview {
  status: ReviewStatus;
  requestedBy: string | null;
  requestedByName: string | null;
  requestedAt: string | null;
  approvedBy: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
}

export const EMPTY_REVIEW: ExamReview = {
  status: "none",
  requestedBy: null,
  requestedByName: null,
  requestedAt: null,
  approvedBy: null,
  approvedByName: null,
  approvedAt: null,
};

/** 발송 전에 운영진 검토를 거쳐야 하는 유형 */
export const REVIEW_REQUIRED: Record<ExamType, boolean> = {
  mock: false,
  saturday: false,
  monthly: true,
  placement: false,
  inclass: false,
};

export function reviewRequired(type: ExamType): boolean {
  return REVIEW_REQUIRED[type] === true;
}

/** 이 시험의 알림톡을 지금 보낼 수 있는가 — 검토가 필요 없거나, 컨펌됐거나 */
export function sendAllowed(exam: { examType: ExamType; review: Pick<ExamReview, "status"> }): boolean {
  return !reviewRequired(exam.examType) || exam.review.status === "approved";
}

export interface Actor {
  username: string;
  displayName: string;
}

/**
 * 상태를 한 칸 옮긴다. 허용되지 않는 이동이면 이유를 돌려준다.
 *
 * - request: 언제든 할 수 있다. 컨펌된 뒤에 다시 요청하면 컨펌이 풀린다 —
 *   의견을 고쳤으면 다시 봐야 하고, 그 판단은 담임이 한다.
 * - approve: 요청이 있어야 한다. 요청 없이 컨펌하면 담임이 아직 쓰는 중인
 *   글을 확정하는 셈이다.
 */
export function transition(
  current: ExamReview,
  action: "request" | "approve",
  actor: Actor,
  now: string = new Date().toISOString(),
): { review: ExamReview } | { error: string } {
  if (action === "request") {
    return {
      review: {
        status: "requested",
        requestedBy: actor.username,
        requestedByName: actor.displayName,
        requestedAt: now,
        approvedBy: null,
        approvedByName: null,
        approvedAt: null,
      },
    };
  }
  if (current.status === "approved") return { error: "이미 컨펌된 시험입니다." };
  if (current.status !== "requested") {
    return { error: "아직 검토 요청이 없습니다. 담임 선생님이 '운영진 검토 요청'을 누른 뒤에 컨펌할 수 있습니다." };
  }
  return {
    review: {
      ...current,
      status: "approved",
      approvedBy: actor.username,
      approvedByName: actor.displayName,
      approvedAt: now,
    },
  };
}

/** 운영진 채널에 보내는 검토 요청 글 */
export function reviewRequestText(input: {
  examTitle: string;
  requesterName: string;
  studentCount: number;
  link: string;
}): string {
  return (
    `📝 *월말평가 성적표 검토 요청*\n` +
    `• 시험: ${input.examTitle}\n` +
    `• 요청: ${input.requesterName} 선생님 · 학생 ${input.studentCount}명\n` +
    `• 성적표를 확인하고 문제 없으면 *컨펌*을 눌러 주세요. 컨펌 전에는 알림톡이 나가지 않습니다.\n` +
    `${input.link}`
  );
}

/** 담임에게 보내는 컨펌 안내 DM */
export function reviewApprovedText(input: { examTitle: string; approverName: string; link: string }): string {
  return (
    `✅ *${input.examTitle}* 성적표가 컨펌되었습니다 (${input.approverName}).\n` +
    `이제 알림톡을 보내실 수 있습니다.\n` +
    `${input.link}`
  );
}

/**
 * 시각을 'YYYY-MM-DD HH:mm'(한국 시간)으로. 로케일 포맷터를 쓰지 않는다 —
 * 서버(Node)와 브라우저가 '오전/AM'을 다르게 찍어 화면이 다시 그려진다.
 */
export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const d = new Date(t + 9 * 60 * 60 * 1000);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
}
