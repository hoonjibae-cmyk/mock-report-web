"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AcademyLogo from "@/components/AcademyLogo";
import { EXAM_TYPE_LABELS, type OmrExam } from "@/lib/omr-types";
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
  const [error, setError] = useState(setupError);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState("");

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
          <Link className="button secondary" href={`/admin/omr/${exam.id}/scans`}>← 스캔 · 검수</Link>
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

      <div className="panel">
        <div className="section-heading wrap">
          <div>
            <p className="eyebrow">STEP 3</p>
            <h2>학생 확인 · 성적표 생성</h2>
            <p className="subtle">
              검수 완료 {reviewed.length}건이 채점 대상입니다
              {pendingCount > 0 ? ` (검수 대기 ${pendingCount}건은 제외)` : ""} · 이름 입력{" "}
              {namedCount}/{reviewed.length}
              {existingReports > 0
                ? ` · 이 시험으로 이미 만든 성적표 ${existingReports}건 (다시 생성하면 새 링크가 추가됩니다. 이전 묶음은 웹 리포트 탭에서 삭제)`
                : ""}
            </p>
          </div>
          {canCreate ? (
            <button
              className="button primary"
              onClick={generate}
              disabled={loading || !keyReady || reviewed.length === 0}
            >
              {loading ? "채점·생성 중…" : "성적표 생성"}
            </button>
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
