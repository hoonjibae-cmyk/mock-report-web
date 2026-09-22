"use client";

import { useState } from "react";
import Link from "next/link";
import AcademyLogo from "@/components/AcademyLogo";
import { formatWhen, type ExamReview } from "@/lib/review";
import { EXAM_TYPE_LABELS, type OmrExam } from "@/lib/omr-types";
import type { ReviewStudentRow } from "@/lib/reports";

interface Props {
  exam: OmrExam;
  students: ReviewStudentRow[];
  overview: { status: "draft" | "final"; text: string | null };
  /** 컨펌은 총괄만 */
  canApprove: boolean;
}

const when = formatWhen;

/**
 * 운영진 검토 화면 — 이 시험의 성적표를 학생별로 훑고 컨펌한다.
 *
 * 성적표 본문은 여기 다시 그리지 않는다. 학부모가 받을 그대로를 봐야 하므로
 * 학생 이름을 누르면 실제 성적표가 열린다(직원은 PIN 없이 연다). 이 표는
 * '어디를 열어 볼지'와 '빠진 게 없는지'를 한눈에 보는 목차다.
 */
export default function ReviewPanel({ exam, students, overview, canApprove }: Props) {
  const [review, setReview] = useState<ExamReview>(exam.review);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notices, setNotices] = useState<string[]>([]);

  const draftCount = students.filter((s) => s.commentStatus !== "final").length;

  async function approve() {
    const ok = window.confirm(
      `‘${exam.title}’ 성적표 ${students.length}건을 컨펌합니다.\n` +
        `담임 선생님(${review.requestedByName ?? "요청자"})께 슬랙으로 알리고, 알림톡 발송이 열립니다.\n\n진행할까요?`,
    );
    if (!ok) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/omr/exams/${exam.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "컨펌하지 못했습니다.");
      setReview(data.review);
      setNotices(data.notices ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "컨펌하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div className="brand-lockup">
          <AcademyLogo size="large" href="/admin" />
          <div>
            <strong>운영진 검토</strong>
            <span>
              {EXAM_TYPE_LABELS[exam.examType]} · {exam.title}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="button ghost" href="/admin/omr">← 시험 목록</Link>
          <Link className="button secondary" href={`/admin/omr/${exam.id}/comments`}>담임 의견 화면</Link>
        </div>
      </header>

      {error ? <p className="form-error block">{error}</p> : null}
      {notices.map((n) => (
        <p key={n} className="form-error block">{n}</p>
      ))}

      <section className="panel">
        <div className="section-heading wrap">
          <div>
            <p className="eyebrow">검토 상태</p>
            <h2>
              {review.status === "approved"
                ? "컨펌됨"
                : review.status === "requested"
                  ? "검토 기다리는 중"
                  : "아직 요청되지 않음"}
            </h2>
            <p className="subtle">
              {review.requestedByName
                ? `요청: ${review.requestedByName} · ${when(review.requestedAt)}`
                : "담임 선생님이 알림톡 발송 화면에서 ‘운영진 검토 요청’을 누르면 여기 표시됩니다."}
              {review.status === "approved"
                ? ` · 컨펌: ${review.approvedByName} · ${when(review.approvedAt)}`
                : ""}
            </p>
          </div>
          {canApprove && review.status === "requested" ? (
            <button className="button primary" disabled={busy} onClick={approve}>
              {busy ? "처리 중…" : "컨펌 — 알림톡 발송 열기"}
            </button>
          ) : null}
        </div>

        <div className="review-counts">
          <span>
            학생 <strong>{students.length}</strong>명
          </span>
          <span className={draftCount > 0 ? "need" : "ok"}>
            담임 의견 미확정 <strong>{draftCount}</strong>명
          </span>
          <span className={overview.status === "final" ? "ok" : "need"}>
            총평 <strong>{overview.status === "final" ? "확정" : "초안"}</strong>
          </span>
        </div>
        {draftCount > 0 || overview.status !== "final" ? (
          <p className="subtle" style={{ marginTop: 8 }}>
            미확정(초안) 상태의 의견은 성적표에 실리지 않습니다. 담임 선생님이 확정한 뒤 컨펌하는 것이
            맞는지 확인해 주세요.
          </p>
        ) : null}
      </section>

      {overview.text ? (
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">총평 ({overview.status === "final" ? "확정" : "초안"})</p>
            </div>
          </div>
          <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.8 }}>{overview.text}</p>
        </section>
      ) : null}

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">학생별 성적표</p>
            <h2>학생 이름을 누르면 학부모가 받을 성적표가 그대로 열립니다</h2>
          </div>
        </div>
        <div className="table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>학생</th>
                <th>학교 · 반</th>
                <th>점수</th>
                <th>담임 의견</th>
                <th>학부모 열람</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.reportId}>
                  <td>
                    <Link href={`/r/${s.token}`} target="_blank" rel="noreferrer">
                      <strong>{s.studentName}</strong>
                    </Link>
                  </td>
                  <td>
                    {s.school || "-"}
                    {s.className ? <span className="subtle"> · {s.className}</span> : null}
                  </td>
                  <td>
                    <strong>{s.raw}</strong> / {s.max}
                  </td>
                  <td>
                    <span className={`status-chip ${s.commentStatus === "final" ? "active" : s.commentStatus === "draft" ? "danger" : "inactive"}`}>
                      {s.commentStatus === "final" ? "확정" : s.commentStatus === "draft" ? "초안" : "없음"}
                    </span>
                    {s.commentPreview ? <span className="subtle"> {s.commentPreview}</span> : null}
                  </td>
                  <td>{s.viewCount > 0 ? `${s.viewCount}회` : "아직"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
