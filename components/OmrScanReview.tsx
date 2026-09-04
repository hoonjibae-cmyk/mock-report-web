"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import AcademyLogo from "@/components/AcademyLogo";
import ScanPreview from "@/components/ScanPreview";
import { compactMark, isMultiAnswer, toChoices, type MarkValue } from "@/lib/omr-answers";
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
  /** 값은 보기 하나(숫자) 또는 여러 개(배열) — '모두 고르기' 문항 대응 */
  answers: Record<string, MarkValue>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
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

/**
 * 한 번에 보낼 묶음 크기. 60장을 한 요청에 넣으면 판독에 1~2분이 걸리고, 그
 * 사이 연결이 끊기면 처음부터 다시 해야 한다. 나눠 보내면 끊겨도 그 묶음만
 * 다시 하면 되고 진행 상황도 보인다.
 */
const UPLOAD_BATCH = 20;

/** Vercel 서버리스 함수 요청 본문 제한(4.5MB)에 여유를 둔 값 */
const DIRECT_BODY_LIMIT = 3.5 * 1024 * 1024;

/** 파일 목록을 묶음으로 나눈다(장수 상한 + 본문 용량 상한). */
function chunkForUpload(files: File[]): File[][] {
  const batches: File[][] = [];
  let current: File[] = [];
  let bytes = 0;
  for (const file of files) {
    // 큰 파일은 보관함을 거치므로 본문 용량에 잡히지 않는다
    const counted = file.size > DIRECT_BODY_LIMIT ? 0 : file.size;
    const wouldOverflow =
      current.length >= UPLOAD_BATCH || (counted > 0 && bytes + counted > DIRECT_BODY_LIMIT);
    if (current.length > 0 && wouldOverflow) {
      batches.push(current);
      current = [];
      bytes = 0;
    }
    current.push(file);
    bytes += counted;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/** 여러 장이 들어 있을 법한 PDF인지 — 안내 문구를 바꾸는 용도 */
function looksLikeMultiPagePdf(files: File[]): boolean {
  return files.some(
    (f) => (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) && f.size > 2 * 1024 * 1024,
  );
}

/** 서버가 판정한 '사람이 봐야 하는 이유' */
interface ReviewReason {
  code: string;
  label: string;
  questions?: number[];
}

interface ReviewSummary {
  total: number;
  reviewed: number;
  autoReady: number;
  needsPerson: Array<{ id: string; filename: string; reasons: ReviewReason[] }>;
  directoryUsed: boolean;
}

export default function OmrScanReview({ exam, initialScans, setupError, canEdit }: Props) {
  const [scans, setScans] = useState<OmrScan[]>(initialScans);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(setupError);
  const [message, setMessage] = useState("");
  // 파일 입력의 FileList 대신 직접 들고 있어야 드래그 앤 드롭·개별 삭제가 된다
  const [picked, setPicked] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const total = exam?.numQuestions ?? 0;
  const choices = exam?.numChoices ?? 5;
  // 주관식 문항 수 — 검수 다음에 어디로 가야 하는지가 이 값으로 갈린다
  const essayCount =
    typeof exam?.omrConfig?.essay_count === "number" ? exam.omrConfig.essay_count : 0;
  // 답안지 한 열에 담기는 문항 수. 답안지를 만들 때 정한 값을 그대로 쓴다 —
  // 화면과 종이의 열이 어긋나면 나란히 놓고 대조할 수 없다. 값이 없으면
  // 답안지 생성기의 기본값(20)을 따른다.
  const perColumn = Math.max(
    1,
    Math.min(total || 1, Number(exam?.omrConfig?.per_column) || 20),
  );

  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [approving, setApproving] = useState(false);

  const pendingCount = useMemo(
    () => scans.filter((scan) => scan.status !== "reviewed").length,
    [scans],
  );

  /**
   * 자동 통과 판정은 서버에서 받아 온다. 학생 명부 대조와 수험번호 중복 검사는
   * 답안지 한 장만 봐서는 알 수 없어서, 화면에서 흉내 낼 수 없다.
   */
  const loadSummary = useCallback(async () => {
    if (!exam?.id) return;
    try {
      const res = await fetch(`/api/admin/omr/exams/${exam.id}/scans/review`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) setSummary(data as ReviewSummary);
    } catch {
      // 요약을 못 받아도 검수 자체는 그대로 할 수 있으므로 조용히 넘어간다
    }
  }, [exam?.id]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary, scans]);

  /** {스캔ID: 사람이 봐야 하는 이유} */
  const reasonsById = useMemo(() => {
    const map = new Map<string, ReviewReason[]>();
    for (const entry of summary?.needsPerson ?? []) map.set(entry.id, entry.reasons);
    return map;
  }, [summary]);

  const visibleScans = useMemo(
    () => (onlyFlagged ? scans.filter((scan) => reasonsById.has(scan.id)) : scans),
    [scans, onlyFlagged, reasonsById],
  );

  /** 판독기가 확신한 답안지를 한 번에 확인 처리 */
  async function approveAuto() {
    if (!exam?.id) return;
    setApproving(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/admin/omr/exams/${exam.id}/scans/review`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "자동 확인에 실패했습니다.");
      if (data.scans) setScans(data.scans);
      setMessage(
        data.approved > 0
          ? `${data.approved}장 자동 확인 완료.${data.remaining ? ` 남은 ${data.remaining}장은 직접 확인해 주세요.` : " 모두 확인되었습니다."}`
          : (data.message ?? "자동으로 확인할 수 있는 답안지가 없습니다."),
      );
      if (data.remaining > 0) setOnlyFlagged(true);
      await loadSummary();
    } catch (err) {
      setError(err instanceof Error ? err.message : "자동 확인 중 오류가 발생했습니다.");
    } finally {
      setApproving(false);
    }
  }

  function draftFor(scan: OmrScan): Draft {
    return drafts[scan.id] ?? { studentId: scan.studentId ?? "", answers: scan.answers ?? {} };
  }

  function setDraft(scan: OmrScan, patch: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [scan.id]: { ...draftFor(scan), ...patch } }));
  }

  function markedCount(draft: Draft): number {
    let count = 0;
    for (let q = 1; q <= total; q += 1) {
      if (toChoices(draft.answers[String(q)]).length > 0) count += 1;
    }
    return count;
  }

  /** 이미지·PDF만 추리고, 같은 파일을 두 번 담지 않는다 */
  function addFiles(incoming: FileList | File[] | null) {
    const list = Array.from(incoming ?? []).filter(
      (f) => f.type.startsWith("image/") || f.type === "application/pdf" || /\.pdf$/i.test(f.name),
    );
    if (list.length === 0) return;
    setError("");
    setPicked((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}`));
      return [...prev, ...list.filter((f) => !seen.has(`${f.name}:${f.size}`))];
    });
  }

  interface BatchResult {
    scans?: OmrScan[];
    read?: number;
    failed?: number;
    lowConfidence?: number;
    storageSkipped?: boolean;
  }

  /** 묶음 하나를 올리고 판독한다. 큰 파일은 보관함을 거쳐 본문 제한을 피한다. */
  async function uploadBatch(
    files: File[],
    onStage: (stage: string) => void,
  ): Promise<BatchResult> {
    const big = files.filter((f) => f.size > DIRECT_BODY_LIMIT);
    const small = files.filter((f) => f.size <= DIRECT_BODY_LIMIT);

    const storagePaths: Array<{ path: string; filename: string }> = [];
    if (big.length > 0) {
      onStage(`큰 파일 ${big.length}개를 보관함으로 올리는 중`);
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

    onStage("판독 중");
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
    return data as BatchResult;
  }

  async function upload() {
    if (picked.length === 0) {
      setError("업로드할 스캔 이미지를 선택해 주세요.");
      return;
    }
    setUploading(true);
    setError("");
    setMessage("");
    try {
      // 여러 장을 한 요청에 몰아 보내면 중간에 끊겼을 때 전부 다시 올려야 한다.
      // 묶음으로 나눠 보내면 끊겨도 그 묶음만 다시 하면 되고, 진행 상황도 보인다.
      // (60장이 한 PDF에 들어 있으면 파일이 1개라 나눌 수 없다 — 아래에서 안내한다)
      const batches = chunkForUpload(picked);
      const totalFiles = picked.length;
      let done = 0;
      let latest: { scans?: OmrScan[] } = {};
      const tally = { read: 0, failed: 0, lowConfidence: 0, storageSkipped: true };

      for (const [index, batch] of batches.entries()) {
        const where = batches.length > 1 ? ` (${index + 1}/${batches.length}묶음)` : "";
        const data = await uploadBatch(batch, (stage) => {
          setMessage(
            `${stage}${where} — ${done}/${totalFiles}개 완료` +
              (looksLikeMultiPagePdf(batch) ? " · 여러 장이 든 PDF는 1~2분 걸릴 수 있습니다" : ""),
          );
        });
        latest = data;
        tally.read += data.read ?? 0;
        tally.failed += data.failed ?? 0;
        tally.lowConfidence += data.lowConfidence ?? 0;
        if (!data.storageSkipped) tally.storageSkipped = false;
        done += batch.length;
      }

      setScans(latest.scans ?? []);
      setDrafts({});
      setPicked([]);
      if (fileRef.current) fileRef.current.value = "";
      const parts = [`${tally.read}장 판독 완료`];
      if (tally.failed) parts.push(`${tally.failed}장 실패`);
      if (tally.lowConfidence) parts.push(`${tally.lowConfidence}장 판독 확인 필요`);
      if (tally.storageSkipped) parts.push("원본 미보관(omr-scans 버킷 없음)");
      setMessage(parts.join(" · "));
      await loadSummary();
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
          {/*
            주관식이 있는 시험은 채점을 건너뛸 수 없다. 안 하고 성적표를 만들면
            주관식이 조용히 0점으로 들어간다. 그래서 다음 단계로 성적표가 아니라
            주관식 채점을 안내한다.
          */}
          {essayCount > 0 ? (
            <Link className="button secondary" href={`/admin/omr/${exam.id}/essay`}>
              주관식 채점 →
            </Link>
          ) : (
            <Link className="button secondary" href={`/admin/omr/${exam.id}/reports`}>
              성적표 생성 →
            </Link>
          )}
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
                답안지를 스캔한 이미지나 PDF를 올리면 바로 판독합니다.
              </p>
            </div>
          </div>

          <div
            className={`dropzone${dragOver ? " over" : ""}${uploading ? " busy" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              if (!uploading) setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (!uploading) addFiles(e.dataTransfer.files);
            }}
            onClick={() => {
              if (!uploading) fileRef.current?.click();
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileRef.current?.click();
              }
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.pdf,application/pdf"
              multiple
              disabled={uploading}
              style={{ display: "none" }}
              onChange={(e) => addFiles(e.target.files)}
            />
            <strong>파일을 끌어다 놓거나 클릭해서 선택</strong>
            <span>JPG · PNG · PDF · 여러 장 한 번에</span>
          </div>

          <ul className="dropzone-notes">
            <li>여러 장을 하나로 스캔한 PDF는 페이지마다 답안지 1장으로 자동 분리됩니다.</li>
            <li>큰 파일은 보관함으로 직접 올라가므로 용량 제한 없이 처리됩니다.</li>
            <li>원본 스캔은 7일간 보관 후 자동 삭제됩니다.</li>
          </ul>

          {picked.length > 0 ? (
            <div className="picked-files">
              <div className="picked-files-head">
                <strong>
                  선택한 파일 {picked.length}개 · {formatBytes(picked.reduce((sum, f) => sum + f.size, 0))}
                </strong>
                <button
                  className="button tiny ghost"
                  type="button"
                  disabled={uploading}
                  onClick={() => {
                    setPicked([]);
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                >
                  전체 지우기
                </button>
              </div>
              <ul>
                {picked.map((file) => (
                  <li key={`${file.name}:${file.size}`}>
                    <span className="name" title={file.name}>{file.name}</span>
                    <span className="size">{formatBytes(file.size)}</span>
                    <button
                      type="button"
                      aria-label={`${file.name} 빼기`}
                      disabled={uploading}
                      onClick={() =>
                        setPicked((prev) =>
                          prev.filter((f) => !(f.name === file.name && f.size === file.size)),
                        )
                      }
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <button
            className="button primary"
            style={{ marginTop: 14 }}
            onClick={upload}
            disabled={uploading || picked.length === 0}
          >
            {uploading
              ? "판독 중…"
              : picked.length > 0
                ? `${picked.length}장 업로드 · 판독`
                : "업로드 · 판독"}
          </button>
        </div>
      ) : null}

      <div className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">STEP 2</p>
            <h2>검수</h2>
            <p className="subtle">
              총 {scans.length}장 · 검수 필요 {pendingCount}장. 판독기가 확신하지 못한 답안지만
              사람이 확인하면 됩니다.
            </p>
          </div>
        </div>

        {summary && pendingCount > 0 ? (
          <div className="review-summary">
            <div className="review-counts">
              <span>
                총 <strong>{summary.total}</strong>장
              </span>
              <span className="ok">
                검수 완료 <strong>{summary.reviewed}</strong>장
              </span>
              <span className="auto">
                자동 확인 가능 <strong>{summary.autoReady}</strong>장
              </span>
              <span className={summary.needsPerson.length > 0 ? "need" : ""}>
                확인 필요 <strong>{summary.needsPerson.length}</strong>장
              </span>
            </div>

            <div className="review-actions">
              {summary.needsPerson.length > 0 ? (
                <label className="review-toggle">
                  <input
                    type="checkbox"
                    checked={onlyFlagged}
                    onChange={(e) => setOnlyFlagged(e.target.checked)}
                  />
                  확인 필요만 보기
                </label>
              ) : null}
              {canEdit && summary.autoReady > 0 ? (
                <button className="button primary" disabled={approving} onClick={approveAuto}>
                  {approving ? "확인 중…" : `${summary.autoReady}장 자동 확인`}
                </button>
              ) : null}
            </div>

            <p className="review-note">
              자동 확인은 <strong>판독기가 확신한 답안지만</strong> 대상입니다 — 표기가 흐리거나
              경계에 걸린 문항, 수험번호가 이상하거나 다른 답안지와 겹치는 경우는 제외됩니다.
              {summary.directoryUsed
                ? " 학생 명부에 없는 수험번호도 걸러냅니다."
                : " (학생 정보 연동을 켜면 명부에 없는 수험번호도 걸러냅니다.)"}
            </p>
          </div>
        ) : null}

        {scans.length === 0 ? (
          <p className="subtle">아직 업로드한 스캔이 없습니다.</p>
        ) : visibleScans.length === 0 ? (
          <p className="subtle">
            확인이 필요한 답안지가 없습니다.{" "}
            <button className="button tiny ghost" onClick={() => setOnlyFlagged(false)}>
              전체 보기
            </button>
          </p>
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
                {visibleScans.map((scan) => {
                  const draft = draftFor(scan);
                  const flags = flaggedQuestions(scan);
                  const marked = markedCount(draft);
                  const idFlag = hasIdFlag(scan) || !draft.studentId;
                  const dirty = Boolean(drafts[scan.id]);
                  const isOpen = expanded === scan.id;
                  const reasons = reasonsById.get(scan.id) ?? [];

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
                              <span className="status-chip danger">
                                {scan.readError.includes("다른 설정")
                                  ? "설정 다름"
                                  : scan.readError.includes("만 읽었습니다")
                                    ? "판독 확인 필요"
                                    : "판독 실패"}
                              </span>
                            ) : scan.status === "reviewed" && !dirty ? (
                              <span className="status-chip active">
                                {scan.reviewedBy === "auto" ? "자동 확인" : "검수 완료"}
                              </span>
                            ) : reasons.length > 0 ? (
                              <span className="status-chip danger">확인 필요</span>
                            ) : summary ? (
                              <span className="status-chip auto-ready">자동 확인 가능</span>
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
                              {scan.readError}
                            </p>
                          ) : reasons.length > 0 ? (
                            /* 왜 사람이 봐야 하는지를 그 자리에서 알려 준다 */
                            <ul className="review-reasons">
                              {reasons.map((reason, i) => (
                                <li key={`${reason.code}-${i}`}>
                                  {reason.label}
                                  {reason.questions?.length ? (
                                    <button
                                      className="reason-jump"
                                      onClick={() => setExpanded(scan.id)}
                                    >
                                      {reason.questions.slice(0, 12).join(", ")}번
                                      {reason.questions.length > 12 ? " 외" : ""}
                                    </button>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          ) : null}

                          {isOpen ? (
                            <div className="review-split">
                              {/* 스캔 이미지는 펼친 답안지 한 장만 불러온다 */}
                              <ScanPreview scanId={scan.id} />
                              {/*
                                답안지와 같은 순서로 늘어놓는다. 답안지는 한 열을
                                위에서 아래로 채우고 다음 열로 넘어가는데(1~15,
                                16~30), 화면이 왼쪽에서 오른쪽으로 흐르면 눈이
                                번호를 좇느라 대조가 되지 않는다.

                                열당 문항 수는 시험을 만들 때 정한 값(per_column)
                                이고 답안지도 그 값으로 열을 나눈다. 좁은 화면에서는
                                답안지를 나란히 놓고 볼 일이 없으므로 CSS에서 원래
                                흐름으로 되돌린다.
                              */}
                              <div
                                className="review-answers"
                                style={{
                                  ["--answer-rows" as string]: perColumn,
                                  ["--answer-col-w" as string]: `${64 + choices * 26}px`,
                                }}
                              >
                              {Array.from({ length: total }, (_, i) => i + 1).map((q) => {
                                const picked = toChoices(draft.answers[String(q)]);
                                // 정답이 둘 이상인 문항은 학생도 여러 개 표기하는 게 정상이다.
                                const expectMulti = isMultiAnswer(exam?.answerKey?.[String(q)]);
                                const needsCheck = flags.has(q) || picked.length === 0;
                                return (
                                  <div
                                    key={q}
                                    style={{
                                      margin: 0,
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 5,
                                      padding: "4px 6px",
                                      borderRadius: 6,
                                      background: needsCheck ? "#fdecea" : "transparent",
                                      border: expectMulti ? "1px solid #a9d3b8" : "1px solid transparent",
                                    }}
                                    title={
                                      expectMulti
                                        ? `${q}번 — '모두 고르기' 문항입니다. 학생이 칠한 보기를 모두 선택하세요.`
                                        : `${q}번`
                                    }
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
                                    <div style={{ display: "flex", gap: 3 }}>
                                      {Array.from({ length: choices }, (_, c) => c + 1).map((c) => {
                                        const on = picked.includes(c);
                                        return (
                                          <button
                                            key={c}
                                            type="button"
                                            disabled={!canEdit}
                                            // 누를 때마다 켜고 끈다 — 여러 개를 켜면 복수 표기로 저장된다.
                                            onClick={() =>
                                              setDraft(scan, {
                                                answers: {
                                                  ...draft.answers,
                                                  [String(q)]: compactMark(
                                                    on
                                                      ? picked.filter((v) => v !== c)
                                                      : [...picked, c],
                                                  ),
                                                },
                                              })
                                            }
                                            style={{
                                              width: 22,
                                              height: 22,
                                              flex: "0 0 auto",
                                              borderRadius: "50%",
                                              border: on ? "2px solid #183c73" : "1px solid #c3cad4",
                                              background: on ? "#183c73" : "white",
                                              color: on ? "white" : "#6b7480",
                                              fontSize: 11,
                                              fontWeight: 700,
                                              lineHeight: 1,
                                              padding: 0,
                                              cursor: canEdit ? "pointer" : "default",
                                            }}
                                          >
                                            {c}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                              </div>
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
