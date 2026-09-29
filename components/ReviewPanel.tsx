"use client";

import { useState } from "react";
import Link from "next/link";
import AcademyLogo from "@/components/AcademyLogo";
import { formatWhen, type ExamReview, type ReviewEdit } from "@/lib/review";
import { EXAM_TYPE_LABELS, type OmrExam } from "@/lib/omr-types";
import type { ReviewStudentRow } from "@/lib/reports";

interface Props {
  exam: OmrExam;
  students: ReviewStudentRow[];
  overview: { status: "draft" | "final"; text: string | null };
  /** 컨펌 — 총괄이거나 계정에 '월말평가 검토 컨펌'이 켜진 사람(교수부장 등) */
  canApprove: boolean;
}

const when = formatWhen;

/**
 * 읽다가 바로 고치는 글 상자.
 *
 * 평소에는 글로 보이고, '수정'을 누르면 그 자리가 입력창이 된다. 검수자가
 * 철자·띄어쓰기 같은 사소한 것을 담임에게 되돌려 보내지 않고 직접 바로잡기
 * 위한 것이다. 내용이 그대로면 저장하지 않는다 — 고친 내역에 빈 줄이 남지 않게.
 */
function EditableText({
  text,
  canEdit,
  compact,
  onSave,
}: {
  text: string;
  canEdit: boolean;
  compact?: boolean;
  onSave: (next: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function start() {
    setDraft(text);
    setError("");
    setEditing(true);
  }

  async function save() {
    const next = draft.trim();
    if (!next) {
      setError("내용을 비울 수는 없습니다.");
      return;
    }
    if (next === text.trim()) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(next);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="review-edit">
        <textarea
          value={draft}
          // 글 길이에 맞춰 연다 — 긴 의견을 세 줄 창에서 스크롤하며 고치게 두지 않는다
          rows={Math.min(16, Math.max(compact ? 3 : 4, Math.ceil(draft.length / 60) + 1))}
          onChange={(e) => setDraft(e.target.value)}
          disabled={saving}
          autoFocus
        />
        {error ? <p className="form-error">{error}</p> : null}
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <button className="button primary small" disabled={saving} onClick={save}>
            {saving ? "저장 중…" : "저장"}
          </button>
          <button className="button ghost small" disabled={saving} onClick={() => setEditing(false)}>
            취소
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`review-text${compact ? " compact" : ""}`}>
      <span style={{ whiteSpace: "pre-wrap" }}>{text}</span>
      {canEdit ? (
        <button className="button ghost small" type="button" onClick={start} title="철자·띄어쓰기를 바로잡습니다">
          수정
        </button>
      ) : null}
    </div>
  );
}

/**
 * 운영진 검토 화면 — 이 시험의 성적표를 학생별로 훑고 컨펌한다.
 *
 * 성적표 본문은 여기 다시 그리지 않는다. 학부모가 받을 그대로를 봐야 하므로
 * 학생 이름을 누르면 실제 성적표가 열린다(직원은 PIN 없이 연다). 이 표는
 * '어디를 열어 볼지'와 '빠진 게 없는지'를 한눈에 보는 목차다.
 *
 * 다만 확정된 의견의 사소한 오류는 검수자(교수부장)가 여기서 바로 고칠 수
 * 있다. 고친 것은 모두 기록되어 컨펌 알림에 함께 담임에게 전달된다.
 */
export default function ReviewPanel({ exam, students: initialStudents, overview: initialOverview, canApprove }: Props) {
  const [review, setReview] = useState<ExamReview>(exam.review);
  const [students, setStudents] = useState<ReviewStudentRow[]>(initialStudents);
  const [overview, setOverview] = useState(initialOverview);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notices, setNotices] = useState<string[]>([]);

  const draftCount = students.filter((s) => s.commentStatus !== "final").length;
  // 고치기는 '검토 기다리는 중'일 때만 — 컨펌 뒤에 바뀌면 담임이 모른 채 발송된다
  const canEdit = canApprove && review.status === "requested";
  const edits: ReviewEdit[] = review.edits ?? [];

  async function patch(body: { target: "overview" | "student"; reportId?: string; text: string }) {
    const res = await fetch(`/api/admin/omr/exams/${exam.id}/review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "저장하지 못했습니다.");
    if (data.review) setReview(data.review);
  }

  async function saveOverview(text: string) {
    await patch({ target: "overview", text });
    setOverview((prev) => ({ ...prev, text }));
  }

  async function saveStudent(reportId: string, text: string) {
    await patch({ target: "student", reportId, text });
    setStudents((prev) =>
      prev.map((s) =>
        s.reportId === reportId
          ? { ...s, commentText: text, commentPreview: text.length > 40 ? `${text.slice(0, 40)}…` : text }
          : s,
      ),
    );
  }

  async function approve() {
    const editLine =
      edits.length > 0
        ? `검수 중 고친 내용 ${edits.length}건도 담임 선생님께 함께 알립니다.\n`
        : "";
    const ok = window.confirm(
      `‘${exam.title}’ 성적표 ${students.length}건을 컨펌합니다.\n` +
        `담임 선생님(${review.requestedByName ?? "요청자"})께 슬랙으로 알리고, 알림톡 발송이 열립니다.\n` +
        editLine +
        `\n진행할까요?`,
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
          {edits.length > 0 ? (
            <span className="need">
              검수 중 고침 <strong>{edits.length}</strong>건
            </span>
          ) : null}
        </div>
        {draftCount > 0 || overview.status !== "final" ? (
          <p className="subtle" style={{ marginTop: 8 }}>
            미확정(초안) 상태의 의견은 성적표에 실리지 않습니다. 담임 선생님이 확정한 뒤 컨펌하는 것이
            맞는지 확인해 주세요.
          </p>
        ) : null}
        {canEdit ? (
          <p className="subtle" style={{ marginTop: 8 }}>
            확정된 의견의 철자·띄어쓰기 같은 사소한 오류는 각 글 옆의 ‘수정’으로 바로 고칠 수 있습니다.
            고친 내용은 컨펌할 때 담임 선생님께 함께 전달됩니다.
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
          <EditableText
            text={overview.text}
            canEdit={canEdit && overview.status === "final"}
            onSave={saveOverview}
          />
        </section>
      ) : null}

      {edits.length > 0 ? (
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">검수 중 고친 내용</p>
              <h2>컨펌 알림에 이 내역이 함께 실립니다</h2>
            </div>
          </div>
          <ul className="review-edits">
            {edits.map((e, i) => (
              <li key={`${e.at}-${i}`}>
                <strong>{e.target === "overview" ? "총평" : (e.studentName ?? "학생")}</strong>
                <span className="review-diff">
                  <span className="review-before">{e.before}</span>
                  <span className="review-arrow">→</span>
                  <span className="review-after">{e.after}</span>
                </span>
                <span className="subtle review-meta">
                  {e.editedByName} · {when(e.at)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">학생별 성적표</p>
            <h2>학생 이름을 누르면 학부모가 받을 성적표가 그대로 열립니다</h2>
          </div>
        </div>
        {/* 표가 아니라 카드 목록이다 — 의견 본문이 길어 표로 두면 이름·학교 칸이
            글자 단위로 쪼개진다. 한 줄에 학생 정보를 모으고, 본문은 그 아래 읽기
            좋은 폭으로 놓는다. */}
        <ul className="review-students">
          {students.map((s) => (
            <li key={s.reportId}>
              <div className="review-student-head">
                <Link href={`/r/${s.token}`} target="_blank" rel="noreferrer" className="review-student-name">
                  {s.studentName}
                </Link>
                <span className="subtle">
                  {s.school || "-"}
                  {s.className ? ` · ${s.className}` : ""}
                </span>
                <span className="review-student-score">
                  <strong>{s.raw}</strong> / {s.max}
                </span>
                <span className={`status-chip ${s.commentStatus === "final" ? "active" : s.commentStatus === "draft" ? "danger" : "inactive"}`}>
                  {s.commentStatus === "final" ? "의견 확정" : s.commentStatus === "draft" ? "의견 초안" : "의견 없음"}
                </span>
                <span className="subtle review-student-views">
                  학부모 열람 {s.viewCount > 0 ? `${s.viewCount}회` : "아직"}
                </span>
              </div>
              {s.commentText && s.commentStatus === "final" ? (
                <EditableText
                  text={s.commentText}
                  canEdit={canEdit}
                  compact
                  onSave={(text) => saveStudent(s.reportId, text)}
                />
              ) : s.commentText ? (
                <p className="review-student-draft">{s.commentText}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
