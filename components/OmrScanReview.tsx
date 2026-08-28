"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import AcademyLogo from "@/components/AcademyLogo";
import { EXAM_TYPE_LABELS, type OmrExam } from "@/lib/omr-types";
import type { OmrScan } from "@/lib/omr-scans";

interface Props {
  exam: OmrExam | null;
  initialScans: OmrScan[];
  setupError: string;
  canEdit: boolean;
}

interface Draft {
  studentId: string;
  answers: Record<string, number | null>;
}

/** 판독기가 남긴 검수 대상 문항 번호 */
function flaggedQuestions(scan: OmrScan): Set<number> {
  const out = new Set<number>();
  for (const flag of scan.reviewFlags ?? []) {
    if (flag && flag.type === "question" && typeof flag.no === "number") out.add(flag.no);
  }
  return out;
}

function hasIdFlag(scan: OmrScan): boolean {
  return (scan.reviewFlags ?? []).some((flag) => flag && flag.type === "id");
}

export default function OmrScanReview({ exam, initialScans, setupError, canEdit }: Props) {
  const [scans, setScans] = useState<OmrScan[]>(initialScans);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(setupError);
  const [message, setMessage] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const total = exam?.numQuestions ?? 0;
  const choices = exam?.numChoices ?? 5;

  const pendingCount = useMemo(
    () => scans.filter((scan) => scan.status !== "reviewed").length,
    [scans],
  );

  function draftFor(scan: OmrScan): Draft {
    return drafts[scan.id] ?? { studentId: scan.studentId ?? "", answers: scan.answers ?? {} };
  }

  function setDraft(scan: OmrScan, patch: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [scan.id]: { ...draftFor(scan), ...patch } }));
  }

  function markedCount(draft: Draft): number {
    let count = 0;
    for (let q = 1; q <= total; q += 1) {
      if (typeof draft.answers[String(q)] === "number") count += 1;
    }
    return count;
  }

  async function upload() {
    const picked = fileRef.current?.files;
    if (!picked || picked.length === 0) {
      setError("업로드할 스캔 이미지를 선택해 주세요.");
      return;
    }
    setUploading(true);
    setError("");
    setMessage("");
    try {
      const all = Array.from(picked);
      // Vercel 서버리스 함수는 요청 본문이 4.5MB로 제한된다.
      // 큰 파일(또는 합계가 큰 묶음)은 보관함에 직접 올리고 경로만 서버에 넘긴다.
      const LIMIT = 3.5 * 1024 * 1024;
      const big: File[] = [];
      const small: File[] = [];
      let smallTotal = 0;
      for (const file of all) {
        if (file.size > LIMIT || smallTotal + file.size > LIMIT) {
          big.push(file);
        } else {
          small.push(file);
          smallTotal += file.size;
        }
      }

      const storagePaths: Array<{ path: string; filename: string }> = [];
      if (big.length > 0) {
        setMessage(`큰 파일 ${big.length}개를 보관함으로 올리는 중…`);
        const urlRes = await fetch(`/api/admin/omr/exams/${exam?.id}/scans/upload-url`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filenames: big.map((f) => f.name) }),
        });
        const urlData = await urlRes.json().catch(() => ({}));
        if (!urlRes.ok) throw new Error(urlData.error || "업로드 준비에 실패했습니다.");

        const uploads: Array<{ filename: string; path: string; signedUrl: string }> =
          urlData.uploads ?? [];
        for (const file of big) {
          const target = uploads.find((u) => u.filename === file.name);
          if (!target) throw new Error(`'${file.name}' 업로드 주소를 받지 못했습니다.`);
          const put = await fetch(target.signedUrl, {
            method: "PUT",
            headers: { "Content-Type": file.type || "application/octet-stream" },
            body: file,
          });
          if (!put.ok) {
            throw new Error(`'${file.name}' 업로드에 실패했습니다. 파일 크기와 연결을 확인해 주세요.`);
          }
          storagePaths.push({ path: target.path, filename: file.name });
        }
      }

      setMessage("판독 중…");
      const form = new FormData();
      for (const file of small) form.append("files", file);
      if (storagePaths.length > 0) form.append("storagePaths", JSON.stringify(storagePaths));
      const res = await fetch(`/api/admin/omr/exams/${exam?.id}/scans`, {
        method: "POST",
        body: form,
      });
      if (res.status === 413) {
        throw new Error(
          "파일이 너무 커서 서버가 받지 못했습니다. 스캔 해상도를 낮추거나 파일을 나눠 올려 주세요.",
        );
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "판독하지 못했습니다.");
      setScans(data.scans ?? []);
      setDrafts({});
      if (fileRef.current) fileRef.current.value = "";
      const parts = [`${data.read ?? 0}장 판독 완료`];
      if (data.failed) parts.push(`${data.failed}장 실패`);
      if (data.storageSkipped) parts.push("원본 미보관(omr-scans 버킷 없음)");
      setMessage(parts.join(" · "));
    } catch (err) {
      setError(err instanceof Error ? err.message : "판독 중 오류가 발생했습니다.");
    } finally {
      setUploading(false);
    }
  }

  async function save(scan: OmrScan, status: "pending" | "reviewed") {
    const draft = draftFor(scan);
    setBusy(scan.id);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/admin/omr/scans/${scan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: draft.studentId, answers: draft.answers, status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "저장하지 못했습니다.");
      setScans((prev) => prev.map((row) => (row.id === scan.id ? data.scan : row)));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[scan.id];
        return next;
      });
      setMessage(status === "reviewed" ? "검수 확인 저장됨" : "임시 저장됨");
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(scan: OmrScan) {
    if (!window.confirm(`'${scan.filename}' 판독 결과를 삭제할까요?`)) return;
    setBusy(scan.id);
    setError("");
    try {
      const res = await fetch(`/api/admin/omr/scans/${scan.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "삭제하지 못했습니다.");
      setScans((prev) => prev.filter((row) => row.id !== scan.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제 중 오류가 발생했습니다.");
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
              <strong>스캔 판독 · 검수</strong>
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
            <strong>스캔 판독 · 검수</strong>
            <span>
              {EXAM_TYPE_LABELS[exam.examType]} · {exam.title}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="button ghost" href="/admin/omr">← 시험 목록</Link>
          <Link className="button secondary" href={`/admin/omr/${exam.id}/key`}>
            정답 입력
          </Link>
          <Link className="button secondary" href={`/admin/omr/${exam.id}/reports`}>
            성적표 생성 →
          </Link>
          <a
            className="button secondary"
            href={`/api/admin/omr/exams/${exam.id}/sheet`}
            target="_blank"
            rel="noreferrer"
          >
            답안지 PDF
          </a>
        </div>
      </header>

      {error ? <p className="form-error block">{error}</p> : null}
      {message ? <p className="subtle">{message}</p> : null}

      {canEdit ? (
        <div className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">STEP 1</p>
              <h2>스캔 업로드</h2>
              <p className="subtle">
                답안지를 스캔한 이미지(JPG·PNG) 또는 <strong>PDF</strong>를 한 번에 여러 개 올릴
                수 있습니다. 여러 장을 하나로 스캔한 PDF는 페이지마다 답안지 1장으로 자동
                분리됩니다. 업로드하면 바로 판독하며, 원본은 7일간 보관됩니다. 큰 파일은
                보관함으로 직접 올라가므로 용량 제한 없이 처리됩니다.
              </p>
            </div>
          </div>
          <div className="form-row">
            <label style={{ flex: 1 }}>
              <span>스캔 파일 (이미지 · PDF)</span>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,.pdf,application/pdf"
                multiple
                disabled={uploading}
              />
            </label>
          </div>
          <button className="button primary" onClick={upload} disabled={uploading}>
            {uploading ? "판독 중…" : "업로드 · 판독"}
          </button>
        </div>
      ) : null}

      <div className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">STEP 2</p>
            <h2>검수</h2>
            <p className="subtle">
              총 {scans.length}장 · 검수 필요 {pendingCount}장. 미표기·이중표기 문항은 아래에
              표시됩니다. 확인 후 <strong>검수 확인</strong>을 누르면 성적표 생성에 사용됩니다.
            </p>
          </div>
        </div>

        {scans.length === 0 ? (
          <p className="subtle">아직 업로드한 스캔이 없습니다.</p>
        ) : (
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>파일</th>
                  <th>수험번호</th>
                  <th>표기</th>
                  <th>상태</th>
                  <th>작업</th>
                </tr>
              </thead>
              <tbody>
                {scans.map((scan) => {
                  const draft = draftFor(scan);
                  const flags = flaggedQuestions(scan);
                  const marked = markedCount(draft);
                  const idFlag = hasIdFlag(scan) || !draft.studentId;
                  const dirty = Boolean(drafts[scan.id]);
                  const isOpen = expanded === scan.id;

                  return (
                    <tr key={scan.id}>
                      <td colSpan={5} style={{ padding: 0 }}>
                        <div style={{ padding: "12px 14px" }}>
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 12,
                              alignItems: "center",
                            }}
                          >
                            <strong style={{ minWidth: 160 }}>{scan.filename}</strong>

                            <label style={{ margin: 0 }}>
                              <span style={{ fontSize: 12 }}>수험번호</span>
                              <input
                                value={draft.studentId}
                                inputMode="numeric"
                                disabled={!canEdit}
                                style={{
                                  width: 120,
                                  borderColor: idFlag ? "#c0392b" : undefined,
                                }}
                                onChange={(e) =>
                                  setDraft(scan, { studentId: e.target.value.replace(/\D/g, "") })
                                }
                              />
                            </label>

                            <span className="subtle">
                              표기 {marked}/{total}
                            </span>

                            {scan.readError ? (
                              <span className="status-chip danger">판독 실패</span>
                            ) : scan.status === "reviewed" && !dirty ? (
                              <span className="status-chip active">검수 완료</span>
                            ) : flags.size > 0 || idFlag ? (
                              <span className="status-chip danger">
                                확인 필요{flags.size > 0 ? ` · ${flags.size}문항` : ""}
                              </span>
                            ) : (
                              <span className="status-chip">검수 대기</span>
                            )}

                            <div className="link-actions" style={{ marginLeft: "auto" }}>
                              <button
                                className="button tiny ghost"
                                onClick={() => setExpanded(isOpen ? null : scan.id)}
                              >
                                {isOpen ? "답안 닫기" : "답안 보기"}
                              </button>
                              {canEdit ? (
                                <>
                                  <button
                                    className="button tiny primary"
                                    disabled={busy === scan.id}
                                    onClick={() => save(scan, "reviewed")}
                                  >
                                    검수 확인
                                  </button>
                                  <button
                                    className="button tiny danger"
                                    disabled={busy === scan.id}
                                    onClick={() => remove(scan)}
                                  >
                                    삭제
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </div>

                          {scan.readError ? (
                            <p className="form-error" style={{ marginTop: 8 }}>
                              {scan.readError} — 스캔을 다시 찍어 같은 파일명으로 올리면 갱신됩니다.
                            </p>
                          ) : null}

                          {isOpen ? (
                            <div
                              style={{
                                marginTop: 12,
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))",
                                gap: 8,
                              }}
                            >
                              {Array.from({ length: total }, (_, i) => i + 1).map((q) => {
                                const value = draft.answers[String(q)];
                                const needsCheck = flags.has(q) || value == null;
                                return (
                                  <label
                                    key={q}
                                    style={{
                                      margin: 0,
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 6,
                                      padding: "4px 6px",
                                      borderRadius: 6,
                                      background: needsCheck ? "#fdecea" : "transparent",
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontSize: 12,
                                        fontWeight: 700,
                                        minWidth: 22,
                                        textAlign: "right",
                                      }}
                                    >
                                      {q}
                                    </span>
                                    <select
                                      value={value == null ? "" : String(value)}
                                      disabled={!canEdit}
                                      style={{ flex: 1, padding: "2px 4px" }}
                                      onChange={(e) =>
                                        setDraft(scan, {
                                          answers: {
                                            ...draft.answers,
                                            [String(q)]:
                                              e.target.value === "" ? null : Number(e.target.value),
                                          },
                                        })
                                      }
                                    >
                                      <option value="">–</option>
                                      {Array.from({ length: choices }, (_, c) => c + 1).map((c) => (
                                        <option key={c} value={c}>
                                          {c}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
