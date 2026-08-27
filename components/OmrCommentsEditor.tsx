"use client";

import { useState } from "react";
import Link from "next/link";
import AcademyLogo from "@/components/AcademyLogo";
import { EXAM_TYPE_LABELS, type OmrExam } from "@/lib/omr-types";
import type { CommentStudentRow, OverviewComment, TeacherComment } from "@/lib/omr-comments";

type StudentRow = Omit<CommentStudentRow, "reportData">;

interface Props {
  exam: OmrExam | null;
  initialOverview: OverviewComment;
  initialStudents: StudentRow[];
  setupError: string;
  canEdit: boolean;
  aiEnabled: boolean;
}

/** 쉼표·Enter로 추가하는 키워드 칩 입력 */
function KeywordChips({
  label,
  hint,
  value,
  onChange,
  tone,
  disabled,
}: {
  label: string;
  hint: string;
  value: string[];
  onChange: (next: string[]) => void;
  tone: "positive" | "hidden";
  disabled: boolean;
}) {
  const [text, setText] = useState("");

  function commit() {
    const parts = text.split(",").map((part) => part.trim()).filter(Boolean);
    if (parts.length === 0) return;
    const next = [...value];
    for (const part of parts) if (!next.includes(part)) next.push(part);
    onChange(next.slice(0, 12));
    setText("");
  }

  return (
    <div style={{ flex: 1, minWidth: 240 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: "#667085" }}>{label}</span>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          padding: 8,
          border: "1px solid #d9e0ea",
          borderRadius: 10,
          marginTop: 4,
          background: "#fff",
        }}
      >
        {value.map((keyword) => (
          <span
            key={keyword}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "3px 10px",
              borderRadius: 99,
              fontSize: 12.5,
              fontWeight: 700,
              background: tone === "positive" ? "#e8f7f1" : "#f1f3f7",
              color: tone === "positive" ? "#13795b" : "#5a6472",
            }}
          >
            {keyword}
            {!disabled ? (
              <button
                type="button"
                onClick={() => onChange(value.filter((entry) => entry !== keyword))}
                style={{ border: 0, background: "none", cursor: "pointer", color: "inherit", padding: 0, lineHeight: 1 }}
              >
                ×
              </button>
            ) : null}
          </span>
        ))}
        <input
          value={text}
          disabled={disabled}
          placeholder={value.length === 0 ? hint : ""}
          style={{ flex: 1, minWidth: 120, border: 0, outline: "none", fontSize: 13, padding: "3px 2px" }}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit();
            }
          }}
          onBlur={commit}
        />
      </div>
    </div>
  );
}

