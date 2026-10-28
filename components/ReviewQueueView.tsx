import Link from "next/link";
import AdminTopNav, { type NavUser } from "@/components/AdminTopNav";
import type { OmrExam } from "@/lib/omr-types";
import { formatWhen } from "@/lib/review";
import { REVIEW_STATUS_LABELS, waitingText, type ReviewQueue } from "@/lib/review-queue";

interface Props {
  user: NavUser;
  queue: ReviewQueue;
  /** 컨펌할 수 있는 사람인가 — 총괄이거나 '월말평가 검토 컨펌'이 켜진 계정 */
  canApprove: boolean;
  setupError: string;
}

function ExamRows({
  exams,
  kind,
  canApprove,
}: {
  exams: OmrExam[];
  kind: "requested" | "approved" | "pending";
  canApprove: boolean;
}) {
  return (
    <div className="table-scroll">
      <table className="admin-table queue-table">
        <thead>
          <tr>
            <th>시험</th>
            <th>반</th>
            <th>만든 사람</th>
            <th>{kind === "requested" ? "검토 요청" : kind === "approved" ? "컨펌" : "만든 날짜"}</th>
            <th>작업</th>
          </tr>
        </thead>
        <tbody>
          {exams.map((exam) => (
            <tr key={exam.id}>
              <td>
                <Link href={`/admin/omr/${exam.id}/review`} className="row-title">
                  {exam.title}
                </Link>
                {exam.examDate ? <span>{exam.examDate}</span> : null}
              </td>
              <td>{exam.classNames.length > 0 ? exam.classNames.join(", ") : "—"}</td>
              <td>{exam.createdByName?.trim() || "—"}</td>
              <td>
                {kind === "requested" ? (
                  <>
                    <strong className="queue-wait">{waitingText(exam.review.requestedAt)}</strong>
                    <span>
                      {exam.review.requestedByName ?? "—"} · {formatWhen(exam.review.requestedAt)}
                    </span>
                  </>
                ) : kind === "approved" ? (
                  <>
                    {exam.review.approvedByName ?? "—"}
                    <span>{formatWhen(exam.review.approvedAt)}</span>
                  </>
                ) : (
                  exam.createdAt.slice(0, 10)
                )}
              </td>
              <td>
                <div className="link-actions">
                  <Link
                    className={`button tiny ${kind === "requested" && canApprove ? "primary" : "secondary"}`}
                    href={`/admin/omr/${exam.id}/review`}
                  >
                    {kind === "requested" && canApprove ? "검토하기" : "검토 화면"}
                  </Link>
                  {kind === "approved" ? (
                    <Link className="button tiny secondary" href={`/admin/omr/${exam.id}/send`}>
                      발송
                    </Link>
                  ) : null}
                  {kind === "pending" && exam.useTeacherComment ? (
                    <Link className="button tiny secondary" href={`/admin/omr/${exam.id}/comments`}>
                      담임 의견
                    </Link>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * 운영진 검토 대기열 — 훅이 없는 그리기 전용. 기다리는 건이 맨 위에 오고,
 * 컨펌된 건과 아직 요청 전인 월말평가가 그 아래에 접혀 있다.
 */
export default function ReviewQueueView({ user, queue, canApprove, setupError }: Props) {
  return (
    <div className="admin-shell">
      <AdminTopNav user={user} />

      <section className="panel">
        <div className="section-heading wrap">
          <div>
            <p className="eyebrow">ADMIN REVIEW</p>
            <h2>운영진 검토</h2>
            <p className="subtle">
              담임 의견까지 쓴 월말평가는 운영진이 한 번 보고 컨펌해야 알림톡이 나갑니다. 슬랙 알림의 링크와
              같은 화면으로 여기서 바로 들어갑니다.
              {canApprove ? " 컨펌은 검토 화면에서 합니다." : " 컨펌은 총괄 또는 검토 권한이 있는 계정이 합니다."}
            </p>
          </div>
          <div className="review-counts">
            <span className={queue.requested.length > 0 ? "need" : ""}>
              {REVIEW_STATUS_LABELS.requested} <strong>{queue.requested.length}</strong>건
            </span>
            <span className="ok">
              {REVIEW_STATUS_LABELS.approved} <strong>{queue.approved.length}</strong>건
            </span>
            <span>
              {REVIEW_STATUS_LABELS.none} <strong>{queue.pending.length}</strong>건
            </span>
          </div>
        </div>

        {setupError ? <p className="form-error block">{setupError}</p> : null}

        <h3 className="queue-heading">
          {REVIEW_STATUS_LABELS.requested} <span className="subtle">오래 기다린 순</span>
        </h3>
        {queue.requested.length === 0 ? (
          <p className="subtle">검토를 기다리는 월말평가가 없습니다.</p>
        ) : (
          <ExamRows exams={queue.requested} kind="requested" canApprove={canApprove} />
        )}
      </section>

      <details className="panel queue-fold" open={queue.requested.length === 0 && queue.approved.length > 0}>
        <summary>
          <strong>{REVIEW_STATUS_LABELS.approved}</strong> <span className="subtle">{queue.approved.length}건 · 최근 컨펌이 위</span>
        </summary>
        {queue.approved.length === 0 ? (
          <p className="subtle">아직 컨펌된 월말평가가 없습니다.</p>
        ) : (
          <ExamRows exams={queue.approved} kind="approved" canApprove={canApprove} />
        )}
      </details>

      <details className="panel queue-fold">
        <summary>
          <strong>{REVIEW_STATUS_LABELS.none}</strong>{" "}
          <span className="subtle">{queue.pending.length}건 · 담임 의견을 저장한 뒤 담임이 검토를 요청합니다</span>
        </summary>
        {queue.pending.length === 0 ? (
          <p className="subtle">요청 전인 월말평가가 없습니다.</p>
        ) : (
          <ExamRows exams={queue.pending} kind="pending" canApprove={canApprove} />
        )}
      </details>
    </div>
  );
}
