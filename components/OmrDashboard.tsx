"use client";

import { useState } from "react";
import Link from "next/link";
import AdminTopNav, { type NavUser } from "@/components/AdminTopNav";
import { EXAM_TYPE_LABELS, type OmrExam } from "@/lib/omr-types";

interface Props {
  initialExams: OmrExam[];
  setupError: string;
  canCreate: boolean;
  canDelete: boolean;
  currentUser: NavUser;
}

export default function OmrDashboard({ initialExams, setupError, canCreate, canDelete, currentUser }: Props) {
  const [exams, setExams] = useState<OmrExam[]>(initialExams);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(setupError);

  async function remove(id: string, title: string) {
    if (!window.confirm(`'${title}' 시험을 삭제할까요?`)) return;
    setBusy(id);
    setError("");
    try {
      const res = await fetch(`/api/admin/omr/exams/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "삭제하지 못했습니다.");
      setExams((prev) => prev.filter((exam) => exam.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제 중 오류가 발생했습니다.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="admin-shell">
      <AdminTopNav user={currentUser} />

      {error ? <p className="form-error block">{error}</p> : null}

      <div className="panel">
        <div className="section-heading wrap">
          <div>
            <p className="eyebrow">OMR EXAMS</p>
            <h2>시험 목록</h2>
            <p className="subtle">
              답안지 출력 → 정답 입력 → 스캔 판독 → 검수 → 성적표 순서로 진행합니다.
            </p>
          </div>
          {canCreate ? (
            <Link className="button primary" href="/admin/omr/new">+ 새 시험</Link>
          ) : null}
        </div>

        {exams.length === 0 ? (
          <p className="subtle">아직 만든 시험이 없습니다. “새 시험”으로 시작하세요.</p>
        ) : (
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>유형</th>
                  <th>제목</th>
                  <th>구성</th>
                  <th>만든 날짜</th>
                  <th>작업</th>
                </tr>
              </thead>
              <tbody>
                {exams.map((exam) => (
                  <tr key={exam.id}>
                    <td>
                      <span className="status-chip active">{EXAM_TYPE_LABELS[exam.examType]}</span>
                    </td>
                    <td>
                      <strong>{exam.title}</strong>
                      {exam.examDate ? <span>{exam.examDate}</span> : null}
                    </td>
                    <td>
                      {exam.numQuestions}문항 · {exam.numChoices}지 ·{" "}
                      {exam.omrStyle === "exam" ? "수능형" : "기본형"}
                      <span>
                        {(() => {
                          const filled = Object.keys(exam.answerKey ?? {}).length;
                          return filled >= exam.numQuestions
                            ? `정답 완료`
                            : filled > 0
                              ? `정답 ${filled}/${exam.numQuestions}`
                              : "정답 미입력";
                        })()}
                      </span>
                    </td>
                    <td>{exam.createdAt ? exam.createdAt.slice(0, 10) : ""}</td>
                    <td>
                      <div className="link-actions">
                        <a
                          className="button tiny primary"
                          href={`/api/admin/omr/exams/${exam.id}/sheet`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          답안지 PDF
                        </a>
                        <Link className="button tiny secondary" href={`/admin/omr/${exam.id}/key`}>
                          정답 입력
                        </Link>
                        <Link className="button tiny secondary" href={`/admin/omr/${exam.id}/scans`}>
                          스캔 · 검수
                        </Link>
                        <Link className="button tiny secondary" href={`/admin/omr/${exam.id}/reports`}>
                          성적표
                        </Link>
                        {canDelete ? (
                          <button
                            className="button tiny danger"
                            disabled={busy === exam.id}
                            onClick={() => remove(exam.id, exam.title)}
                          >
                            삭제
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
