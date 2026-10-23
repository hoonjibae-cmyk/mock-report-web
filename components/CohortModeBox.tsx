"use client";

import { useCallback, useEffect, useState } from "react";
import { COHORT_MODE_LABELS, type CohortMode } from "@/lib/omr-types";

/**
 * 월말평가 성적표의 평균 기준 — 우리 반 평균 / 같은 레벨 평균.
 *
 * 담임이 같은 레벨의 반을 둘 이상 가르치면, 성적표의 평균·석차·정답률을 그 반들을
 * 합쳐 낼 수 있다. 어느 시험이 합쳐지는지(포함/제외와 그 이유)를 그대로 보여 주고,
 * 레벨·시행월이 잘못 읽혔으면 여기서 고친다. 성적표는 이 시험의 학생들 것만 만든다.
 */

interface Sibling {
  id: string;
  title: string;
  classNames: string[];
  included: boolean;
  reason: string | null;
  reviewedCount: number;
}

interface CohortInfo {
  cohortMode: CohortMode;
  /** 쓰이는 레벨 — 적힌 값이 없으면 반 이름·제목에서 읽은 값 */
  level: string;
  levelExplicit: string | null;
  /** 쓰이는 시행월 'YYYY-MM' */
  periodMonth: string;
  periodMonthExplicit: string | null;
  teacher: string;
  siblings: Sibling[];
}

interface Props {
  examId: string;
  canEdit: boolean;
  /** 이미 만든 성적표 수 — 기준을 바꾸면 다시 만들어야 한다고 일러 준다 */
  existingReports: number;
}

