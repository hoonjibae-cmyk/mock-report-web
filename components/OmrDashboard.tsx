"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import AdminTopNav, { type NavUser } from "@/components/AdminTopNav";
import {
  EXAM_TYPE_LABELS,
  MOCK_SUBJECTS,
  mockSubjectOf,
  type ExamType,
  type OmrExam,
} from "@/lib/omr-types";

interface Props {
  initialExams: OmrExam[];
  setupError: string;
  /** 좌측 하위 메뉴에서 고른 시험 유형(없으면 전체) */
  activeType: ExamType | null;
  /** OMR_API_URL이 이 배포 환경에 설정되어 있는가 */
  omrServiceReady: boolean;
  canCreate: boolean;
  canDelete: boolean;
  currentUser: NavUser;
}

export default function OmrDashboard({
  initialExams,
  setupError,
  activeType,
  omrServiceReady,
  canCreate,
  canDelete,
  currentUser,
}: Props) {
  const [exams, setExams] = useState<OmrExam[]>(initialExams);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(setupError);
  // 국영수는 과목마다 답안지가 따로라, 유형 안에서 과목으로 한 번 더 걸러 본다
  const [subject, setSubject] = useState<string>("all");

  const isMock = activeType === "mock";
  const typeExams = useMemo(
    () => (activeType ? exams.filter((exam) => exam.examType === activeType) : exams),
    [exams, activeType],
  );
  const visible = useMemo(
    () =>
      isMock && subject !== "all"
        ? typeExams.filter((exam) => mockSubjectOf(exam.subject)?.value === subject)
        : typeExams,
    [typeExams, isMock, subject],
  );

  const heading = activeType ? EXAM_TYPE_LABELS[activeType] : "시험 목록";
  const newExamHref = activeType ? `/admin/omr/new?type=${activeType}` : "/admin/omr/new";

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

      {!omrServiceReady ? (
        <p className="form-error block">
          <strong>답안지 서비스가 연결되지 않았습니다.</strong> 이 배포 환경에{" "}
          <code>OMR_API_URL</code>이 없어서 답안지 PDF 출력과 스캔 판독이 동작하지 않습니다. Vercel →
          Settings → Environment Variables 에서 <code>OMR_API_URL</code>·<code>OMR_API_KEY</code>를
          Production · Preview · Development 세 곳 모두에 추가한 뒤 다시 배포해 주세요.
        </p>
      ) : null}

      {/* 국영수 모의고사는 전국 채점 엑셀로 성적표를 만드는 길도 함께 제공한다 */}
      {isMock ? (
        <div className="panel" style={{ marginBottom: 20 }}>
          <div className="section-heading wrap">
            <div>
              <p className="eyebrow">국영수 모의고사</p>
              <h2>진행 방법 두 가지</h2>
              <p className="subtle">
                학원에서 직접 보는 시험은 <strong>OMR</strong>로, 전국 모의고사 채점 결과를 받았다면{" "}
                <strong>엑셀</strong>로 올리면 전국 비교·AI 총평 성적표가 나옵니다.
              </p>
            </div>
            <div className="toolbar" style={{ flexWrap: "wrap" }}>
              {canCreate ? (
                <>
                  <Link className="button primary" href={newExamHref}>+ OMR 시험 만들기</Link>
                  <Link className="button secondary" href="/admin/mock">전국 엑셀 올리기</Link>
                </>
              ) : null}
            </div>
          </div>
          <p className="subtle" style={{ margin: 0 }}>
            OMR은 <strong>국어 · 영어 · 수학 과목마다 답안지를 따로</strong> 만듭니다(문항 수와
            교시가 다릅니다). 시험 만들기에서 과목을 고르면 기본값이 자동으로 잡힙니다.
          </p>
        </div>
      ) : null}

      <div className="panel">
        <div className="section-heading wrap">
          <div>
            <p className="eyebrow">OMR EXAMS</p>
            <h2>{heading}</h2>
            <p className="subtle">
              답안지 출력 → 정답 입력 → 스캔 판독 → 검수 → 성적표 순서로 진행합니다.
              {activeType ? ` · ${visible.length}개` : ""}
            </p>
          </div>
          {canCreate && !isMock ? (
            <Link className="button primary" href={newExamHref}>+ 새 시험</Link>
          ) : null}
        </div>

        {isMock ? (
          <div className="subject-chips">
            {[{ value: "all", label: "전체" }, ...MOCK_SUBJECTS].map((option) => (
              <button
                key={option.value}
                type="button"
                className={subject === option.value ? "active" : ""}
                onClick={() => setSubject(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}

        {visible.length === 0 ? (
          <p className="subtle">
            {activeType
              ? `아직 만든 ${EXAM_TYPE_LABELS[activeType]}가 없습니다. “새 시험”으로 시작하세요.`
              : "아직 만든 시험이 없습니다. “새 시험”으로 시작하세요."}
          </p>
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
                {visible.map((exam) => (
                  <tr key={exam.id}>
                    <td>
                      <span className="status-chip active">{EXAM_TYPE_LABELS[exam.examType]}</span>
                      {mockSubjectOf(exam.subject) ? (
                        <span>{mockSubjectOf(exam.subject)?.label}</span>
                      ) : null}
                    </td>
                    <td>
                      <strong>{exam.title}</strong>
                      {exam.examDate ? <span>{exam.examDate}</span> : null}
                      <span title={`시험 ID ${exam.id}`}>ID {exam.id.slice(0, 8)}</span>
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
                        {exam.useTeacherComment ? (
                          <Link className="button tiny secondary" href={`/admin/omr/${exam.id}/comments`}>
                            담임 의견
                          </Link>
                        ) : null}
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
