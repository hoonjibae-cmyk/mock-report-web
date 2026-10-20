"use client";
import { PREFERRED_SCHEDULES, placementGrade } from "@/lib/placement-policy";
import { rereadMessage, scheduleRead, scheduleReadLabel, suggestedSchedule } from "@/lib/schedule-read";

import {
  isListeningAbsentCandidate,
  listeningMarkedCount,
  listeningQuestions,
  listeningRangeLabel,
  type ListeningMode,
} from "@/lib/listening";
import { attendanceSummary } from "@/lib/attendance";
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
  canExport: boolean;
  /** 반별 재원생 명단(학생 관리 프로그램) — 반 인원 대비 응시 현황에 쓴다 */
  rosters?: Array<{ className: string; students: Array<{ examNumber: string; name: string }> }>;
  rosterError?: string | null;
}

interface CreatedLink {
  id: string;
  studentName: string;
  school: string;
  url: string;
  pinRequired: boolean;
}

interface Draft {
  grade:string;
  preferredSchedule:string;
  name: string;
  school: string;
  phone: string;
  /** 학생 관리 프로그램의 담임·반 — 담임 선생님이 '내 반'에서 제 학생을 찾는 열쇠 */
  teacher: string;
  className: string;
}

const EMPTY_DRAFT: Draft = { grade:"",preferredSchedule:"",name: "", school: "", phone: "", teacher: "", className: "" };

/** 반배치고사 학년 보기 — lib/placement-policy의 placementGrade가 받아들이는 값과 같다 */
const PLACEMENT_GRADES = ["초6", "중1", "중2", "중3", "고1", "고2", "고3"];