export default function CohortModeBox({ examId, canEdit, existingReports }: Props) {
  const [info, setInfo] = useState<CohortInfo | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [levelDraft, setLevelDraft] = useState("");
  const [monthDraft, setMonthDraft] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/omr/exams/${examId}/cohort`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "평균 기준을 불러오지 못했습니다.");
      setInfo(data as CohortInfo);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "평균 기준을 불러오지 못했습니다.");
    }
  }, [examId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(body: { cohortMode?: CohortMode; level?: string; periodMonth?: string }) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/omr/exams/${examId}/cohort`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "평균 기준을 저장하지 못했습니다.");
      setInfo(data as CohortInfo);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "평균 기준을 저장하지 못했습니다.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function startEdit() {
    if (!info) return;
    setLevelDraft(info.levelExplicit ?? info.level);
    setMonthDraft(info.periodMonthExplicit ?? info.periodMonth);
    setEditing(true);
  }

  async function saveEdit() {
    const ok = await patch({ level: levelDraft.trim(), periodMonth: monthDraft.trim() });
    if (ok) setEditing(false);
  }

  if (!info && !error) {
    return (
      <div className="attendance-box cohort-box">
        <div className="attendance-box-head">
          <strong>성적표 평균 기준</strong>
          <span className="subtle">불러오는 중…</span>
        </div>
      </div>
    );
  }

  const mode = info?.cohortMode ?? "class";
  const siblings = info?.siblings ?? [];
  const includedCount = siblings.filter((s) => s.included).length;

  return (
    <div className="attendance-box cohort-box">
      <div className="attendance-box-head">
        <strong>성적표 평균 기준</strong>
        <span className="subtle">
          성적표의 평균·석차·정답률을 우리 반만으로 낼지, 같은 레벨의 내 다른 반과 합쳐 낼지 고릅니다.
        </span>
      </div>

      {error ? <p className="form-error block">{error}</p> : null}

      {info ? (
        <>
          <div className="cohort-controls">
            <span className="trend-seg cohort-seg" role="group" aria-label="평균 기준">
              <button
                type="button"
                className={mode === "class" ? "on" : ""}
                disabled={busy || !canEdit}
                onClick={() => (mode === "class" ? undefined : void patch({ cohortMode: "class" }))}
                title="이 시험의 학생들만으로 평균·석차·정답률을 냅니다"
              >
                {COHORT_MODE_LABELS.class}
              </button>
              <button
                type="button"
                className={mode === "level" ? "on" : ""}
                disabled={busy || !canEdit}
                onClick={() => (mode === "level" ? undefined : void patch({ cohortMode: "level" }))}
                title="같은 레벨·같은 시행월·같은 담임·같은 시험지의 다른 반 답안을 합쳐 평균·석차·정답률을 냅니다"
              >
                {COHORT_MODE_LABELS.level}
              </button>
            </span>
            <span className="cohort-meta">
              레벨 <strong>{info.level || "—"}</strong>
              {info.level && !info.levelExplicit ? <em>(반 이름에서 읽음)</em> : null}
              <span className="sep">·</span>
              시행월 <strong>{info.periodMonth || "—"}</strong>
              {info.periodMonth && !info.periodMonthExplicit ? <em>(제목에서 읽음)</em> : null}
              <span className="sep">·</span>
              담임 <strong>{info.teacher || "—"}</strong>
              {canEdit && !editing ? (
                <button type="button" className="button tiny ghost" onClick={startEdit} disabled={busy}>
                  레벨·시행월 고치기
                </button>
              ) : null}
            </span>
          </div>

          {editing ? (
            <div className="cohort-edit">
              <label>
                <span>레벨</span>
                <input
                  value={levelDraft}
                  maxLength={40}
                  placeholder="예: M4"
                  onChange={(e) => setLevelDraft(e.target.value)}
                />
              </label>
              <label>
                <span>시행월</span>
                <input type="month" value={monthDraft} onChange={(e) => setMonthDraft(e.target.value)} />
              </label>
              <button type="button" className="button small primary" onClick={() => void saveEdit()} disabled={busy}>
                {busy ? "저장 중…" : "저장"}
              </button>
              <button type="button" className="button small ghost" onClick={() => setEditing(false)} disabled={busy}>
                취소
              </button>
              <small className="hint">
                비워서 저장하면 반 이름·제목에서 다시 읽습니다. 레벨이나 달이 다른 시험은 애초에 합쳐지지 않습니다.
              </small>
            </div>
          ) : null}

          <div className="cohort-siblings">
            {siblings.length === 0 ? (
              <p className="subtle">
                같은 레벨({info.level || "—"}) · 같은 달({info.periodMonth || "—"})의 다른 월말평가가 없습니다.
                {mode === "level" ? " 지금은 ‘같은 레벨 평균’을 골라도 우리 반 평균과 같습니다." : ""}
              </p>
            ) : (
              <>
                <p className="subtle">
                  {mode === "level"
                    ? includedCount > 0
                      ? `아래 ‘포함’ ${includedCount}개 시험의 검수 완료 답안이 평균·석차 계산에 합쳐집니다.`
                      : "같은 레벨·같은 달의 시험이 있지만 모두 제외되어 지금은 우리 반 평균과 같습니다."
                    : includedCount > 0
                      ? `‘같은 레벨 평균’을 고르면 아래 ‘포함’ ${includedCount}개 시험이 합쳐집니다.`
                      : "같은 레벨·같은 달의 시험이 있지만 담임이나 시험지가 달라 합쳐지지 않습니다."}
                </p>
                <ul>
                  {siblings.map((s) => (
                    <li key={s.id} className={s.included ? "in" : "out"}>
                      <span className={`cohort-tag ${s.included ? "in" : "out"}`}>{s.included ? "포함" : "제외"}</span>
                      <strong>{s.title}</strong>
                      <span className="subtle">
                        {s.classNames.length > 0 ? s.classNames.join(", ") : "반 미지정"}
                        {s.included ? ` · 검수 완료 ${s.reviewedCount}명` : s.reason ? ` · ${s.reason}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <p className="subtle cohort-foot">
            성적표는 이 시험의 학생들 것만 만듭니다. 담임이 다른 반은 레벨이 같아도 합치지 않습니다.{" "}
            {existingReports > 0
              ? `기준을 바꾸면 이미 만든 성적표 ${existingReports}장은 ‘성적표 갱신’을 눌러 다시 만들어야 반영됩니다.`
              : "기준은 성적표를 만드는 시점에 반영됩니다."}
          </p>
        </>
      ) : null}
    </div>
  );
}
