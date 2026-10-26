import { EXAM_TYPE_BADGES, EXAM_TYPE_LABELS, type ExamType } from "@/lib/omr-types";

interface Props {
  type: ExamType;
  /**
   * 배지 아래 작은 글씨. 비우면 유형의 기본 보조 설명(반배치고사 → 레벨테스트),
   * null이면 아무것도 붙이지 않는다(제목 옆에 한 줄로 놓을 때).
   */
  sub?: string | null;
}

/**
 * 시험 유형 배지 — 유형마다 색이 달라 목록에서 한눈에 갈린다.
 * 한 줄로만 놓이고(접히지 않음), 긴 정식 이름은 툴팁으로 남긴다.
 */
export default function ExamTypeBadge({ type, sub }: Props) {
  const badge = EXAM_TYPE_BADGES[type];
  const subText = sub === null ? null : (sub ?? badge.sub ?? null);
  return (
    <>
      <span className={`status-chip type-chip type-${type}`} title={EXAM_TYPE_LABELS[type]}>
        {badge.label}
      </span>
      {subText ? <span className="type-sub">{subText}</span> : null}
    </>
  );
}
