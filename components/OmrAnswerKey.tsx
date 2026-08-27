"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import AcademyLogo from "@/components/AcademyLogo";
import { EXAM_TYPE_LABELS, type OmrExam } from "@/lib/omr-types";

interface Props {
  exam: OmrExam | null;
  setupError: string;
  canEdit: boolean;
}

export default function OmrAnswerKey({ exam, setupError, canEdit }: Props) {
  const [key, setKey] = useState<Record<string, number | null>>(() => {
    const out: Record<string, number | null> = {};
    for (let q = 1; q <= (exam?.numQuestions ?? 0); q += 1) {
      const value = exam?.answerKey?.[String(q)];
      out[String(q)] = typeof value === "number" ? value : null;
    }
    return out;
  });
  const [bulk, setBulk] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(setupError);
  const [message, setMessage] = useState("");
  const excelRef = useRef<HTMLInputElement>(null);

  const total = exam?.numQuestions ?? 0;
  const choices = exam?.numChoices ?? 5;
  const essayCount =
    typeof exam?.omrConfig?.essay_count === "number" ? exam.omrConfig.essay_count : 0;

  const filled = useMemo(
    () => Object.values(key).filter((value) => typeof value === "number").length,
    [key],
  );

  /** "13524 21435…" / "1,3,5,2,4" 같은 문자열을 1번부터 순서대로 적용 */
  function applyBulk() {
    const digits = bulk.replace(/[^0-9]/g, "").split("");
    if (digits.length === 0) {
      setError("정답 숫자를 입력해 주세요. 예: 13524 21435 …");
      return;
    }
    setError("");
    const next = { ...key };
    let applied = 0;
    for (let i = 0; i < Math.min(digits.length, total); i += 1) {
      const choice = Number(digits[i]);
      if (choice >= 1 && choice <= choices) {
        next[String(i + 1)] = choice;
        applied += 1;
      }
    }
    setKey(next);
    setMessage(
      `1번부터 ${applied}문항에 일괄 적용했습니다.${digits.length > total ? ` (${digits.length - total}자 초과분은 무시)` : ""}`,
    );
  }

  async function uploadExcel() {
    const file = excelRef.current?.files?.[0];
    if (!file || !exam) return;
    setUploading(true);
    setError("");
    setMessage("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/admin/omr/exams/${exam.id}/key/excel`, {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "엑셀을 처리하지 못했습니다.");
      const uploaded: Record<string, number> = data.exam?.answerKey ?? {};
      setKey(() => {
        const next: Record<string, number | null> = {};
        for (let q = 1; q <= total; q += 1) {
          next[String(q)] = typeof uploaded[String(q)] === "number" ? uploaded[String(q)] : null;
        }
        return next;
      });
      setMessage(
        data.filled >= data.total
          ? `엑셀에서 정답 ${data.filled}/${data.total}문항을 불러와 저장했습니다.`
          : `엑셀에서 ${data.filled}/${data.total}문항을 저장했습니다 — 비어 있는 문항을 확인해 주세요.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "엑셀 업로드 중 오류가 발생했습니다.");
    } finally {
      setUploading(false);
      if (excelRef.current) excelRef.current.value = "";
    }
  }

  async function save() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const answerKey: Record<string, number> = {};
      for (const [q, value] of Object.entries(key)) {
        if (typeof value === "number") answerKey[q] = value;
      }
      const res = await fetch(`/api/admin/omr/exams/${exam?.id}/key`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answerKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "정답을 저장하지 못했습니다.");
      setMessage(
        filled === total
          ? `정답 ${filled}/${total} 저장 완료`
          : `정답 ${filled}/${total} 저장됨 — 아직 ${total - filled}문항이 비어 있습니다.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  if (!exam) {
    return (
      <div className="admin-shell">
        <header className="admin-header">
          <div className="brand-lockup">
            <AcademyLogo size="large" />
            <div>
              <strong>정답 입력</strong>
              <span>목동유쌤영어학원</span>
            </div>
          </div>
          <Link className="button ghost" href="/admin/omr">← 시험 목록</Link>
        </header>
        <p className="form-error block">{error || "시험을 불러오지 못했습니다."}</p>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div className="brand-lockup">
          <AcademyLogo size="large" />
          <div>
            <strong>정답 입력</strong>
            <span>
              {EXAM_TYPE_LABELS[exam.examType]} · {exam.title}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="button ghost" href="/admin/omr">← 시험 목록</Link>
          <Link className="button secondary" href={`/admin/omr/${exam.id}/scans`}>
            스캔 · 검수 →
          </Link>
        </div>
      </header>

      {error ? <p className="form-error block">{error}</p> : null}
      {message ? <p className="subtle">{message}</p> : null}

      <div className="panel">
        <div className="section-heading wrap">
          <div>
            <p className="eyebrow">ANSWER KEY</p>
            <h2>객관식 정답</h2>
            <p className="subtle">
              입력 {filled}/{total}문항
              {essayCount > 0
                ? ` · 서술형 ${essayCount}문항은 손채점 대상이라 여기서 입력하지 않습니다.`
                : ""}{" "}
              정답이 모두 입력되어야 채점·성적표 생성이 가능합니다.
            </p>
          </div>
          {canEdit ? (
            <div className="toolbar" style={{ flexWrap: "wrap" }}>
              <a className="button secondary" href={`/api/admin/omr/exams/${exam.id}/key/excel`}>
                엑셀 양식 받기
              </a>
              <input
                ref={excelRef}
                type="file"
                accept=".xlsx"
                style={{ display: "none" }}
                onChange={uploadExcel}
              />
              <button
                className="button secondary"
                type="button"
                disabled={uploading}
                onClick={() => excelRef.current?.click()}
              >
                {uploading ? "업로드 중…" : "엑셀 업로드"}
              </button>
              <button className="button primary" onClick={save} disabled={saving}>
                {saving ? "저장 중…" : "정답 저장"}
              </button>
            </div>
          ) : null}
        </div>

        {canEdit ? (
          <div className="info-box">
            <strong>빠른 입력</strong>
            <p>
              1번부터 순서대로 정답 숫자를 붙여넣고 <strong>일괄 적용</strong>을 누르면 한 번에
              채워집니다(공백·쉼표 무시). 또는 <strong>엑셀 양식 받기</strong>로 내려받아 정답을
              채운 뒤 <strong>엑셀 업로드</strong>를 눌러도 됩니다 — 업로드하면 바로 저장됩니다.
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 10, maxWidth: 560 }}>
              <input
                value={bulk}
                style={{ flex: 1 }}
                placeholder={`예: ${Array.from({ length: Math.min(10, total) }, (_, i) => ((i % choices) + 1)).join("")} …`}
                onChange={(e) => setBulk(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyBulk();
                }}
              />
              <button
                className="button secondary"
                type="button"
                style={{ flex: "0 0 auto" }}
                onClick={applyBulk}
              >
                일괄 적용
              </button>
            </div>
          </div>
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(auto-fill, minmax(${64 + choices * 32}px, 1fr))`,
            gap: 10,
            marginTop: 14,
          }}
        >
          {Array.from({ length: total }, (_, i) => i + 1).map((q) => {
            const value = key[String(q)];
            const empty = value == null;
            return (
              <div
                key={q}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 10px",
                  borderRadius: 10,
                  background: empty ? "#fff" : "#eef4fb",
                  border: empty ? "1px dashed #d9a8a8" : "1px solid #cfdcee",
                }}
              >
                <span
                  style={{
                    fontWeight: 800,
                    minWidth: 24,
                    textAlign: "right",
                    color: empty ? "#b91c1c" : "#102b55",
                    fontSize: 13.5,
                  }}
                >
                  {q}
                </span>
                <div style={{ display: "flex", gap: 5 }}>
                  {Array.from({ length: choices }, (_, c) => c + 1).map((c) => (
                    <button
                      key={c}
                      type="button"
                      disabled={!canEdit}
                      onClick={() => setKey((prev) => ({ ...prev, [String(q)]: prev[String(q)] === c ? null : c }))}
                      style={{
                        width: 27,
                        height: 27,
                        flex: "0 0 auto",
                        borderRadius: "50%",
                        border: value === c ? "2px solid #183c73" : "1px solid #b8c0cc",
                        background: value === c ? "#183c73" : "white",
                        color: value === c ? "white" : "#5a6472",
                        fontSize: 12.5,
                        fontWeight: 700,
                        cursor: canEdit ? "pointer" : "default",
                        lineHeight: 1,
                        padding: 0,
                      }}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {canEdit ? (
          <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
            <button className="button primary" onClick={save} disabled={saving}>
              {saving ? "저장 중…" : "정답 저장"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
