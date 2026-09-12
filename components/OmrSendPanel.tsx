"use client";

// 성적표 알림톡 발송 화면.
//
// 발송은 되돌릴 수 없다. 그래서 이 화면은 "빨리 보내기"보다 "잘못 보내지
// 않기"를 우선한다.
//   - 못 보내는 건은 이유와 함께 회색으로 보여 준다(숨기지 않는다).
//   - 이미 보낸 건은 기본으로 선택하지 않는다.
//   - 실제로 나갈 문구를 보내기 전에 그대로 보여 준다.
//   - 확정 발송에는 건수를 적은 한 번의 확인을 둔다.
//
// 받는 사람은 '학부모만' 또는 '학부모 + 학생' 둘 중 하나다. 학부모는 언제나
// 받는다 — 성적표는 학부모에게 가는 것이 기본이고, 학생 본인은 거기에 얹는
// 선택이다. 학생 한 줄에 두 연락처를 나란히 두어, 한 번 고르면 두 곳에 나간다.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AcademyLogo from "@/components/AcademyLogo";
import { ACADEMY_NAME, ACADEMY_PHONE, EXAM_TYPE_LABELS, type OmrExam } from "@/lib/omr-types";
import type { RecipientType } from "@/lib/report-messages";
import type { RecipientSlot, SendTarget, TargetCounts } from "@/lib/report-send";

interface Setup {
  messagingConfigured: boolean;
  directoryConfigured: boolean;
  directoryError: string | null;
  siteUrl: string;
  siteUrlReady: boolean;
  /** 막지는 않지만 알아야 하는 것(응시일 누락 등) */
  examDateNotice: string | null;
}

interface SendOutcome {
  reportId: string;
  recipientType: RecipientType;
  studentName: string;
  phoneMasked: string;
  ok: boolean;
  channel: string | null;
  error: string | null;
}

/** 받는 사람 — 학부모는 늘 포함되고, 학생 본인을 얹을지만 고른다 */
type SendMode = "parent" | "both";

const MODE_LABELS: Record<SendMode, string> = {
  parent: "학부모만",
  both: "학부모 + 학생",
};

const RECIPIENT_LABELS: Record<RecipientType, string> = {
  parent: "학부모",
  student: "학생 본인",
};

/** 이 모드에서 이 학생에게 실제로 나갈 수신자들 */
function channelsFor(target: SendTarget, mode: SendMode): RecipientType[] {
  const out: RecipientType[] = [];
  if (!target.parent.blocked) out.push("parent");
  if (mode === "both" && !target.student.blocked) out.push("student");
  return out;
}

/** 연락처 한 칸 — 번호·지난 발송·못 보내는 이유를 한곳에 */
function ContactCell({ slot }: { slot: RecipientSlot }) {
  if (slot.blocked) {
    return (
      <div className="send-contact">
        <span className="subtle">{slot.phoneMasked ?? "—"}</span>
        <span className="blocked-reason">{slot.blocked}</span>
      </div>
    );
  }
  return (
    <div className="send-contact">
      <span>{slot.phoneMasked}</span>
      {slot.history ? (
        <span className="send-history">
          <span className={`status-chip ${slot.history.sent ? "active" : "danger"}`}>
            {slot.history.sent ? "보냄" : "실패"}
          </span>
          <span className="subtle">
            {slot.history.lastAt?.slice(0, 16).replace("T", " ")}
            {slot.history.attempts > 1 ? ` · ${slot.history.attempts}회 시도` : ""}
          </span>
          {/* 사유 없이 '실패'만 뜨면 무엇을 고쳐야 할지 알 수 없다 */}
          {slot.history.lastError ? <span className="send-fail-reason">{slot.history.lastError}</span> : null}
        </span>
      ) : (
        <span className="status-chip auto-ready">보낼 수 있음</span>
      )}
    </div>
  );
}

