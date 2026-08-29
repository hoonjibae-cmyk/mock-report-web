"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import AcademyLogo from "@/components/AcademyLogo";
import {
  compactMark,
  formatChoices,
  toChoices,
  type AnswerKeyValue,
  type MarkValue,
} from "@/lib/omr-answers";
import { EXAM_TYPE_LABELS, type OmrExam } from "@/lib/omr-types";

interface Props {
  exam: OmrExam | null;
  setupError: string;
  canEdit: boolean;
}

export default function OmrAnswerKey({ exam, setupError, canEdit }: Props) {
  // 문항별 정답을 항상 배열로 다룬다 — 원소가 2개 이상이면 '모두 고르기' 문항이다.
  const [key, setKey] = useState<Record<string, number[]>>(() => {
    const out: Record<string, number[]> = {};
    for (let q = 1; q <= (exam?.numQuestions ?? 0); q += 1) {
      out[String(q)] = toChoices(exam?.answerKey?.[String(q)]);
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
  /**
   * 주관식(서술형) 정답 — 문장이라 보기번호와 자료형이 다르다.
   * 넣어 두면 전사 결과가 이와 일치하는 답안이 자동으로 만점 처리된다.
   */
  const [essayKey, setEssayKey] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    const base = exam?.numQuestions ?? 0;
    const n = typeof exam?.omrConfig?.essay_count === "number" ? exam.omrConfig.essay_count : 0;
    for (let k = 1; k <= n; k += 1) {
      const saved = exam?.answerKey?.[String(base + k)];
      out[String(base + k)] = typeof saved === "string" ? saved : "";
    }
    return out;
  });
  const [bulkArea, setBulkArea] = useState("");
  /** 주관식 정답을 몇 개나 넣었는지 — 넣은 만큼 자동 채점이 된다 */
  const essayFilled = Object.values(essayKey).filter((text) => text.trim()).length;
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

  const filled = useMemo(() => Object.values(key).filter((value) => value.length > 0).length, [key]);

  /** 정답이 둘 이상인 문항 = '모두 고르기' 문항 */
  const multiCount = useMemo(
    () => Object.values(key).filter((value) => value.length > 1).length,
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

  /**
   * 1번부터 순서대로 일괄 적용.
   *  · 쉼표가 없으면 숫자 한 자 = 한 문항 ("13524 21435…", 공백은 보기 편하라고 무시)
   *  · 쉼표가 있으면 쉼표 하나가 문항 경계 ("1,3,24,5" → 3번은 ②④ 복수 정답)
   */
  function applyBulk() {
    const raw = bulk.replace(/\s+/g, "");
    const tokens = raw.includes(",")
      ? raw.split(",").map((t) => t.replace(/[^0-9]/g, ""))
      : raw.replace(/[^0-9]/g, "").split("");
    if (tokens.filter(Boolean).length === 0) {
      setError("정답 숫자를 입력해 주세요. 예: 13524 21435 … (복수 정답은 1,3,24,5)");
      return;
    }
    setError("");
    const next = { ...key };
    let applied = 0;
    for (let i = 0; i < Math.min(tokens.length, total); i += 1) {
      const picked = toChoices(
        tokens[i].split("").map(Number).filter((c) => c >= 1 && c <= choices),
      );
      if (picked.length > 0) {
        next[String(i + 1)] = picked;
        applied += 1;
      }
    }
    setKey(next);
    setMessage(
      `1번부터 ${applied}문항에 일괄 적용했습니다.${tokens.length > total ? ` (${tokens.length - total}개 초과분은 무시)` : ""}`,
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
      const uploaded: Record<string, MarkValue> = data.exam?.answerKey ?? {};
      const uploadedPoints: Record<string, number> = data.exam?.points ?? {};
      const uploadedMeta: Record<string, { area?: string }> = data.exam?.questionMeta ?? {};
      setKey(() => {
        const next: Record<string, number[]> = {};
        for (let q = 1; q <= total; q += 1) next[String(q)] = toChoices(uploaded[String(q)]);
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
      const answerKey: Record<string, AnswerKeyValue> = {};
      for (const [q, value] of Object.entries(key)) {
        const packed = compactMark(value);
        if (packed != null) answerKey[q] = packed;
      }
      // 주관식은 문장 그대로 담는다(여러 개면 | 로 구분해 적는다)
      for (const [q, text] of Object.entries(essayKey)) {
        const trimmed = text.trim();
        if (trimmed) answerKey[q] = trimmed;
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
              {multiCount > 0 ? ` · 모두 고르기 ${multiCount}문항` : ""}
              {essayCount > 0
                ? ` · 주관식 ${essayCount}문항(정답 ${essayFilled}/${essayCount})`
                : ""} · 총점{" "}
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
              채워집니다(공백은 무시). 또는 <strong>엑셀 양식 받기</strong>로 내려받아 정답을
              채운 뒤 <strong>엑셀 업로드</strong>를 눌러도 됩니다 — 업로드하면 바로 저장됩니다.
            </p>
            <p style={{ marginTop: 6 }}>
              <strong>‘모두 고르기’ 문항</strong>(정답이 둘 이상)은 아래에서 보기 번호를 여러 개
              누르면 됩니다. 일괄 입력에서는 <strong>쉼표</strong>로 문항을 나눠 주세요 —
              <code> 1,3,24,5</code>는 3번 정답이 ②④라는 뜻입니다. 학생이 정답 보기를 모두, 그리고
              그것만 표기해야 정답 처리됩니다.
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 10, maxWidth: 560 }}>
              <input
                value={bulk}
                style={{ flex: 1 }}
                placeholder={`예: ${Array.from({ length: Math.min(10, total) }, (_, i) => ((i % choices) + 1)).join("")} … (복수 정답은 1,3,24,5)`}
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
            const picked = key[String(q)] ?? [];
            const empty = !isEssay && picked.length === 0;
            const isMulti = picked.length > 1;
            return (
              <div
                key={q}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "8px 10px",
                  borderRadius: 10,
                  background: isEssay ? "#fffdf5" : empty ? "#fff" : isMulti ? "#eaf6ee" : "#eef4fb",
                  border: isEssay
                    ? "1px solid #e6d9a8"
                    : empty
                      ? "1px dashed #d9a8a8"
                      : isMulti
                        ? "1px solid #a9d3b8"
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
                {/* minWidth:0 — 없으면 flex 항목의 min-width:auto가 카드 폭을 넘긴다 */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 0 }}>
                  {isEssay ? (
                    /* 주관식 정답 — 문장이라 보기 버튼 대신 글자 칸을 둔다.
                       넣어 두면 전사 결과가 일치하는 답안이 자동으로 만점 처리된다. */
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
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
                        주관식
                      </span>
                      <input
                        value={essayKey[String(q)] ?? ""}
                        disabled={!canEdit}
                        placeholder="정답 문장 (여러 개면 | 로 구분)"
                        title="예: He is looking forward to seeing you. | He's looking forward to seeing you."
                        style={{ width: "100%", margin: 0, fontSize: 13 }}
                        onChange={(e) =>
                          setEssayKey((prev) => ({ ...prev, [String(q)]: e.target.value }))
                        }
                      />
                    </div>
                  ) : (
                    <div
                      style={{ display: "flex", gap: 5, rowGap: 4, alignItems: "center", flexWrap: "wrap" }}
                    >
                      {Array.from({ length: choices }, (_, c) => c + 1).map((c) => {
                        const on = picked.includes(c);
                        return (
                          <button
                            key={c}
                            type="button"
                            disabled={!canEdit}
                            title={on ? `${c}번 정답 해제` : `${c}번을 정답에 추가 (여러 개 선택 = 모두 고르기 문항)`}
                            // 여러 개를 눌러 두면 '모두 고르기' 문항이 된다(다시 누르면 해제).
                            onClick={() =>
                              setKey((prev) => {
                                const current = prev[String(q)] ?? [];
                                const next = current.includes(c)
                                  ? current.filter((v) => v !== c)
                                  : [...current, c].sort((a, b) => a - b);
                                return { ...prev, [String(q)]: next };
                              })
                            }
                            style={{
                              width: 27,
                              height: 27,
                              flex: "0 0 auto",
                              borderRadius: "50%",
                              border: on ? "2px solid #183c73" : "1px solid #b8c0cc",
                              background: on ? "#183c73" : "white",
                              color: on ? "white" : "#5a6472",
                              fontSize: 12.5,
                              fontWeight: 700,
                              cursor: canEdit ? "pointer" : "default",
                              lineHeight: 1,
                              padding: 0,
                            }}
                          >
                            {c}
                          </button>
                        );
                      })}
                      {isMulti ? (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: "#1d6b3f",
                            background: "#d7f0e0",
                            borderRadius: 6,
                            padding: "3px 6px",
                            whiteSpace: "nowrap",
                          }}
                          title={`정답 ${formatChoices(picked)} — 학생이 이 보기를 모두 표기해야 정답`}
                        >
                          모두 고르기
                        </span>
                      ) : null}
                    </div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "58px minmax(0, 1fr)", gap: 5 }}>
                    <input
                      className="qk-input"
                      value={points[String(q)] ?? ""}
                      disabled={!canEdit}
                      inputMode="decimal"
                      placeholder={`${autoPoint || ""}`}
                      title="배점 — 비우면 자동 배분"
                      aria-label={`${q}번 배점`}
                      onChange={(e) =>
                        setPoints((prev) => ({ ...prev, [String(q)]: e.target.value.replace(/[^0-9.]/g, "") }))
                      }
                    />
                    <input
                      className="qk-input"
                      value={areas[String(q)] ?? ""}
                      disabled={!canEdit}
                      placeholder="영역"
                      title="영역 — 예: 듣기, 어법"
                      aria-label={`${q}번 영역`}
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
