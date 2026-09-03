"use client";

// 성적표 알림톡 발송 화면.
//
// 발송은 되돌릴 수 없다. 그래서 이 화면은 "빨리 보내기"보다 "잘못 보내지
// 않기"를 우선한다.
//   - 못 보내는 건은 이유와 함께 회색으로 보여 준다(숨기지 않는다).
//   - 이미 보낸 건은 기본으로 선택하지 않는다.
//   - 실제로 나갈 문구를 보내기 전에 그대로 보여 준다.
//   - 확정 발송에는 건수를 적은 한 번의 확인을 둔다.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AcademyLogo from "@/components/AcademyLogo";
import { ACADEMY_NAME, ACADEMY_PHONE, EXAM_TYPE_LABELS, type OmrExam } from "@/lib/omr-types";
import type { RecipientType } from "@/lib/report-messages";
import type { SendTarget, TargetCounts } from "@/lib/report-send";

interface Setup {
  messagingConfigured: boolean;
  directoryConfigured: boolean;
  directoryError: string | null;
  siteUrl: string;
  siteUrlReady: boolean;
  /** 시험 자체가 못 보내는 상태일 때의 이유(응시일 누락 등) */
  examBlocker: string | null;
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

const RECIPIENT_LABELS: Record<RecipientType, string> = {
  parent: "학부모",
  student: "학생 본인",
};

function slotOf(target: SendTarget, type: RecipientType) {
  return type === "parent" ? target.parent : target.student;
}

function keyOf(reportId: string, type: RecipientType) {
  return `${reportId}:${type}`;
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

  const [recipient, setRecipient] = useState<RecipientType>("parent");
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

  // 수신자 유형을 바꾸면 고른 것은 비운다. 학부모용으로 고른 선택이 학생용에
  // 그대로 남아 있으면, 화면에 안 보이는 대상에게 나갈 수 있다.
  useEffect(() => {
    setPicked(new Set());
    setOutcomes(null);
  }, [recipient]);

  const rows = useMemo(
    () =>
      targets.map((target) => {
        const slot = slotOf(target, recipient);
        return { target, slot, key: keyOf(target.reportId, recipient) };
      }),
    [targets, recipient],
  );

  const sendable = useMemo(() => rows.filter((row) => !row.slot.blocked), [rows]);
  const unsent = useMemo(() => sendable.filter((row) => !row.slot.history?.sent), [sendable]);

  const toggle = (key: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const pickAll = (which: "unsent" | "all" | "none") => {
    if (which === "none") return setPicked(new Set());
    const source = which === "unsent" ? unsent : sendable;
    setPicked(new Set(source.map((row) => row.key)));
  };

  const pickedRows = rows.filter((row) => picked.has(row.key));

  async function send() {
    if (!exam || pickedRows.length === 0) return;
    const alreadySent = pickedRows.filter((row) => row.slot.history?.sent).length;
    const warning = alreadySent > 0 ? `\n(이 중 ${alreadySent}명은 이미 받은 적이 있습니다.)` : "";
    const ok = window.confirm(
      `${RECIPIENT_LABELS[recipient]} ${pickedRows.length}명에게 성적표 알림톡을 보냅니다.${warning}\n\n` +
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
        body: JSON.stringify({
          targets: pickedRows.map((row) => ({
            reportId: row.target.reportId,
            recipientType: recipient,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "발송에 실패했습니다.");
      setOutcomes(data.results ?? []);
      setMessage(
        data.failed > 0
          ? `${data.sent}명에게 보냈고 ${data.failed}명은 실패했습니다. 실패한 건만 다시 고를 수 있습니다.`
          : `${data.sent}명에게 보냈습니다.`,
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
            <AcademyLogo size="large" />
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
  if (setup?.examBlocker) blockers.push(setup.examBlocker);
  if (setup?.directoryError) blockers.push(setup.directoryError);

  const sample = pickedRows[0]?.target ?? sendable[0]?.target ?? targets[0];

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div className="brand-lockup">
          <AcademyLogo size="large" />
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

      {/* 누구에게 보낼지 — 시험마다 다를 수 있어 발송할 때마다 고른다 */}
      <section className="panel">
        <div className="section-heading wrap">
          <div>
            <p className="eyebrow">받는 사람</p>
            <h2>누구에게 보낼까요?</h2>
            <p className="subtle">
              학부모와 학생에게 따로 보냅니다. 둘 다 보내려면 한쪽을 보낸 뒤 다른 쪽을 고르세요.
            </p>
          </div>
        </div>
        <div className="style-options">
          {(["parent", "student"] as RecipientType[]).map((type) => {
            const count = counts?.[type];
            return (
              <button
                key={type}
                type="button"
                className={`style-option${recipient === type ? " on" : ""}`}
                onClick={() => setRecipient(type)}
              >
                <strong>{RECIPIENT_LABELS[type]}</strong>
                <span>
                  {count
                    ? `보낼 수 있음 ${count.ready}명 · 이미 보냄 ${count.alreadySent}명 · 불가 ${count.blocked}명`
                    : "확인 중…"}
                </span>
              </button>
            );
          })}
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
              {RECIPIENT_LABELS[recipient]} · {picked.size}명 선택
            </h2>
            <p className="subtle">
              이미 보낸 사람은 기본으로 선택되지 않습니다. 다시 보내려면 직접 체크하세요.
            </p>
          </div>
          <div className="toolbar">
            <button className="button small secondary" onClick={() => pickAll("unsent")}>
              안 보낸 사람 전체 ({unsent.length})
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
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: 44 }} />
                <th>학생</th>
                <th>연락처</th>
                <th>지난 발송</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="empty-cell" colSpan={5}>
                    불러오는 중…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="empty-cell" colSpan={5}>
                    이 시험에는 아직 만들어진 성적표가 없습니다.{" "}
                    <Link href={`/admin/omr/${exam.id}/reports`}>성적표 생성으로 이동 →</Link>
                  </td>
                </tr>
              ) : (
                rows.map(({ target, slot, key }) => (
                  <tr key={key} className={slot.blocked ? "row-blocked" : undefined}>
                    <td>
                      <input
                        type="checkbox"
                        checked={picked.has(key)}
                        disabled={Boolean(slot.blocked) || !canSend}
                        onChange={() => toggle(key)}
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
                    <td>{slot.phoneMasked ?? <span className="subtle">—</span>}</td>
                    <td>
                      {slot.history ? (
                        <>
                          <span className={`status-chip ${slot.history.sent ? "active" : "danger"}`}>
                            {slot.history.sent ? "보냄" : "실패"}
                          </span>
                          <span>
                            {slot.history.lastAt?.slice(0, 16).replace("T", " ")}
                            {slot.history.attempts > 1 ? ` · ${slot.history.attempts}회 시도` : ""}
                          </span>
                          {/* 사유 없이 '실패'만 뜨면 무엇을 고쳐야 할지 알 수 없다 */}
                          {slot.history.lastError ? (
                            <span className="send-fail-reason">{slot.history.lastError}</span>
                          ) : null}
                        </>
                      ) : (
                        <span className="subtle">—</span>
                      )}
                    </td>
                    <td>
                      {slot.blocked ? (
                        <span className="blocked-reason">{slot.blocked}</span>
                      ) : (
                        <span className="status-chip auto-ready">보낼 수 있음</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {canSend ? (
          <div className="send-bar">
            <p className="subtle">
              {picked.size === 0
                ? "보낼 사람을 골라 주세요."
                : `${RECIPIENT_LABELS[recipient]} ${picked.size}명에게 보냅니다. 보낸 메시지는 취소할 수 없습니다.`}
            </p>
            <button
              className="button primary"
              disabled={picked.size === 0 || sending || blockers.length > 0}
              onClick={send}
            >
              {sending ? "보내는 중…" : `알림톡 보내기 (${picked.size})`}
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
