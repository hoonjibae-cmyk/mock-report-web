"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import AcademyLogo from "@/components/AcademyLogo";
import { EXAM_TYPE_LABELS, mockSubjectOf, type OmrExam } from "@/lib/omr-types";
import type { OmrScan } from "@/lib/omr-scans";

interface Props {
  exam: OmrExam | null;
  initialScans: OmrScan[];
  setupError: string;
  canCreate: boolean;
}

interface CreatedLink {
  id: string;
  studentName: string;
  school: string;
  url: string;
  pinRequired: boolean;
}

interface Draft {
  name: string;
  school: string;
  phone: string;
}

export default function OmrReportBuilder({ exam, initialScans, setupError, canCreate }: Props) {
  const reviewed = useMemo(
    () => initialScans.filter((scan) => scan.status === "reviewed" && scan.studentId),
    [initialScans],
  );
  const pendingCount = initialScans.length - reviewed.length;

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [pinRequired, setPinRequired] = useState(true);
  const [existingReports, setExistingReports] = useState(0);
  const [created, setCreated] = useState<CreatedLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [essayUploading, setEssayUploading] = useState(false);
  const essayRef = useRef<HTMLInputElement>(null);
  // 국영수 모의고사 3단계 — 시험 기반 정보(문항분류표·전국비교기준)
  const [reference, setReference] = useState(exam?.mockReference ?? null);
  const [refUploading, setRefUploading] = useState(false);
  const refInputRef = useRef<HTMLInputElement>(null);
  // 학생 관리 프로그램(Student-Card) 연동 — 수험번호로 이름·학교·연락처를 불러온다
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryConfigured, setDirectoryConfigured] = useState<boolean | null>(null);
  const [error, setError] = useState(setupError);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState("");

  const isMock = exam?.examType === "mock";
  const mockSubject = mockSubjectOf(exam?.subject);
  const referenceReady = !isMock || Boolean(reference);

  /** 검수 완료된 수험번호를 모두 조회해 이름·학교·연락처를 채운다 */
  async function loadStudents() {
    const numbers = reviewed.map((scan) => scan.studentId).filter((v): v is string => Boolean(v));
    if (numbers.length === 0) return;
    setDirectoryLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/admin/students/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examNumbers: numbers }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "학생 정보를 불러오지 못했습니다.");
      setDirectoryConfigured(data.configured);
      if (!data.configured) {
        setError(
          "학생 관리 프로그램 연동이 설정되어 있지 않습니다. Vercel 환경변수 STUDENT_API_URL·STUDENT_API_KEY를 추가해 주세요.",
        );
        return;
      }
      if (data.error) {
        setError(data.error);
        return;
      }

      const found = data.students as Record<string, { name: string; school: string; grade: string; parentPhone: string }>;
      let filled = 0;
      setDrafts((prev) => {
        const next = { ...prev };
        for (const scan of reviewed) {
          const info = scan.studentId ? found[scan.studentId] : undefined;
          if (!info) continue;
          const current = next[scan.id] ?? draftFor(scan);
          next[scan.id] = {
            // 이미 손으로 고쳐 둔 값이 있으면 덮어쓰지 않는다
            name: current.name.trim() || info.name,
            school: current.school.trim() || [info.school, info.grade].filter(Boolean).join(" "),
            phone: current.phone.trim() || info.parentPhone,
          };
          filled += 1;
        }
        return next;
      });

      const missing: string[] = data.missing ?? [];
      const parts = [`${filled}명 정보를 불러왔습니다.`];
      if (missing.length > 0) {
        parts.push(
          `학생 관리 프로그램에서 찾지 못한 수험번호 ${missing.length}개: ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? " 외" : ""}`,
        );
      }
      setMessage(parts.join(" "));
    } catch (err) {
      setError(err instanceof Error ? err.message : "학생 정보 조회 중 오류가 발생했습니다.");
    } finally {
      setDirectoryLoading(false);
    }
  }

  async function uploadReference(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !exam) return;
    setRefUploading(true);
    setError("");
    setMessage("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/admin/omr/exams/${exam.id}/reference`, {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "시험 기반 정보를 반영하지 못했습니다.");
      setReference(data.exam?.mockReference ?? null);
      const parts = [
        `${data.reference.subjectLabel} 문항 ${data.reference.itemCount}개 · 등급컷 ${data.reference.gradeCutCount}단계 반영`,
      ];
      if (data.reference.nationalAverage !== null) {
        parts.push(`전국 평균 ${data.reference.nationalAverage}점`);
      }
      if (data.appliedKey > 0) parts.push(`정답 ${data.appliedKey}문항도 함께 채움`);
      setMessage(parts.join(" · "));
    } catch (err) {
      setError(err instanceof Error ? err.message : "업로드 중 오류가 발생했습니다.");
    } finally {
      setRefUploading(false);
      if (refInputRef.current) refInputRef.current.value = "";
    }
  }

  const essayCount =
    typeof exam?.omrConfig?.essay_count === "number" ? exam.omrConfig.essay_count : 0;
  const keyFilled = Object.keys(exam?.answerKey ?? {}).length;
  const keyReady = exam ? keyFilled >= exam.numQuestions : false;

  // 이전 성적표에서 수험번호 → 이름·학교 자동 제안
  useEffect(() => {
    if (!exam) return;
    fetch(`/api/admin/omr/exams/${exam.id}/reports`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.ok) return;
        setExistingReports(data.existingReports ?? 0);
        const suggestions = data.suggestions ?? {};
        setDrafts((prev) => {
          const next = { ...prev };
          for (const scan of reviewed) {
            if (next[scan.id]) continue;
            const suggestion = scan.studentId ? suggestions[scan.studentId] : undefined;
            next[scan.id] = {
              name: suggestion?.name ?? "",
              school: suggestion?.school ?? "",
              phone: "",
            };
          }
          return next;
        });
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam?.id]);

  function draftFor(scan: OmrScan): Draft {
    return drafts[scan.id] ?? { name: "", school: "", phone: "" };
  }

  function setDraft(scanId: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({
      ...prev,
      [scanId]: { ...(prev[scanId] ?? { name: "", school: "", phone: "" }), ...patch },
    }));
  }

  const namedCount = reviewed.filter((scan) => draftFor(scan).name.trim()).length;

  async function uploadEssay() {
    const file = essayRef.current?.files?.[0];
    if (!file || !exam) return;
    setEssayUploading(true);
    setError("");
    setMessage("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/admin/omr/exams/${exam.id}/essay`, {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "서술형 점수를 반영하지 못했습니다.");
      const extra =
        data.unknownKeys?.length > 0
          ? ` (찾지 못한 수험번호: ${data.unknownKeys.join(", ")})`
          : "";
      setMessage(`서술형 점수를 ${data.updated}명에게 반영했습니다.${extra} 이제 성적표를 생성하세요.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "서술형 업로드 중 오류가 발생했습니다.");
    } finally {
      setEssayUploading(false);
      if (essayRef.current) essayRef.current.value = "";
    }
  }

  async function generate() {
    if (!exam) return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/admin/omr/exams/${exam.id}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pinRequired,
          students: reviewed.map((scan) => ({
            scanId: scan.id,
            name: draftFor(scan).name,
            school: draftFor(scan).school,
            phone: draftFor(scan).phone,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "성적표를 생성하지 못했습니다.");
      setCreated(data.reports ?? []);
      setExistingReports((prev) => prev + (data.reports?.length ?? 0));
      setMessage(
        `${data.reports?.length ?? 0}명의 성적표 링크를 생성했습니다. (응시 ${data.cohort?.count}명 · 평균 ${data.cohort?.mean}점)`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "성적표 생성 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function copyLink(url: string, id: string) {
    await navigator.clipboard.writeText(url);
    setCopied(id);
    window.setTimeout(() => setCopied(""), 1500);
  }

  if (!exam) {
    return (
      <div className="admin-shell">
        <header className="admin-header">
          <div className="brand-lockup">
            <AcademyLogo size="large" />
            <div>
              <strong>성적표 생성</strong>
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
            <strong>성적표 생성</strong>
            <span>
              {EXAM_TYPE_LABELS[exam.examType]} · {exam.title}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="button ghost" href="/admin/omr">← 시험 목록</Link>
          {/* 주관식이 있으면 바로 앞 단계는 스캔이 아니라 주관식 채점이다 */}
          <Link
            className="button secondary"
            href={`/admin/omr/${exam.id}/${essayCount > 0 ? "essay" : "scans"}`}
          >
            ← {essayCount > 0 ? "주관식 채점" : "스캔 · 검수"}
          </Link>
          <Link className="button secondary" href={`/admin/omr/${exam.id}/comments`}>담임 의견 →</Link>
          <Link className="button secondary" href={`/admin/omr/${exam.id}/send`}>알림톡 발송 →</Link>
        </div>
      </header>

      {error ? <p className="form-error block">{error}</p> : null}
      {message ? <p className="status-message">{message}</p> : null}

      {!keyReady ? (
        <div className="panel">
          <div className="permission-denied">
            <strong>정답이 아직 {keyFilled}/{exam.numQuestions}문항입니다.</strong>
            <p>
              채점하려면 정답 입력을 먼저 완료해 주세요.{" "}
              <Link href={`/admin/omr/${exam.id}/key`}>정답 입력으로 이동 →</Link>
            </p>
          </div>
        </div>
      ) : null}

      {isMock ? (
        <div className="panel">
          <div className="section-heading wrap">
            <div>
              <p className="eyebrow">STEP 3 · 국영수 모의고사</p>
              <h2>시험 기반 정보</h2>
              <p className="subtle">
                학원 OMR 채점만으로는 전국 등급·상위 추정과 문항 분류별 분석을 만들 수 없습니다.
                <strong> 문항분류표</strong>와 <strong>전국비교기준</strong> 탭이 든 엑셀을 올리면
                성적표에 전국 비교가 실립니다.
                {mockSubject ? ` 이 시험은 ${mockSubject.label} 과목이며, 파일에서 ${mockSubject.label} 행만 읽습니다.` : ""}
              </p>
            </div>
            {canCreate ? (
              <div className="toolbar" style={{ flexWrap: "wrap" }}>
                <a className="button secondary" href={`/api/admin/omr/exams/${exam.id}/reference`}>
                  양식 받기
                </a>
                <input
                  ref={refInputRef}
                  type="file"
                  accept=".xlsx"
                  style={{ display: "none" }}
                  onChange={uploadReference}
                />
                <button
                  className="button primary"
                  type="button"
                  disabled={refUploading}
                  onClick={() => refInputRef.current?.click()}
                >
                  {refUploading ? "반영 중…" : reference ? "다시 올리기" : "엑셀 업로드"}
                </button>
              </div>
            ) : null}
          </div>

          {reference ? (
            <div className="info-box">
              <strong>반영 완료 — {reference.subjectLabel}</strong>
              <p>
                문항 분류 {reference.items.length}개 · 전국 등급컷 {reference.gradeCuts.length}단계
                {reference.nationalAverage !== null ? ` · 전국 평균 ${reference.nationalAverage}점` : ""}
                <br />
                {reference.filename} · {new Date(reference.uploadedAt).toLocaleString("ko-KR")}
                {reference.uploadedBy ? ` · ${reference.uploadedBy}` : ""}
              </p>
            </div>
          ) : (
            <div className="permission-denied">
              <strong>아직 올리지 않았습니다.</strong>
              <p>
                시험 기반 정보를 올려야 성적표를 만들 수 있습니다. 정답을 아직 입력하지 않았다면
                이 파일의 정답·배점·영역으로 함께 채워집니다.
              </p>
            </div>
          )}
        </div>
      ) : null}

      {essayCount > 0 && canCreate ? (
        <div className="panel">
          <div className="section-heading wrap">
            <div>
              <p className="eyebrow">서술형</p>
              <h2>주관식 채점</h2>
              <p className="subtle">
                서술형 {essayCount}문항은 OMR로 읽을 수 없어 직접 채점합니다. 채점표를 내려받으면
                학생별로 문항 점수만 채우면 되고, 업로드하면 점수가 반영됩니다. 채점하지 않으면
                해당 문항은 0점으로 처리됩니다.
              </p>
            </div>
            <div className="toolbar" style={{ flexWrap: "wrap" }}>
              <a className="button secondary" href={`/api/admin/omr/exams/${exam.id}/essay`}>
                채점표 받기
              </a>
              <input
                ref={essayRef}
                type="file"
                accept=".xlsx"
                style={{ display: "none" }}
                onChange={uploadEssay}
              />
              <button
                className="button secondary"
                type="button"
                disabled={essayUploading}
                onClick={() => essayRef.current?.click()}
              >
                {essayUploading ? "반영 중…" : "채점표 업로드"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="panel">
        <div className="section-heading wrap">
          <div>
            <p className="eyebrow">{isMock ? "STEP 4" : "STEP 3"}</p>
            <h2>학생 확인 · 성적표 생성</h2>
            <p className="subtle">
              검수 완료 {reviewed.length}건이 채점 대상입니다
              {pendingCount > 0 ? ` (검수 대기 ${pendingCount}건은 제외)` : ""} · 이름 입력{" "}
              {namedCount}/{reviewed.length}
              {existingReports > 0
                ? ` · 이 시험으로 이미 만든 성적표 ${existingReports}건 (다시 생성하면 새 링크가 추가됩니다. 이전 묶음은 웹 리포트 탭에서 삭제)`
                : ""}
            </p>
            <p className="subtle">
              답안지에서 읽히는 학생 정보는 <strong>수험번호</strong> 하나뿐입니다.{" "}
              <strong>학생 정보 불러오기</strong>를 누르면 학생 관리 프로그램에서 이름·학교·학부모
              연락처를 가져와 채웁니다(직접 고쳐 둔 칸은 그대로 둡니다).
              {directoryConfigured === false ? " — 아직 연동이 설정되지 않았습니다." : ""}
            </p>
          </div>
          {canCreate ? (
            <div className="toolbar" style={{ flexWrap: "wrap" }}>
              <button
                className="button secondary"
                type="button"
                onClick={loadStudents}
                disabled={directoryLoading || reviewed.length === 0}
                title="수험번호로 학생 관리 프로그램에서 이름·학교·연락처를 불러옵니다"
              >
                {directoryLoading ? "불러오는 중…" : "학생 정보 불러오기"}
              </button>
              <button
                className="button primary"
                onClick={generate}
                disabled={loading || !keyReady || !referenceReady || reviewed.length === 0}
                title={!referenceReady ? "시험 기반 정보를 먼저 올려 주세요." : undefined}
              >
                {loading ? "채점·생성 중…" : "성적표 생성"}
              </button>
            </div>
          ) : null}
        </div>

        {reviewed.length === 0 ? (
          <p className="subtle">
            검수 완료된 답안이 없습니다.{" "}
            <Link href={`/admin/omr/${exam.id}/scans`}>스캔 · 검수로 이동 →</Link>
          </p>
        ) : (
          <>
            <label className="checkbox-row" style={{ marginBottom: 12 }}>
              <input
                type="checkbox"
                checked={pinRequired}
                onChange={(e) => setPinRequired(e.target.checked)}
              />
              <span>학부모 휴대전화 뒤 4자리로 성적표 보호 (전화번호를 입력한 학생만 적용)</span>
            </label>

            <div className="table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>수험번호</th>
                    <th>이름 *</th>
                    <th>학교 · 학년</th>
                    <th>학부모 연락처(선택 · PIN용)</th>
                  </tr>
                </thead>
                <tbody>
                  {reviewed.map((scan) => {
                    const draft = draftFor(scan);
                    return (
                      <tr key={scan.id}>
                        <td>
                          <strong>{scan.studentId}</strong>
                          <span>{scan.filename}</span>
                        </td>
                        <td>
                          <input
                            value={draft.name}
                            disabled={!canCreate}
                            placeholder="이름"
                            style={{
                              width: 120,
                              borderColor: draft.name.trim() ? undefined : "#c0392b",
                            }}
                            onChange={(e) => setDraft(scan.id, { name: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            value={draft.school}
                            disabled={!canCreate}
                            placeholder="예: 목운중 2"
                            style={{ width: 140 }}
                            onChange={(e) => setDraft(scan.id, { school: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            value={draft.phone}
                            disabled={!canCreate}
                            inputMode="numeric"
                            placeholder="010-0000-0000"
                            style={{ width: 150 }}
                            onChange={(e) => setDraft(scan.id, { phone: e.target.value })}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {created.length > 0 ? (
        <section className="panel result-panel">
          <div className="section-heading wrap">
            <div>
              <p className="eyebrow">완료</p>
              <h2>학생별 성적표 링크</h2>
            </div>
            <Link className="button secondary" href="/admin/reports">웹 리포트 관리로 이동</Link>
          </div>
          <div className="link-cards">
            {created.map((report) => (
              <article className="link-card" key={report.id}>
                <div>
                  <strong>{report.studentName}</strong>
                  <span>
                    {report.school || "학교 미입력"} · {report.pinRequired ? "PIN 보호" : "PIN 없음"}
                  </span>
                </div>
                <div className="link-actions">
                  <a className="button small ghost" href={report.url} target="_blank" rel="noreferrer">
                    웹 보기
                  </a>
                  <button
                    className="button small primary"
                    onClick={() => copyLink(report.url, report.id)}
                  >
                    {copied === report.id ? "복사됨" : "링크 복사"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