export default function OmrSendPanel({
  exam,
  canSend,
  setupError,
}: {
  exam: OmrExam | null;
  canSend: boolean;
  setupError: string;
}) {
  const [targets, setTargets] = useState<SendTarget[]>([]);
  const [counts, setCounts] = useState<Record<RecipientType, TargetCounts> | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [examTitle, setExamTitle] = useState(exam?.title ?? "");
  const [examDateText, setExamDateText] = useState("");

  const [mode, setMode] = useState<SendMode>("parent");
  /** 고른 학생의 reportId — 한 학생을 고르면 모드에 따라 한 곳 또는 두 곳에 나간다 */
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(setupError);
  const [message, setMessage] = useState("");
  const [outcomes, setOutcomes] = useState<SendOutcome[] | null>(null);

  const load = useCallback(async () => {
    if (!exam) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/omr/exams/${exam.id}/messages`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "발송 대상을 불러오지 못했습니다.");
      setTargets(data.targets ?? []);
      setCounts(data.counts ?? null);
      setSetup(data.setup ?? null);
      setExamTitle(data.examTitle ?? exam.title);
      setExamDateText(data.examDateText ?? "");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "발송 대상을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [exam]);

  useEffect(() => {
    void load();
  }, [load]);

  // 받는 사람을 바꾸면 고른 것은 비운다. 학부모만 보려고 고른 선택이 그대로
  // 남아 있으면, 확인하지 않은 학생 번호로 나갈 수 있다.
  useEffect(() => {
    setPicked(new Set());
    setOutcomes(null);
  }, [mode]);

  /** 이 모드에서 한 곳이라도 보낼 수 있는 학생 */
  const sendable = useMemo(
    () => targets.filter((t) => channelsFor(t, mode).length > 0),
    [targets, mode],
  );
  /** 보낼 수 있는 곳 중 아직 안 보낸 곳이 하나라도 있는 학생 */
  const unsent = useMemo(
    () =>
      sendable.filter((t) =>
        channelsFor(t, mode).some((type) => !(type === "parent" ? t.parent : t.student).history?.sent),
      ),
    [sendable, mode],
  );

  const toggle = (reportId: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(reportId)) next.delete(reportId);
      else next.add(reportId);
      return next;
    });
  };

  const pickAll = (which: "unsent" | "all" | "none") => {
    if (which === "none") return setPicked(new Set());
    const source = which === "unsent" ? unsent : sendable;
    setPicked(new Set(source.map((t) => t.reportId)));
  };

  const pickedTargets = targets.filter((t) => picked.has(t.reportId));
  /** 실제로 나갈 건 — 학생 한 명이 두 건이 될 수 있다 */
  const selections = pickedTargets.flatMap((t) =>
    channelsFor(t, mode).map((recipientType) => ({ reportId: t.reportId, recipientType })),
  );
  const parentCount = selections.filter((s) => s.recipientType === "parent").length;
  const studentCount = selections.filter((s) => s.recipientType === "student").length;
  const selectionText =
    mode === "both" ? `학부모 ${parentCount}명 · 학생 ${studentCount}명` : `학부모 ${parentCount}명`;

  async function send() {
    if (!exam || selections.length === 0) return;
    const alreadySent = selections.filter((s) => {
      const t = targets.find((x) => x.reportId === s.reportId);
      const slot = s.recipientType === "parent" ? t?.parent : t?.student;
      return slot?.history?.sent;
    }).length;
    const warning = alreadySent > 0 ? `\n(이 중 ${alreadySent}건은 이미 받은 적이 있습니다.)` : "";
    const ok = window.confirm(
      `${selectionText}에게 성적표 알림톡을 보냅니다(총 ${selections.length}건).${warning}\n\n` +
        "보낸 메시지는 취소할 수 없습니다. 진행할까요?",
    );
    if (!ok) return;

    setSending(true);
    setMessage("");
    setOutcomes(null);
    try {
      const res = await fetch(`/api/admin/omr/exams/${exam.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targets: selections }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "발송에 실패했습니다.");
      setOutcomes(data.results ?? []);
      setMessage(
        data.failed > 0
          ? `${data.sent}건을 보냈고 ${data.failed}건은 실패했습니다. 실패한 건만 다시 고를 수 있습니다.`
          : `${data.sent}건을 보냈습니다.`,
      );
      setPicked(new Set());
      setError("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "발송에 실패했습니다.");
    } finally {
      setSending(false);
    }
  }

  if (!exam) {
    return (
      <div className="admin-shell">
        <header className="admin-header">
          <div className="brand-lockup">
            <AcademyLogo size="large" href="/admin" />
            <div>
              <strong>성적표 발송</strong>
              <span>목동유쌤영어학원</span>
            </div>
          </div>
          <Link className="button ghost" href="/admin/omr">← 시험 목록</Link>
        </header>
        <p className="form-error block">{error || "시험을 불러오지 못했습니다."}</p>
      </div>
    );
  }

  const blockers: string[] = [];
  if (setup && !setup.messagingConfigured) {
    blockers.push(
      "카카오 알림톡 설정(SOLAPI_*)이 비어 있습니다. 템플릿 심사가 끝난 뒤 Vercel 환경변수에 값을 넣고 다시 배포해 주세요.",
    );
  }
  if (setup && !setup.siteUrlReady) {
    blockers.push(
      `성적표 주소가 아직 https 주소가 아닙니다(현재 ${setup.siteUrl}). ` +
        "NEXT_PUBLIC_SITE_URL을 설정하지 않으면 학부모가 열 수 없는 링크가 나갑니다.",
    );
  }
  if (setup && !setup.directoryConfigured) {
    blockers.push(
      "학생 관리 프로그램 연동(STUDENT_API_URL)이 없어 연락처를 가져올 수 없습니다.",
    );
  }
  if (setup?.directoryError) blockers.push(setup.directoryError);

  const sample = pickedTargets[0] ?? sendable[0] ?? targets[0];
  const modeSummary = (m: SendMode): string => {
    if (!counts) return "확인 중…";
    const p = counts.parent;
    if (m === "parent") return `보낼 수 있음 ${p.ready}명 · 이미 보냄 ${p.alreadySent}명 · 불가 ${p.blocked}명`;
    const s = counts.student;
    return `학부모 ${p.ready}명 + 학생 ${s.ready}명 · 학생 번호 없음 ${s.blocked}명`;
  };

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div className="brand-lockup">
          <AcademyLogo size="large" href="/admin" />
          <div>
            <strong>성적표 발송</strong>
            <span>
              {EXAM_TYPE_LABELS[exam.examType]} · {examTitle}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="button ghost" href="/admin/omr">← 시험 목록</Link>
          <Link className="button secondary" href={`/admin/omr/${exam.id}/comments`}>← 담임 의견</Link>
        </div>
      </header>

      {error ? <p className="form-error block">{error}</p> : null}
      {message ? <p className="status-message">{message}</p> : null}

      {setup?.examDateNotice ? (
        <p className="send-date-notice" role="alert">
          <strong>응시일 없이 나갑니다</strong>
          {setup.examDateNotice}
        </p>
      ) : null}

      {blockers.length > 0 ? (
        <section className="panel send-blockers">
          <p className="eyebrow">발송 전 준비</p>
          <h2>아직 보낼 수 없습니다</h2>
          <ul>
            {blockers.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
          <p className="subtle">
            준비가 끝나기 전에도 아래에서 <strong>누구에게 나갈지와 문구</strong>는 확인할 수 있습니다.
          </p>
        </section>
      ) : null}

      {/* 누구에게 보낼지 — 학부모는 늘 받고, 학생 본인을 얹을지만 고른다 */}
      <section className="panel">
        <div className="section-heading wrap">
          <div>
            <p className="eyebrow">받는 사람</p>
            <h2>누구에게 보낼까요?</h2>
            <p className="subtle">
              학부모에게는 늘 갑니다. <strong>학부모 + 학생</strong>을 고르면 학생 본인 번호가 있는
              학생에게도 같은 알림톡이 한 번 더 나갑니다.
            </p>
          </div>
        </div>
        <div className="style-options">
          {(["parent", "both"] as SendMode[]).map((m) => (
            <button
              key={m}
              type="button"
              className={`style-option${mode === m ? " on" : ""}`}
              onClick={() => setMode(m)}
            >
              <strong>{MODE_LABELS[m]}</strong>
              <span>{modeSummary(m)}</span>
            </button>
          ))}
        </div>
      </section>

      {/* 실제로 나갈 문구 — 보내기 전에 눈으로 확인한다 */}
      <section className="panel">
        <div className="section-heading wrap">
          <div>
            <p className="eyebrow">미리보기</p>
            <h2>이렇게 나갑니다</h2>
            <p className="subtle">
              점수는 메시지에 넣지 않습니다. 성적은 링크를 열고 <strong>학부모님 휴대전화 뒤 4자리</strong>를
              입력해야 볼 수 있습니다.
            </p>
          </div>
        </div>
        <div className="alimtalk-preview">
          <div className="alimtalk-bubble">
            <p className="alimtalk-head">[{ACADEMY_NAME}] 성적표 안내</p>
            <p>
              <strong>{sample?.studentName || "홍길동"}</strong> 학생의 성적표가 준비되었습니다.
            </p>
            <p className="alimtalk-meta">
              ▪ 시험명 : <strong>{examTitle}</strong>
              <br />▪ 응시일 :{" "}
              {examDateText || <span className="alimtalk-missing">시험 정보에 응시일이 없습니다</span>}
            </p>
            <p>
              아래 버튼을 눌러 확인해 주세요.
              <br />
              열람 시 학부모님 휴대전화 뒤 4자리를 입력하셔야 합니다.
            </p>
            <p className="alimtalk-foot">▪ 문의 : {ACADEMY_PHONE}</p>
            <div className="alimtalk-button">성적표 확인하기</div>
          </div>
          <p className="subtle">
            버튼이 열 주소 —{" "}
            <code>
              {(setup?.siteUrl ?? "").replace(/\/$/, "")}/r/{sample?.token ?? "…"}
            </code>
          </p>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading wrap">
          <div>
            <p className="eyebrow">발송 대상</p>
            <h2>
              {MODE_LABELS[mode]} · 학생 {picked.size}명 선택
            </h2>
            <p className="subtle">
              이미 보낸 학생은 기본으로 선택되지 않습니다. 다시 보내려면 직접 체크하세요.
              {mode === "both" ? " 학생 번호가 없는 학생은 학부모에게만 나갑니다." : ""}
            </p>
          </div>
          <div className="toolbar">
            <button className="button small secondary" onClick={() => pickAll("unsent")}>
              안 보낸 학생 전체 ({unsent.length})
            </button>
            <button className="button small ghost" onClick={() => pickAll("all")}>
              전체 ({sendable.length})
            </button>
            <button className="button small ghost" onClick={() => pickAll("none")}>
              선택 해제
            </button>
          </div>
        </div>

        <div className="table-scroll">
          <table className="admin-table send-table">
            <thead>
              <tr>
                <th style={{ width: 44 }} />
                <th>학생</th>
                <th>학부모</th>
                {mode === "both" ? <th>학생 본인</th> : null}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="empty-cell" colSpan={4}>
                    불러오는 중…
                  </td>
                </tr>
              ) : targets.length === 0 ? (
                <tr>
                  <td className="empty-cell" colSpan={4}>
                    이 시험에는 아직 만들어진 성적표가 없습니다.{" "}
                    <Link href={`/admin/omr/${exam.id}/reports`}>성적표 생성으로 이동 →</Link>
                  </td>
                </tr>
              ) : (
                targets.map((target) => {
                  const channels = channelsFor(target, mode);
                  const blockedAll = channels.length === 0;
                  return (
                    <tr key={target.reportId} className={blockedAll ? "row-blocked" : undefined}>
                      <td>
                        <input
                          type="checkbox"
                          checked={picked.has(target.reportId)}
                          disabled={blockedAll || !canSend}
                          onChange={() => toggle(target.reportId)}
                          aria-label={`${target.studentName} 선택`}
                        />
                      </td>
                      <td>
                        <strong>{target.studentName}</strong>
                        <span>
                          {target.studentKey ?? "수험번호 없음"}
                          {target.className ? ` · ${target.className}` : ""}
                        </span>
                      </td>
                      <td>
                        <ContactCell slot={target.parent} />
                      </td>
                      {mode === "both" ? (
                        <td>
                          <ContactCell slot={target.student} />
                        </td>
                      ) : null}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {canSend ? (
          <div className="send-bar">
            <p className="subtle">
              {selections.length === 0
                ? "보낼 학생을 골라 주세요."
                : `${selectionText}에게 보냅니다(총 ${selections.length}건). 보낸 메시지는 취소할 수 없습니다.`}
            </p>
            <button
              className="button primary"
              disabled={selections.length === 0 || sending || blockers.length > 0}
              onClick={send}
            >
              {sending ? "보내는 중…" : `알림톡 보내기 (${selections.length})`}
            </button>
          </div>
        ) : (
          <p className="subtle">발송 권한이 없습니다. 관리자에게 문의해 주세요.</p>
        )}
      </section>

      {outcomes && outcomes.length > 0 ? (
        <section className="panel">
          <div className="section-heading wrap">
            <div>
              <p className="eyebrow">발송 결과</p>
              <h2>
                성공 {outcomes.filter((o) => o.ok).length}건 · 실패{" "}
                {outcomes.filter((o) => !o.ok).length}건
              </h2>
            </div>
          </div>
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>학생</th>
                  <th>연락처</th>
                  <th>결과</th>
                </tr>
              </thead>
              <tbody>
                {outcomes.map((o) => (
                  <tr key={`${o.reportId}:${o.recipientType}`}>
                    <td>
                      <strong>{o.studentName}</strong>
                      <span>{RECIPIENT_LABELS[o.recipientType]}</span>
                    </td>
                    <td>{o.phoneMasked}</td>
                    <td>
                      <span className={`status-chip ${o.ok ? "active" : "danger"}`}>
                        {o.ok ? (o.channel === "alimtalk" ? "알림톡 발송" : "문자 대체발송") : "실패"}
                      </span>
                      {o.error ? <span>{o.error}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
