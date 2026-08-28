"use client";

import { useState } from "react";
import Link from "next/link";
import AcademyLogo from "@/components/AcademyLogo";
import { EXAM_TYPE_LABELS, type OmrExam } from "@/lib/omr-types";
import {
  AREA_RATINGS,
  COMMENT_STYLE_LABELS,
  suggestRating,
  type CommentStyle,
  type AreaFeedback,
  type AreaRating,
  type CommentStudentRow,
  type OverviewComment,
  type TeacherComment,
} from "@/lib/omr-comments";

type StudentRow = Omit<CommentStudentRow, "reportData">;

interface Props {
  exam: OmrExam | null;
  initialOverview: OverviewComment;
  initialStudents: StudentRow[];
  setupError: string;
  canEdit: boolean;
  aiEnabled: boolean;
}

/**
 * 영역별 평가 편집기 — 등급은 성취율에서 제안하고 선생님이 고친다.
 *
 * 아직 작성하지 않은 영역도 성취율과 함께 미리 띄운다. 빈 칸이 보여야
 * 어느 영역을 아직 안 썼는지 알 수 있다.
 */
function AreaFeedbackEditor({
  areas,
  value,
  disabled,
  onChange,
}: {
  areas: Array<{ area: string; earned: number; possible: number; rate: number; cohortRate: number }>;
  value: AreaFeedback[];
  disabled: boolean;
  onChange: (next: AreaFeedback[]) => void;
}) {
  if (areas.length === 0) {
    return (
      <p className="subtle" style={{ margin: "6px 0 0" }}>
        문항별 분석영역이 없어 영역별 평가를 만들 수 없습니다. 정답 입력 엑셀의 ‘분석영역’ 칸을
        채워 올리면 여기에 영역이 나타납니다.
      </p>
    );
  }

  const byArea = new Map(value.map((entry) => [entry.area, entry]));
  const update = (area: string, patch: Partial<AreaFeedback>) => {
    const current = byArea.get(area);
    const base: AreaFeedback =
      current ?? {
        area,
        rating: suggestRating(areas.find((a) => a.area === area)?.rate ?? 0),
        text: "",
      };
    const merged = { ...base, ...patch };
    const next = areas
      .map((a) => (a.area === area ? merged : byArea.get(a.area)))
      .filter((entry): entry is AreaFeedback => Boolean(entry));
    onChange(next);
  };

  return (
    <div className="fb-editor">
      {areas.map((stat) => {
        const entry = byArea.get(stat.area);
        const rating = entry?.rating ?? suggestRating(stat.rate);
        return (
          <div className="fb-row" key={stat.area}>
            <div className="fb-head">
              <strong>{stat.area}</strong>
              <span className="subtle">
                {stat.earned}/{stat.possible}점 · 성취율 {stat.rate}% (반 평균 {stat.cohortRate}%)
              </span>
              <select
                value={rating}
                disabled={disabled}
                onChange={(e) => update(stat.area, { rating: e.target.value as AreaRating })}
              >
                {AREA_RATINGS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                    {option === suggestRating(stat.rate) ? " (제안)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              rows={3}
              disabled={disabled}
              placeholder={`${stat.area} 영역에 대한 평가를 적어 주세요. 비워 두면 등급만 실립니다.`}
              value={entry?.text ?? ""}
              onChange={(e) => update(stat.area, { text: e.target.value })}
            />
          </div>
        );
      })}
    </div>
  );
}

/** 영역별 출제 안내 편집기 — 응시생 전원에게 똑같이 실린다 */
function AreaNotesEditor({
  value,
  disabled,
  onChange,
}: {
  value: Array<{ area: string; text: string }>;
  disabled: boolean;
  onChange: (next: Array<{ area: string; text: string }>) => void;
}) {
  if (value.length === 0) return null;
  return (
    <div className="fb-editor" style={{ marginTop: 12 }}>
      {value.map((entry, index) => (
        <div className="fb-row" key={entry.area}>
          <div className="fb-head">
            <strong>{entry.area}</strong>
          </div>
          <textarea
            rows={3}
            disabled={disabled}
            placeholder={`${entry.area} 영역에서 무엇을 확인했는지 적어 주세요.`}
            value={entry.text}
            onChange={(e) => {
              const next = [...value];
              next[index] = { ...entry, text: e.target.value };
              onChange(next);
            }}
          />
        </div>
      ))}
    </div>
  );
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
  const [areaNotes, setAreaNotes] = useState(initialOverview.areaNotes ?? []);
  // 시험마다 고르는 작성 방식. 선생님마다 쓰는 방식이 다르므로 강제하지 않는다.
  const [style, setStyle] = useState<CommentStyle>(initialOverview.style);
  const structured = style === "structured";
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

  /** 영역별 출제 안내 초안 — 정답표의 분석영역·내용을 근거로 만든다 */
  async function draftAreaNotesFor() {
    setBusy("area-notes-draft");
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/admin/omr/exams/${exam?.id}/comments/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "areaNotes", memo: overviewMemo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "초안을 만들지 못했습니다.");
      setAreaNotes(data.areas ?? []);
      setMessage("영역별 안내 초안을 만들었습니다. 확인 후 저장해 주세요.");
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
            areaNotes: areaNotes.filter((entry) => entry.text.trim()),
            style,
            // 총평이나 영역별 안내 중 하나라도 쓰였으면 성적표에 내보낸다
            status:
              overviewText.trim() ||
              (structured && areaNotes.some((entry) => entry.text.trim()))
                ? "final"
                : "draft",
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "총평을 저장하지 못했습니다.");
      setOverview(data.overview);
      setAreaNotes(data.overview?.areaNotes ?? []);
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
      // 영역별 서술은 AI가 준 것과 성취율에서 제안한 등급을 합쳐 채운다
      const areaDrafts: Array<{ area: string; text: string }> = data.areaDrafts ?? [];
      const stats = row.summary?.areas ?? [];
      const areaFeedback = stats.map((stat) => {
        const draft = areaDrafts.find((entry) => entry.area === stat.area);
        const existing = comment.areaFeedback.find((entry) => entry.area === stat.area);
        return {
          area: stat.area,
          rating: existing?.rating ?? suggestRating(stat.rate),
          text: draft?.text ?? existing?.text ?? "",
        };
      });
      setComment(row, { aiDraft: data.draft, personalFinal: data.draft, areaFeedback });
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

      {/* 작성 방식 — 선생님마다 쓰는 방식이 다르므로 시험마다 고른다 */}
      <section className="panel style-picker-panel">
        <div>
          <p className="eyebrow">작성 방식</p>
          <h2>이 시험의 의견을 어떻게 쓸까요?</h2>
          <p className="subtle">
            시험마다 따로 고를 수 있습니다. 방식을 바꿔도 이미 쓴 글은 지워지지 않습니다.
          </p>
        </div>
        <div className="style-options">
          {(["free", "structured"] as CommentStyle[]).map((option) => (
            <button
              key={option}
              type="button"
              className={`style-option${style === option ? " on" : ""}`}
              disabled={!canEdit}
              onClick={() => setStyle(option)}
            >
              <strong>{COMMENT_STYLE_LABELS[option]}</strong>
              <span>
                {option === "free"
                  ? "총평 한 칸과 학생별 의견 한 칸에 자유롭게 씁니다."
                  : "위에 더해 영역별 출제 안내와 영역별 평가(등급 + 서술)까지 적습니다."}
              </span>
            </button>
          ))}
        </div>
        <p className="subtle style-note">
          고른 방식은 <strong>총평 저장</strong>을 누를 때 함께 저장됩니다.
          {structured
            ? " 영역별 항목은 문항에 분석영역이 있어야 만들어집니다."
            : " 영역별 항목은 성적표에 실리지 않습니다."}
        </p>
      </section>

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

        {/* 영역별 출제 안내 — 무엇을 확인하려 한 시험인지 영역마다 한 단락씩 */}
        <div style={{ marginTop: 18, display: structured ? undefined : "none" }}>
          <div className="card-title-row">
            <h4 style={{ margin: 0, fontSize: 14 }}>영역별 출제 안내</h4>
            {canEdit && aiEnabled ? (
              <button
                className="button tiny ghost"
                disabled={busy === "area-notes-draft"}
                onClick={draftAreaNotesFor}
              >
                {busy === "area-notes-draft" ? "만드는 중…" : "AI 초안"}
              </button>
            ) : null}
          </div>
          <p className="subtle" style={{ margin: "4px 0 0" }}>
            듣기·문법·독해처럼 영역마다 <strong>이번 시험에서 무엇을 확인했는지</strong> 적습니다.
            응시생 전원의 성적표에 똑같이 실립니다.
          </p>
          {areaNotes.length === 0 ? (
            <p className="subtle" style={{ margin: "8px 0 0" }}>
              아직 없습니다. {aiEnabled ? "‘AI 초안’을 누르면" : "정답 입력 엑셀의 ‘분석영역’을 채우면"}{" "}
              영역별로 칸이 만들어집니다.
            </p>
          ) : (
            <AreaNotesEditor value={areaNotes} disabled={!canEdit} onChange={setAreaNotes} />
          )}
        </div>
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

                  <label style={{ display: "block" }}>
                    <span style={{ display: "block", marginBottom: 4, fontSize: 12, fontWeight: 700, color: "#667085" }}>
                      종합 평가
                    </span>
                    <textarea
                      value={comment.personalFinal ?? ""}
                      disabled={!canEdit}
                      rows={5}
                      style={{ width: "100%", resize: "vertical", lineHeight: 1.7 }}
                      placeholder="AI 초안을 만들어 다듬거나, 직접 작성해 주세요. 저장하면 성적표에 바로 반영됩니다."
                      onChange={(e) => setComment(row, { personalFinal: e.target.value })}
                    />
                  </label>

                  {/* 영역별 평가 — 등급은 성취율에서 제안하고 선생님이 고친다 */}
                  <div style={{ marginTop: 14, display: structured ? undefined : "none" }}>
                    <span style={{ display: "block", marginBottom: 4, fontSize: 12, fontWeight: 700, color: "#667085" }}>
                      영역별 평가 — 등급은 성취율로 제안했습니다. 필요하면 바꿔 주세요.
                    </span>
                    <AreaFeedbackEditor
                      areas={row.summary?.areas ?? []}
                      value={comment.areaFeedback}
                      disabled={!canEdit}
                      onChange={(next) => setComment(row, { areaFeedback: next })}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
