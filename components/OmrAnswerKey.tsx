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
  const [points, setPoints] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    const n = (exam?.numQuestions ?? 0) + (typeof exam?.omrConfig?.essay_count === "number" ? exam.omrConfig.essay_count : 0);
    for (let q = 1; q <= n; q += 1) {
      const value = exam?.points?.[String(q)];
      out[String(q)] = typeof value === "number" ? String(value) : "";
    }
    return out;
  });
  const [areas, setAreas] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    const n = (exam?.numQuestions ?? 0) + (typeof exam?.omrConfig?.essay_count === "number" ? exam.omrConfig.essay_count : 0);
    for (let q = 1; q <= n; q += 1) out[String(q)] = exam?.questionMeta?.[String(q)]?.area ?? "";
    return out;
  });
  const [bulkArea, setBulkArea] = useState("");
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

  /** 채점 대상 전체 문항 = 객관식 + 서술형 */
  const allNumbers = useMemo(
    () => Array.from({ length: total + essayCount }, (_, i) => i + 1),
    [total, essayCount],
  );

  /** 배점 미입력분은 남은 점수를 균등 배분 — 화면에 자동 배점을 그대로 보여준다 */
  const autoPoint = useMemo(() => {
    let assigned = 0;
    let blanks = 0;
    for (const q of allNumbers) {
      const value = Number(points[String(q)]);
      if (points[String(q)] && Number.isFinite(value) && value > 0) assigned += value;
      else blanks += 1;
    }
    if (blanks === 0) return 0;
    return Math.round((Math.max(100 - assigned, 0) / blanks) * 10) / 10;
  }, [points, allNumbers]);

  // 자동 배분 몫은 표시용으로 반올림하므로, 총점은 반올림 전 값으로 계산한다.
  const pointTotal = useMemo(() => {
    let assigned = 0;
    let blanks = 0;
    for (const q of allNumbers) {
      const value = Number(points[String(q)]);
      if (points[String(q)] && Number.isFinite(value) && value > 0) assigned += value;
      else blanks += 1;
    }
    const total = blanks > 0 ? assigned + Math.max(100 - assigned, 0) : assigned;
    return Math.round(total * 10) / 10;
  }, [points, allNumbers]);

  const areaNames = useMemo(
    () => [...new Set(Object.values(areas).map((a) => a.trim()).filter(Boolean))],
    [areas],
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
      const uploadedPoints: Record<string, number> = data.exam?.points ?? {};
      const uploadedMeta: Record<string, { area?: string }> = data.exam?.questionMeta ?? {};
      setKey(() => {
        const next: Record<string, number | null> = {};
        for (let q = 1; q <= total; q += 1) {
          next[String(q)] = typeof uploaded[String(q)] === "number" ? uploaded[String(q)] : null;
        }
        return next;
      });
      setPoints(() => {
        const next: Record<string, string> = {};
        for (const q of allNumbers) {
          const value = uploadedPoints[String(q)];
          next[String(q)] = typeof value === "number" ? String(value) : "";
        }
        return next;
      });
      setAreas(() => {
        const next: Record<string, string> = {};
        for (const q of allNumbers) next[String(q)] = uploadedMeta[String(q)]?.area ?? "";
        return next;
      });
      const extras: string[] = [];
      if (data.pointsFilled) extras.push(`배점 ${data.pointsFilled}문항`);
      if (data.areasFilled) extras.push(`영역 ${data.areasFilled}문항`);
      setMessage(
        (data.filled >= data.total
          ? `엑셀에서 정답 ${data.filled}/${data.total}문항을 불러와 저장했습니다.`
          : `엑셀에서 ${data.filled}/${data.total}문항을 저장했습니다 — 비어 있는 문항을 확인해 주세요.`) +
          (extras.length ? ` (${extras.join(" · ")} 반영)` : ""),
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
      const pointsPayload: Record<string, number> = {};
      for (const q of allNumbers) {
        const value = Number(points[String(q)]);
        if (points[String(q)] && Number.isFinite(value) && value > 0) pointsPayload[String(q)] = value;
      }
      const metaPayload: Record<string, { area: string }> = {};
      for (const q of allNumbers) {
        const area = (areas[String(q)] ?? "").trim();
        if (area) metaPayload[String(q)] = { area };
      }
      const res = await fetch(`/api/admin/omr/exams/${exam?.id}/key`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answerKey, points: pointsPayload, questionMeta: metaPayload }),
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
            <h2>정답 · 배점 · 영역</h2>
            <p className="subtle">
              정답 {filled}/{total}문항
              {essayCount > 0 ? ` · 서술형 ${essayCount}문항(정답 없이 배점·영역만)` : ""} · 총점{" "}
              {pointTotal}점
              {autoPoint > 0 ? ` (배점 미입력 문항은 ${autoPoint}점씩 자동 배분)` : ""}
              {areaNames.length > 0 ? ` · 영역 ${areaNames.length}종` : ""}
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
            <p style={{ marginTop: 12, marginBottom: 0 }}>
              <strong>배점</strong>은 비워 두면 100점을 자동으로 균등 배분합니다(일부만 지정하면
              남은 점수를 나머지 문항에 나눕니다). <strong>영역</strong>을 입력하면 성적표에
              영역별 분석이 실립니다. 난이도는 채점 결과의 정답률로 자동 분류되니 입력하지 않아도
              됩니다.
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 10, maxWidth: 560 }}>
              <input
                value={bulkArea}
                style={{ flex: 1 }}
                placeholder="영역을 한 번에 채우기 — 예: 듣기 (빈 영역 칸에만 적용)"
                onChange={(e) => setBulkArea(e.target.value)}
              />
              <button
                className="button secondary"
                type="button"
                style={{ flex: "0 0 auto" }}
                onClick={() => {
                  const value = bulkArea.trim();
                  if (!value) return;
                  setAreas((prev) => {
                    const next = { ...prev };
                    let applied = 0;
                    for (const q of allNumbers) {
                      if (!(next[String(q)] ?? "").trim()) {
                        next[String(q)] = value;
                        applied += 1;
                      }
                    }
                    setMessage(`빈 영역 칸 ${applied}문항을 '${value}'(으)로 채웠습니다.`);
                    return next;
                  });
                }}
              >
                빈 칸 채우기
              </button>
            </div>
          </div>
        ) : null}

        {/* CSS 다단(columns): 1번부터 위→아래로 채우고 다음 열로 넘어간다 */}
        <div
          style={{
            columns: `${88 + choices * 32}px`,
            columnGap: 10,
            marginTop: 14,
          }}
        >
          {allNumbers.map((q) => {
            const isEssay = q > total;
            const value = key[String(q)];
            const empty = !isEssay && value == null;
            return (
              <div
                key={q}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "8px 10px",
                  borderRadius: 10,
                  background: isEssay ? "#fffdf5" : empty ? "#fff" : "#eef4fb",
                  border: isEssay
                    ? "1px solid #e6d9a8"
                    : empty
                      ? "1px dashed #d9a8a8"
                      : "1px solid #cfdcee",
                  breakInside: "avoid",
                  marginBottom: 10,
                }}
              >
                <span
                  style={{
                    fontWeight: 800,
                    minWidth: 24,
                    textAlign: "right",
                    color: empty ? "#b91c1c" : "#102b55",
                    fontSize: 13.5,
                    paddingTop: 4,
                  }}
                >
                  {q}
                </span>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                  {isEssay ? (
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: "#7a5c17",
                        background: "#fff8df",
                        borderRadius: 6,
                        padding: "4px 8px",
                        alignSelf: "flex-start",
                      }}
                    >
                      서술형 · 손채점
                    </span>
                  ) : (
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
                  )}
                  <div style={{ display: "flex", gap: 5 }}>
                    <input
                      value={points[String(q)] ?? ""}
                      disabled={!canEdit}
                      inputMode="decimal"
                      placeholder={`${autoPoint || ""}`}
                      title="배점 — 비우면 자동 배분"
                      style={{ width: 56, padding: "3px 6px", fontSize: 12 }}
                      onChange={(e) =>
                        setPoints((prev) => ({ ...prev, [String(q)]: e.target.value.replace(/[^0-9.]/g, "") }))
                      }
                    />
                    <input
                      value={areas[String(q)] ?? ""}
                      disabled={!canEdit}
                      placeholder="영역"
                      title="영역 — 예: 듣기, 어법"
                      style={{ flex: 1, minWidth: 54, padding: "3px 6px", fontSize: 12 }}
                      onChange={(e) => setAreas((prev) => ({ ...prev, [String(q)]: e.target.value }))}
                    />
                  </div>
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