export default function OmrCommentsEditor({
  exam,
  initialOverview,
  initialStudents,
  setupError,
  canEdit,
  aiEnabled,
}: Props) {
  const [overview, setOverview] = useState<OverviewComment>(initialOverview);
  const [overviewText, setOverviewText] = useState(initialOverview.final ?? initialOverview.aiDraft ?? "");
  const [overviewMemo, setOverviewMemo] = useState("");
  const [students, setStudents] = useState<StudentRow[]>(initialStudents);
  const [drafts, setDrafts] = useState<Record<string, TeacherComment>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(setupError);
  const [message, setMessage] = useState("");

  function commentFor(row: StudentRow): TeacherComment {
    return drafts[row.reportId] ?? row.comment;
  }

  function setComment(row: StudentRow, patch: Partial<TeacherComment>) {
    setDrafts((prev) => ({ ...prev, [row.reportId]: { ...commentFor(row), ...patch } }));
  }

  async function draftOverview() {
    setBusy("overview-draft");
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/admin/omr/exams/${exam?.id}/comments/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "overview", memo: overviewMemo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "초안을 만들지 못했습니다.");
      setOverviewText(data.draft);
      setOverview((prev) => ({ ...prev, aiDraft: data.draft }));
      setMessage("총평 초안이 생성되었습니다. 자유롭게 다듬은 뒤 저장하세요.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "초안 생성 중 오류가 발생했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function saveOverview() {
    setBusy("overview-save");
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/admin/omr/exams/${exam?.id}/comments`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          overview: {
            ...overview,
            final: overviewText.trim() || null,
            status: overviewText.trim() ? "final" : "draft",
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "총평을 저장하지 못했습니다.");
      setOverview(data.overview);
      setMessage("총평이 저장되었습니다. 이 시험의 모든 성적표에 공통으로 표시됩니다.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "총평 저장 중 오류가 발생했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function draftStudent(row: StudentRow) {
    const comment = commentFor(row);
    setBusy(`draft-${row.reportId}`);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/admin/omr/exams/${exam?.id}/comments/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: "student",
          reportId: row.reportId,
          displayKeywords: comment.displayKeywords,
          weaveKeywords: comment.weaveKeywords,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "초안을 만들지 못했습니다.");
      setComment(row, { aiDraft: data.draft, personalFinal: data.draft });
      setMessage(`${row.studentName} 학생의 초안이 생성되었습니다. 다듬은 뒤 저장하세요.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "초안 생성 중 오류가 발생했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function saveStudent(row: StudentRow) {
    const comment = commentFor(row);
    setBusy(`save-${row.reportId}`);
    setError("");
    setMessage("");
    try {
      const finalText = (comment.personalFinal ?? "").trim();
      const res = await fetch(`/api/admin/omr/comments/${row.reportId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          comment: {
            ...comment,
            personalFinal: finalText || null,
            status: finalText ? "final" : "draft",
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "저장하지 못했습니다.");
      setStudents((prev) =>
        prev.map((entry) =>
          entry.reportId === row.reportId ? { ...entry, comment: data.comment } : entry,
        ),
      );
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[row.reportId];
        return next;
      });
      setMessage(`${row.studentName} 학생의 담임 의견이 저장되었습니다.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setBusy(null);
    }
  }

  if (!exam) {
    return (
      <div className="admin-shell">
        <header className="admin-header">
          <div className="brand-lockup">
            <AcademyLogo size="large" />
            <div>
              <strong>담임 의견</strong>
              <span>목동유쌤영어학원</span>
            </div>
          </div>
          <Link className="button ghost" href="/admin/omr">← 시험 목록</Link>
        </header>
        <p className="form-error block">{error || "시험을 불러오지 못했습니다."}</p>
      </div>
    );
  }

  const doneCount = students.filter((row) => commentFor(row).status === "final").length;

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div className="brand-lockup">
          <AcademyLogo size="large" />
          <div>
            <strong>담임 의견</strong>
            <span>
              {EXAM_TYPE_LABELS[exam.examType]} · {exam.title}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="button ghost" href="/admin/omr">← 시험 목록</Link>
          <Link className="button secondary" href={`/admin/omr/${exam.id}/reports`}>← 성적표 생성</Link>
        </div>
      </header>

      {error ? <p className="form-error block">{error}</p> : null}
      {message ? <p className="status-message">{message}</p> : null}
      {!aiEnabled ? (
        <p className="subtle">OPENAI_API_KEY가 없어 AI 초안 버튼은 동작하지 않습니다. 직접 작성해 저장할 수 있습니다.</p>
      ) : null}

      <section className="panel">
        <div className="section-heading wrap">
          <div>
            <p className="eyebrow">공통</p>
            <h2>이번 시험 총평</h2>
            <p className="subtle">
              응시한 모든 학생의 성적표에 함께 실립니다.{" "}
              {overview.status === "final" ? "저장됨" : "아직 저장되지 않음"}
            </p>
          </div>
          {canEdit ? (
            <div className="toolbar">
              <button
                className="button secondary"
                disabled={busy === "overview-draft" || !aiEnabled}
                onClick={draftOverview}
              >
                {busy === "overview-draft" ? "초안 생성 중…" : "AI 초안"}
              </button>
              <button className="button primary" disabled={busy === "overview-save"} onClick={saveOverview}>
                {busy === "overview-save" ? "저장 중…" : "총평 저장"}
              </button>
            </div>
          ) : null}
        </div>

        {canEdit ? (
          <label style={{ display: "block", marginBottom: 10 }}>
            <span style={{ display: "block", marginBottom: 4, fontSize: 12, fontWeight: 700, color: "#667085" }}>
              초안 참고 메모(선택) — 이번 시험에서 관찰한 점을 적으면 초안에 반영됩니다
            </span>
            <input
              style={{ width: "100%" }}
              value={overviewMemo}
              placeholder="예: 듣기 후반부에서 흔들린 학생이 많았음, 어법 문항 체감 난도 높았음"
              onChange={(e) => setOverviewMemo(e.target.value)}
            />
          </label>
        ) : null}

        <textarea
          value={overviewText}
          disabled={!canEdit}
          rows={6}
          style={{ width: "100%", resize: "vertical", lineHeight: 1.7 }}
          placeholder="이번 시험의 성격, 응시 집단의 전반적 성취, 함께 챙길 학습 방향을 적어 주세요."
          onChange={(e) => setOverviewText(e.target.value)}
        />
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">개별</p>
            <h2>학생별 코멘트</h2>
            <p className="subtle">
              {students.length}명 중 {doneCount}명 저장 완료 · 표기용 키워드는 성적표에 칩으로
              노출되니 긍정적인 내용만, 문장 반영용 키워드는 노출되지 않으니 보완점을 자유롭게
              적어 주세요.
            </p>
          </div>
        </div>

        {students.length === 0 ? (
          <p className="subtle">
            아직 이 시험으로 생성된 성적표가 없습니다.{" "}
            <Link href={`/admin/omr/${exam.id}/reports`}>성적표 생성으로 이동 →</Link>
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {students.map((row) => {
              const comment = commentFor(row);
              const dirty = Boolean(drafts[row.reportId]);
              return (
                <article
                  key={row.reportId}
                  style={{ border: "1px solid #e1e7ef", borderRadius: 14, padding: 16 }}
                >
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 10 }}>
                    <strong style={{ fontSize: 15.5, color: "#102b55" }}>{row.studentName}</strong>
                    <span className="subtle" style={{ margin: 0 }}>
                      {row.school || "학교 미입력"} · 수험번호 {row.studentKey}
                      {row.summary
                        ? ` · ${row.summary.raw}/${row.summary.max}점 · ${row.summary.rank}/${row.summary.cohortCount}등 · 표준점수 ${row.summary.standardScore}`
                        : ""}
                    </span>
                    {comment.status === "final" && !dirty ? (
                      <span className="status-chip active">저장됨</span>
                    ) : (
                      <span className="status-chip inactive">미저장</span>
                    )}
                    {canEdit ? (
                      <div className="link-actions" style={{ marginLeft: "auto" }}>
                        <button
                          className="button tiny secondary"
                          disabled={busy === `draft-${row.reportId}` || !aiEnabled}
                          onClick={() => draftStudent(row)}
                        >
                          {busy === `draft-${row.reportId}` ? "초안 생성 중…" : "AI 초안"}
                        </button>
                        <button
                          className="button tiny primary"
                          disabled={busy === `save-${row.reportId}`}
                          onClick={() => saveStudent(row)}
                        >
                          저장
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 10 }}>
                    <KeywordChips
                      label="표기용 키워드 (성적표에 칩으로 노출 · 긍정만)"
                      hint="예: 어휘 암기 성실, 듣기 집중력 (쉼표·Enter로 추가)"
                      value={comment.displayKeywords}
                      onChange={(next) => setComment(row, { displayKeywords: next })}
                      tone="positive"
                      disabled={!canEdit}
                    />
                    <KeywordChips
                      label="문장 반영용 키워드 (노출 안 됨 · 보완점 가능)"
                      hint="예: 어법 개념 흔들림, 시간 배분 연습 필요"
                      value={comment.weaveKeywords}
                      onChange={(next) => setComment(row, { weaveKeywords: next })}
                      tone="hidden"
                      disabled={!canEdit}
                    />
                  </div>

                  <textarea
                    value={comment.personalFinal ?? ""}
                    disabled={!canEdit}
                    rows={5}
                    style={{ width: "100%", resize: "vertical", lineHeight: 1.7 }}
                    placeholder="AI 초안을 만들어 다듬거나, 직접 작성해 주세요. 저장하면 성적표에 바로 반영됩니다."
                    onChange={(e) => setComment(row, { personalFinal: e.target.value })}
                  />
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