export default function OmrReportBuilder({
  exam,
  initialScans,
  setupError,
  canCreate,
  canExport,
  rosters = [],
  rosterError = null,
}: Props) {
  // 답안지 목록 — '답안지에서 선호 요일 다시 읽기'가 판독 결과를 바꾸므로 상태로 든다
  const [scans, setScans] = useState<OmrScan[]>(initialScans);
  const reviewed = useMemo(
    () => scans.filter((scan) => scan.status === "reviewed" && scan.studentId),
    [scans],
  );
  const pendingCount = scans.length - reviewed.length;
  // 답안지마다 선생님이 정한 듣기 처리 방식 — 아직 안 정했으면 null(자동 판단)
  const [listeningModes, setListeningModes] = useState<Record<string, ListeningMode | null>>(() =>
    Object.fromEntries(initialScans.map((scan) => [scan.id, scan.listeningMode ?? null])),
  );
  const [listeningBusy, setListeningBusy] = useState<string | null>(null);

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [pinRequired, setPinRequired] = useState(true);
  const [existingReports, setExistingReports] = useState(0);
  // 이미 살아 있는 성적표가 있는 학생의 수험번호 — 같은 학생은 새로 만들지 않고 갱신한다
  const [existingKeys, setExistingKeys] = useState<Set<string>>(new Set());
  const [updatedCount, setUpdatedCount] = useState(0);
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

  const isPlacement=exam?.examType==='placement';
  const [placementReports,setPlacementReports]=useState<Array<{reportId:string;name:string;preferredSchedule:string;notification:string;classes:Array<{id:string;name:string;url:string}>}>>([]);
  const [rereading, setRereading] = useState(false);
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

      const found = data.students as Record<
        string,
        { name: string; school: string; grade: string; schoolLevel?:string; parentPhone: string; teacher?: string; className?: string }
      >;
      const filled = reviewed.filter(scan => scan.studentId && found[scan.studentId]).length;
      setDrafts((prev) => {
        const next = { ...prev };
        for (const scan of reviewed) {
          const info = scan.studentId ? found[scan.studentId] : undefined;
          if (!info) continue;
          const current = next[scan.id] ?? draftFor(scan);
          next[scan.id] = {
            // 이미 손으로 고쳐 둔 값이 있으면 덮어쓰지 않는다
            grade:current.grade||placementGrade(info.grade,info.schoolLevel??""),
            preferredSchedule: current.preferredSchedule || suggestedSchedule(scan),
            name: current.name.trim() || info.name,
            school: current.school.trim() || [info.school, info.grade].filter(Boolean).join(" "),
            phone: current.phone.trim() || info.parentPhone,
            // 담임·반은 학생 관리 프로그램이 원본이다. 성적표에 같이 남겨 담임이 제 반을 찾는다.
            teacher: current.teacher.trim() || (info.teacher ?? ""),
            className: current.className.trim() || (info.className ?? ""),
          };
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
        setExistingKeys(new Set<string>(Array.isArray(data.existingKeys) ? data.existingKeys : []));
        setPlacementReports(data.placementReports??[]);
        const suggestions = data.suggestions ?? {};
        setDrafts((prev) => {
          const next = { ...prev };
          for (const scan of reviewed) {
            if (next[scan.id]) continue;
            const suggestion = scan.studentId ? suggestions[scan.studentId] : undefined;
            next[scan.id] = {
              ...EMPTY_DRAFT,
              // 답안지에서 읽은 선호 요일 — 확정하지 못했으면 가장 진한 칸을 넣고 칸 아래에 안내한다
              preferredSchedule: suggestedSchedule(scan),
              name: suggestion?.name ?? "",
              school: suggestion?.school ?? "",
            };
          }
          return next;
        });
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam?.id]);

  function draftFor(scan: OmrScan): Draft {
    return drafts[scan.id] ?? { ...EMPTY_DRAFT, preferredSchedule: suggestedSchedule(scan) };
  }

  function setDraft(scanId: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({
      ...prev,
      [scanId]: { ...(prev[scanId] ?? EMPTY_DRAFT), ...patch },
    }));
  }

  const namedCount = reviewed.filter((scan) => draftFor(scan).name.trim()).length;

  // 반 인원 대비 응시 — 검수 완료 답안지가 있는 학생을 응시로 본다. 이름은 불러온
  // 학생 정보가 있으면 그것, 없으면 수험번호. 기준 반은 시험을 만들 때 고른 반.
  const attendance = exam
    ? attendanceSummary(
        reviewed.map((scan) => {
          const d = draftFor(scan);
          return {
            studentKey: scan.studentId,
            studentName: d.name.trim() || `수험번호 ${scan.studentId}`,
            className: d.className,
          };
        }),
        new Map(rosters.map((r) => [r.className, r.students])),
        exam.classNames,
      )
    : { classes: [], unlisted: [] };

  // 듣기 미응시 후보(토요모의고사) — 듣기 문항이 거의 비어 온 답안지. 선생님이
  // 성적표를 만들기 전에 '안 봤음(평균)'/'봤음(마킹대로)'을 고른다. 기본은 안 봤음.
  const listeningCandidates = exam
    ? reviewed.filter((scan) => isListeningAbsentCandidate(exam, scan) || listeningModes[scan.id] === "absent")
    : [];

  async function chooseListeningMode(scanId: string, mode: ListeningMode) {
    const before = listeningModes[scanId] ?? null;
    setListeningModes((prev) => ({ ...prev, [scanId]: mode }));
    setListeningBusy(scanId);
    try {
      const res = await fetch(`/api/admin/omr/scans/${scanId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listeningMode: mode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "듣기 처리 방식을 저장하지 못했습니다.");
    } catch (err) {
      setListeningModes((prev) => ({ ...prev, [scanId]: before }));
      setError(err instanceof Error ? err.message : "듣기 처리 방식을 저장하지 못했습니다.");
    } finally {
      setListeningBusy(null);
    }
  }

  /**
   * 보관된 스캔 원본으로 선호 요일 칸만 다시 읽는다(반배치고사).
   *
   * 선호 요일 칸이 생기기 전에 올린 답안지, 판독 서버가 갱신되기 전에 올린 답안지는
   * 값이 비어 있다. 다시 올리면 검수를 처음부터 해야 하지만, 이 길은 수험번호·답안·
   * 검수 상태를 그대로 두고 선호 요일만 채운다.
   */
  async function rereadSchedules() {
    if (!exam) return;
    setRereading(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/admin/omr/exams/${exam.id}/scans/preferred-schedule`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "선호 요일을 다시 읽지 못했습니다.");
      const next: OmrScan[] = Array.isArray(data.scans) ? data.scans : [];
      const before = new Map(scans.map((scan) => [scan.id, suggestedSchedule(scan)]));
      setScans(next);
      // 손으로 고른 값은 두고, 비어 있거나 이전 판독값 그대로인 칸만 새 판독값으로 바꾼다
      setDrafts((prev) => {
        const out = { ...prev };
        for (const scan of next) {
          const draft = out[scan.id];
          if (!draft) continue;
          const old = before.get(scan.id) ?? "";
          if (draft.preferredSchedule === "" || draft.preferredSchedule === old) {
            out[scan.id] = { ...draft, preferredSchedule: suggestedSchedule(scan) };
          }
        }
        return out;
      });
      setMessage(rereadMessage(data.summary ?? {}, data.unavailable ?? [], data.problems ?? []));
    } catch (err) {
      setError(err instanceof Error ? err.message : "선호 요일을 다시 읽는 중 오류가 발생했습니다.");
    } finally {
      setRereading(false);
    }
  }

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

  /** 이번에 새로 만들 성적표 수 — 나머지는 이미 있어 내용만 갱신된다 */
  const newReportCount = reviewed.filter((scan) => !existingKeys.has(scan.studentId as string)).length;
  const refreshCount = reviewed.length - newReportCount;

  async function generate(selectedScanId?:string) {
    if (!exam) return;
    if (!isPlacement && reviewed.length > 0 && newReportCount === 0) {
      const ok = window.confirm(
        "모든 답안지에 이미 성적표가 있습니다. 새로 만들지 않고(중복 생성 안 함) 점수·석차 등 내용만 최신으로 갱신합니다.\n" +
          "링크·담임 의견·발송 기록은 그대로입니다. 진행할까요?",
      );
      if (!ok) return;
    }
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/admin/omr/exams/${exam.id}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pinRequired,
          students: reviewed.filter(scan=>!selectedScanId||scan.id===selectedScanId).map((scan) => ({
            scanId: scan.id,
            grade:draftFor(scan).grade,
            preferredSchedule:draftFor(scan).preferredSchedule,
            name: draftFor(scan).name,
            school: draftFor(scan).school,
            phone: draftFor(scan).phone,
            teacher: draftFor(scan).teacher,
            className: draftFor(scan).className,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "성적표를 생성하지 못했습니다.");
      if(isPlacement){
        setPlacementReports(data.placementReports??[]);
        const rows=data.placementRequests??[],sent=rows.filter((r:{notification:string})=>r.notification==='sent').length,queued=rows.filter((r:{notification:string})=>['pending','sending'].includes(r.notification)).length,held=rows.filter((r:{notification:string})=>['blocked','error','uncertain'].includes(r.notification)).length;
        setMessage(`반배정 요청 ${rows.length}명 저장 · 신규생 슬랙 알림 ${sent}명${queued?` · 순차 전송 대기 ${queued}명`:''}${held?` · 알림 확인 필요 ${held}명`:''}. 반배정 후 아래에서 성적표를 출력할 수 있습니다.`);
        return;
      }
      const createdCount = data.reports?.length ?? 0;
      const refreshed = Array.isArray(data.updated) ? data.updated.length : 0;
      const duplicates: string[] = Array.isArray(data.duplicates) ? data.duplicates : [];
      setCreated(data.reports ?? []);
      setUpdatedCount(refreshed);
      setExistingReports((prev) => prev + createdCount);
      setExistingKeys((prev) => {
        const next = new Set(prev);
        for (const scan of reviewed) if (scan.studentId) next.add(scan.studentId);
        return next;
      });
      const tail = ` (응시 ${data.cohort?.count}명 · 평균 ${data.cohort?.mean}점)`;
      const dupNote =
        duplicates.length > 0
          ? ` · 같은 수험번호 답안지 ${duplicates.length}건(${duplicates.join(", ")})은 마지막 것만 썼습니다.`
          : "";
      setMessage(
        createdCount === 0
          ? `이미 성적표가 있는 학생 ${refreshed}명 — 새로 만들지 않았습니다(중복 생성 방지). 점수·석차 등 내용만 최신으로 갱신했고 링크·담임 의견·발송 기록은 그대로입니다.${tail}${dupNote}`
          : `새 성적표 ${createdCount}건을 만들었습니다${refreshed > 0 ? ` · 이미 있던 ${refreshed}건은 내용만 갱신했습니다` : ""}.${tail}${dupNote}`,
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
            <AcademyLogo size="large" href="/admin" />
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
          <AcademyLogo size="large" href="/admin" />
          <div>
            <strong>{isPlacement?'반배정 요청 · 성적표 출력':'성적표 생성'}</strong>
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
          <Link className="button secondary" href={`/admin/omr/${exam.id}/summary`}>결과 요약</Link>
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
            <h2>{isPlacement?'학생 확인 · 반배정 요청':'학생 확인 · 성적표 생성'}</h2>
            <p className="subtle">
              검수 완료 {reviewed.length}건이 채점 대상입니다
              {pendingCount > 0 ? ` (검수 대기 ${pendingCount}건은 제외)` : ""} · 이름 입력{" "}
              {namedCount}/{reviewed.length}
              {existingReports > 0
                ? ` · 이미 만든 성적표 ${existingReports}건 — 다시 눌러도 같은 학생의 성적표는 새로 만들지 않고 내용만 갱신합니다(링크·담임 의견·발송 기록 유지)`
                : ""}
            </p>
            <p className="subtle">
              답안지에서 수험번호{isPlacement?'와 선호 요일을':'를'} 읽습니다.{" "}
              <strong>학생 정보 불러오기</strong>를 누르면 학생 관리 프로그램에서 이름·학교·학부모
              연락처를 가져와 채웁니다(직접 고쳐 둔 칸은 그대로 둡니다).
              {directoryConfigured === false ? " — 아직 연동이 설정되지 않았습니다." : ""}
            </p>
            {isPlacement ? (
              <p className="subtle">
                선호 요일은 답안지 표기를 읽어 채웁니다. 표기가 흐리거나 겹치면 가장 진한 칸을 넣고 칸 아래에
                안내를 달아 두니 확인해 주세요. 선호 요일 칸이 생기기 전에 올린 답안지는{" "}
                <strong>답안지에서 선호 요일 다시 읽기</strong>로 채울 수 있습니다(수험번호·답안·검수 상태는 그대로).
              </p>
            ) : null}
            {canExport && existingReports > 0 ? (
              <p className="subtle">
                <strong>성적 엑셀 받기</strong>를 누르면 응시생 전원의{" "}
                <strong>학생명 · 총점수 · 영역별 점수 · 문항별 정답 여부</strong>가 엑셀 한 장으로
                나옵니다(성적표에 실린 점수 그대로). 문항 칸은 맞으면 O, 틀리면 X(고른 번호)이고 둘째 줄이
                정답입니다. 영역 열은 이 시험에 적어 둔 영역을 따릅니다 — 듣기·독해로
                나눠 두었다면 그 두 칸이 나옵니다.
              </p>
            ) : null}
          </div>
          <div className="toolbar" style={{ flexWrap: "wrap" }}>
            {canCreate ? (
              <>
                <button
                  className="button secondary"
                  type="button"
                  onClick={loadStudents}
                  disabled={directoryLoading || reviewed.length === 0}
                  title="수험번호로 학생 관리 프로그램에서 이름·학교·연락처를 불러옵니다"
                >
                  {directoryLoading ? "불러오는 중…" : "학생 정보 불러오기"}
                </button>
                {isPlacement ? (
                  <button
                    className="button secondary"
                    type="button"
                    onClick={rereadSchedules}
                    disabled={rereading || scans.length === 0}
                    title="보관된 스캔 원본으로 선호 요일 칸만 다시 읽습니다. 수험번호·답안·검수 상태는 바뀌지 않습니다."
                  >
                    {rereading ? "다시 읽는 중…" : "답안지에서 선호 요일 다시 읽기"}
                  </button>
                ) : null}
                <button
                  className="button primary"
                  onClick={()=>generate()}
                  disabled={loading || !keyReady || !referenceReady || reviewed.length === 0}
                  title={!referenceReady ? "시험 기반 정보를 먼저 올려 주세요." : undefined}
                >
                  {isPlacement?(loading?"반배정 요청 중…":"반배정 요청하기"):loading
                    ? "채점·생성 중…"
                    : reviewed.length > 0 && newReportCount === 0
                      ? "성적표 갱신 (새 성적표 없음)"
                      : refreshCount > 0
                        ? `성적표 생성 (새로 ${newReportCount}장 · 갱신 ${refreshCount}장)`
                        : "성적표 생성"}
                </button>
              </>
            ) : null}
            {/* 학생 이름은 성적표를 만들 때 들어오므로, 그 전에는 뽑을 표가 없다 */}
            {canExport && existingReports > 0 ? (
              <a
                className="button secondary"
                href={`/api/admin/omr/exams/${exam.id}/scores`}
                title="응시생 전원의 학생명·총점수·영역별 점수·문항별 정답 여부(O / X(고른 번호))를 엑셀 한 장으로 내려받습니다"
              >
                성적 엑셀 받기
              </a>
            ) : null}
          </div>
        </div>

        {reviewed.length === 0 ? (
          <p className="subtle">
            검수 완료된 답안이 없습니다.{" "}
            <Link href={`/admin/omr/${exam.id}/scans`}>스캔 · 검수로 이동 →</Link>
          </p>
        ) : (
          <>
            {listeningCandidates.length > 0 ? (
              <div className="listening-box">
                <div className="attendance-box-head">
                  <strong>듣기 미응시 확인</strong>
                  <span className="subtle">
                    듣기 문항({listeningRangeLabel(exam)}) 중 마킹이 거의 없는 답안지입니다. 개별로 응시해 듣기를 못 본
                    학생이면 듣기 점수를 듣기를 본 학생들의 평균으로 산출합니다(기본). 실제로 듣기를 봤다면 오른쪽을 고르세요.
                  </span>
                </div>
                <ul className="listening-list">
                  {listeningCandidates.map((scan) => {
                    const d = draftFor(scan);
                    const mode = listeningModes[scan.id] ?? "absent";
                    const marked = listeningMarkedCount(exam, scan);
                    const total = listeningQuestions(exam).length;
                    return (
                      <li key={scan.id}>
                        <div className="listening-who">
                          <strong>{d.name.trim() || `수험번호 ${scan.studentId}`}</strong>
                          <span className="subtle">
                            {d.name.trim() ? `${scan.studentId} · ` : ""}듣기 {total}문항 중 {marked}문항 마킹
                          </span>
                        </div>
                        <span className="trend-seg listening-seg" role="group" aria-label="듣기 처리 방식">
                          <button
                            type="button"
                            className={mode === "absent" ? "on" : ""}
                            disabled={listeningBusy === scan.id || !canCreate}
                            onClick={() => void chooseListeningMode(scan.id, "absent")}
                            title="듣기 문항은 채점하지 않고, 듣기 점수는 듣기를 본 학생들의 평균을 적용합니다"
                          >
                            듣기 안 봤음 → 반 평균으로 산출
                          </button>
                          <button
                            type="button"
                            className={mode === "marked" ? "on" : ""}
                            disabled={listeningBusy === scan.id || !canCreate}
                            onClick={() => void chooseListeningMode(scan.id, "marked")}
                            title="빈 문항은 무응답(0점)으로 두고 마킹한 대로 채점합니다"
                          >
                            듣기 봤음 → 마킹한 대로 채점
                          </button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p className="subtle" style={{ marginTop: 8 }}>
                  듣기 평균은 듣기를 본 학생들만으로 계산하며, 안 본 학생은 듣기 문항 정답률과 듣기 평균의 분모에서
                  빠집니다. 결과 요약에는 바로, 성적표에는 만드는 시점에 반영됩니다 — 나중에 듣기를 본 학생이 더
                  들어오면 성적표를 다시 만들어 주세요. 미응시 학생의 듣기 점수가 새 평균으로 바뀝니다.
                </p>
              </div>
            ) : null}

            {exam.examType === "monthly" || exam.classNames.length > 0 ? (
              <div className="attendance-box">
                <div className="attendance-box-head">
                  <strong>반 인원 · 응시 현황</strong>
                  <span className="subtle">
                    반 전체 인원은 학생 관리 프로그램의 지금 재원생 기준 · 검수 완료 답안지가 있으면 응시
                  </span>
                </div>
                {rosterError ? (
                  <p className="subtle">반 명단을 확인하지 못했습니다 — {rosterError}</p>
                ) : exam.classNames.length === 0 ? (
                  <p className="subtle">이 시험은 만들 때 반을 고르지 않아 반 인원과 견줄 수 없습니다.</p>
                ) : attendance.classes.length === 0 ? (
                  <p className="subtle">반 명단이 비어 있습니다.</p>
                ) : (
                  <div className="table-scroll">
                    <table className="admin-table attendance-table">
                      <thead>
                        <tr>
                          <th>반</th>
                          <th>반 전체 인원</th>
                          <th>시험 응시 인원</th>
                          <th>미응시 인원 (이름)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {attendance.classes.map((c) => (
                          <tr key={c.className}>
                            <td>
                              <strong>{c.className}</strong>
                            </td>
                            <td>{c.total}명</td>
                            <td>{c.present}명</td>
                            <td>
                              {c.absent.length === 0 ? (
                                <span className="attendance-ok">전원 응시</span>
                              ) : (
                                <>
                                  <strong className="attendance-absent">{c.absent.length}명</strong>
                                  <span className="attendance-names">{c.absent.map((s) => s.name).join(", ")}</span>
                                </>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {!rosterError && attendance.unlisted.length > 0 ? (
                  <p className="subtle attendance-unlisted">
                    명단에 없는 응시자 {attendance.unlisted.length}명: <strong>{attendance.unlisted.join(", ")}</strong> — 반을
                    옮겼거나 퇴원 처리된 학생, 또는 시험에 고른 반이 아닌 학생일 수 있습니다.
                  </p>
                ) : null}
              </div>
            ) : null}

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
                    {isPlacement ? <th>학년 · 선호 요일</th> : null}
                    {isPlacement ? <th>반배정</th> : null}
                    <th>담임 · 반</th>
                  </tr>
                </thead>
                <tbody>
                  {reviewed.map((scan) => {
                    const draft = draftFor(scan);
                    // 반배치고사 — 답안지의 선호 요일 칸을 판독기가 어떻게 읽었는지
                    const read = isPlacement ? scheduleRead(scan) : null;
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
                        {isPlacement && read ? (
                          <>
                            <td className="placement-cell">
                              <div className="placement-fields">
                                <label>
                                  <span>학년</span>
                                  <select
                                    aria-label={`${draft.name || scan.studentId} 학년`}
                                    className={draft.grade ? undefined : "missing"}
                                    value={draft.grade}
                                    disabled={!canCreate}
                                    onChange={(e) => setDraft(scan.id, { grade: e.target.value })}
                                  >
                                    <option value="">선택</option>
                                    {PLACEMENT_GRADES.map((g) => (
                                      <option key={g}>{g}</option>
                                    ))}
                                  </select>
                                </label>
                                <label>
                                  <span>선호 요일</span>
                                  <select
                                    aria-label={`${draft.name || scan.studentId} 선호 요일`}
                                    className={draft.preferredSchedule ? undefined : "missing"}
                                    value={draft.preferredSchedule}
                                    disabled={!canCreate}
                                    onChange={(e) => setDraft(scan.id, { preferredSchedule: e.target.value })}
                                  >
                                    <option value="">선택</option>
                                    {PREFERRED_SCHEDULES.map((d) => (
                                      <option key={d}>{d}</option>
                                    ))}
                                  </select>
                                </label>
                              </div>
                              <p className={`schedule-read ${read.kind}`}>{scheduleReadLabel(read)}</p>
                            </td>
                            <td>
                              <button
                                className="button small secondary"
                                type="button"
                                disabled={!canCreate || loading}
                                title="이 학생의 반배정만 요청합니다(다른 학생은 그대로)"
                                onClick={() => generate(scan.id)}
                              >
                                이 학생만 요청
                              </button>
                            </td>
                          </>
                        ) : null}
                        <td>
                          {/* 담임 선생님이 '내 반'에서 이 학생을 찾는 열쇠다. 인사 프로그램의 이름과 같아야 한다. */}
                          <div style={{ display: "flex", gap: 6 }}>
                            <input
                              value={draft.teacher}
                              disabled={!canCreate}
                              placeholder="담임"
                              title="학생 관리 프로그램의 담임. 인사 프로그램의 이름과 같아야 그 선생님의 '내 반'에 보입니다."
                              style={{ width: 90 }}
                              onChange={(e) => setDraft(scan.id, { teacher: e.target.value })}
                            />
                            <input
                              value={draft.className}
                              disabled={!canCreate}
                              placeholder="반"
                              style={{ width: 100 }}
                              onChange={(e) => setDraft(scan.id, { className: e.target.value })}
                            />
                          </div>
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

      {isPlacement&&<section className="panel"><h2>반배정 요청 · 성적표 출력</h2><p>신규 응시생만 슬랙으로 알립니다. 반배정은 클래스핏에서 진행하며 배정된 반의 평균으로 출력합니다.</p><a className="button secondary" href="https://classfit.yussam.com" target="_blank" rel="noreferrer">반편성관리 열기</a><button className="button secondary" onClick={async()=>{const r=await fetch(`/api/admin/omr/exams/${exam.id}/reports`);const data=await r.json();if(r.ok)setPlacementReports(data.placementReports??[]);}}>배정 상태 새로고침</button>{placementReports.map(r=><div key={r.reportId} className="toolbar"><b>{r.name}</b><span>선호 {r.preferredSchedule}</span><span>{({sent:'슬랙 알림 완료',skipped:'재원생 · 알림 제외',blocked:'학생 정보 확인 필요',error:'알림 재시도 필요',sending:'알림 처리 중',uncertain:'채널 전송 여부 확인 필요',pending:'알림 대기'} as Record<string,string>)[r.notification]??r.notification}</span>{r.classes.length?r.classes.map(c=><a className="button secondary" key={c.id} href={c.url} target="_blank" rel="noreferrer">{c.name} 성적표 출력</a>):<span>반배정 대기</span>}</div>)}</section>}
      {created.length > 0 ? (
        <section className="panel result-panel">
          <div className="section-heading wrap">
            <div>
              <p className="eyebrow">완료</p>
              <h2>새로 만든 성적표 링크 {created.length}건</h2>
              {updatedCount > 0 ? (
                <p className="subtle">이미 있던 {updatedCount}건은 기존 링크 그대로 내용만 갱신했습니다(웹 리포트 탭에서 확인).</p>
              ) : null}
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
