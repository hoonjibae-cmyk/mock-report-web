"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import EssayCrop from "@/components/EssayCrop";
import type { OmrExam } from "@/lib/omr-types";

/**
 * 주관식 채점 화면 — 학생이 아니라 **답안**을 단위로 채점한다.
 *
 * 60명을 한 명씩 보면 60번 판단해야 하지만, 영작은 답이 몇 갈래로 수렴한다.
 * 같은 답끼리 묶어 한 번만 채점하면 판단 횟수가 크게 줄고, 덤으로 "같은 답에
 * 같은 점수"가 구조적으로 보장된다.
 */

interface Member {
  scanId: string;
  studentId: string | null;
  score: number | null;
  hasCrop: boolean;
}

interface Group {
  key: string;
  text: string;
  matchesKey: boolean;
  blank: boolean;
  members: Member[];
}

interface Question {
  no: number;
  point: number;
  accepted: string[];
  transcribed: number;
  groups: Group[];
}

interface Props {
  exam: OmrExam | null;
  setupError: string;
  canEdit: boolean;
}

/** 배점 표시 — 균등 배분이면 100/45 같은 값이 나오므로 소수점을 정리한다 */
function fmtPoint(value: number): string {
  return String(Math.round(value * 10) / 10);
}

export default function EssayGrader({ exam, setupError, canEdit }: Props) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [studentCount, setStudentCount] = useState(0);
  const [pendingReview, setPendingReview] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(setupError);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [editingKey, setEditingKey] = useState<number | null>(null);
  const [keyDraft, setKeyDraft] = useState("");

  /** 정답을 이 화면에서 바로 저장한다 — 엑셀을 다시 올리러 가지 않아도 되게 */
  async function saveAnswerKey(questionNo: number) {
    await post("setAnswer", { questionNo, text: keyDraft }, `key-${questionNo}`);
    setEditingKey(null);
  }

  const load = useCallback(async () => {
    if (!exam?.id) return;
    try {
      const res = await fetch(`/api/admin/omr/exams/${exam.id}/essay/grade`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "주관식 정보를 불러오지 못했습니다.");
      setQuestions(data.questions ?? []);
      setStudentCount(data.studentCount ?? 0);
      setPendingReview(data.pendingReview ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [exam?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function post(action: string, extra: Record<string, unknown> = {}, tag = action) {
    if (!exam?.id) return;
    setBusy(tag);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/admin/omr/exams/${exam.id}/essay/grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "처리하지 못했습니다.");
      if (data.questions) setQuestions(data.questions);
      if (typeof data.studentCount === "number") setStudentCount(data.studentCount);
      if (action === "transcribe") {
        setMessage(
          data.transcribed > 0
            ? `${data.transcribed}개 답안을 읽었습니다. 손글씨와 대조해 확인해 주세요.`
            : (data.message ?? "새로 읽을 답안이 없습니다."),
        );
      } else if (action === "autoGrade") {
        setMessage(
          data.applied > 0
            ? `정답과 정확히 일치하는 ${data.applied}개 답안을 만점 처리했습니다.`
            : "정답과 정확히 일치하는 답안이 없습니다. 아래에서 묶음별로 채점해 주세요.",
        );
      } else if (action === "gradeGroup") {
        setMessage(`${data.graded}명에게 점수를 매겼습니다.`);
      } else if (action === "setAnswer") {
        setMessage("정답을 저장했습니다. ‘정답 일치분 자동 채점’을 누르면 반영됩니다.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "처리 중 오류가 발생했습니다.");
    } finally {
      setBusy(null);
    }
  }

  if (!exam) {
    return (
      <div className="panel">
        <p className="form-error">{setupError || "시험을 찾을 수 없습니다."}</p>
      </div>
    );
  }

  const totalGraded = questions.reduce(
    (sum, q) => sum + q.groups.reduce((s, g) => s + g.members.filter((m) => m.score !== null).length, 0),
    0,
  );
  const totalAnswers = questions.reduce(
    (sum, q) => sum + q.groups.reduce((s, g) => s + g.members.length, 0),
    0,
  );

  return (
    <div>
      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-ok">{message}</p> : null}

      <div className="panel">
        <div className="section-heading wrap">
          <div>
            <p className="eyebrow">STEP 3</p>
            <h2>주관식 채점</h2>
            <p className="subtle">
              같은 답을 쓴 학생끼리 묶어 <strong>한 번에</strong> 채점합니다. 한 명씩 보지 않아도
              되고, 같은 답에는 반드시 같은 점수가 갑니다.
            </p>
          </div>
          {canEdit ? (
            <div className="toolbar">
              <button
                className="button secondary"
                disabled={busy !== null}
                onClick={() => post("transcribe")}
              >
                {busy === "transcribe" ? "읽는 중…" : "손글씨 읽기"}
              </button>
              <button
                className="button primary"
                disabled={busy !== null}
                onClick={() => post("autoGrade")}
              >
                {busy === "autoGrade" ? "채점 중…" : "정답 일치분 자동 채점"}
              </button>
            </div>
          ) : null}
        </div>

        <div className="review-summary" style={{ marginTop: 4 }}>
          <div className="review-counts">
            <span>
              채점 대상 <strong>{studentCount}</strong>명
            </span>
            <span className="auto">
              채점 완료 <strong>{totalGraded}</strong>/{totalAnswers}답안
            </span>
            {pendingReview > 0 ? (
              <span className="need">
                검수 미완료 <strong>{pendingReview}</strong>장
              </span>
            ) : null}
          </div>
          <p className="review-note">
            <strong>정답과 정확히 일치하는 답안만</strong> 자동으로 만점 처리합니다. 오답으로 보이는
            답안과 백지는 자동으로 0점 처리하지 않습니다 — 학생이 틀린 것인지 글씨를 잘못 읽은
            것인지 구분할 수 없기 때문입니다.
            {pendingReview > 0 ? (
              <>
                {" "}
                검수를 마치지 않은 답안지는 채점 대상에서 빠집니다.{" "}
                <Link href={`/admin/omr/${exam.id}/scans`}>스캔 검수로 이동 →</Link>
              </>
            ) : null}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="panel">
          <p className="subtle">불러오는 중…</p>
        </div>
      ) : (
        questions.map((q) => {
          const graded = q.groups.reduce(
            (s, g) => s + g.members.filter((m) => m.score !== null).length,
            0,
          );
          const total = q.groups.reduce((s, g) => s + g.members.length, 0);
          return (
            <div className="panel" key={q.no}>
              <div className="section-heading wrap">
                <div>
                  <h3 style={{ margin: 0, fontSize: 16 }}>
                    {q.no}번 <span className="subtle">· 배점 {fmtPoint(q.point)}점</span>
                  </h3>
                  <p className="subtle" style={{ margin: "4px 0 0" }}>
                    {total}명 → <strong>{q.groups.length}개 묶음</strong> · 채점 {graded}/{total}
                  </p>
                </div>
              </div>

              {/* 정답을 학생 답안 바로 위에 둔다 — 채점자가 눈을 옮기지 않고 대조할 수 있어야 한다.
                  아직 안 넣었으면 여기서 바로 입력한다(엑셀을 다시 올리러 가지 않아도 되게). */}
              <div className={`essay-key${q.accepted.length > 0 ? "" : " empty"}`}>
                <span className="essay-key-label">정답</span>
                {editingKey === q.no ? (
                  <>
                    <input
                      className="essay-key-input"
                      autoFocus
                      defaultValue={q.accepted.join(" | ")}
                      placeholder="정답 문장. 똑같이 맞다고 볼 답이 여럿이면 | 로 나눠 적으세요"
                      onChange={(e) => setKeyDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void saveAnswerKey(q.no);
                        if (e.key === "Escape") setEditingKey(null);
                      }}
                    />
                    <button
                      className="button tiny primary"
                      disabled={busy !== null}
                      onClick={() => saveAnswerKey(q.no)}
                    >
                      저장
                    </button>
                    <button className="button tiny ghost" onClick={() => setEditingKey(null)}>
                      취소
                    </button>
                  </>
                ) : (
                  <>
                    {q.accepted.length > 0 ? (
                      <p className="essay-key-text">
                        {q.accepted.map((answer, i) => (
                          <span key={answer}>
                            {i > 0 ? <em> 또는 </em> : null}
                            {answer}
                          </span>
                        ))}
                      </p>
                    ) : (
                      <p className="essay-key-text muted">
                        아직 없습니다. 넣어 두면 일치하는 답안이 자동으로 만점 처리됩니다.
                      </p>
                    )}
                    {canEdit ? (
                      <button
                        className="button tiny ghost"
                        onClick={() => {
                          setKeyDraft(q.accepted.join(" | "));
                          setEditingKey(q.no);
                        }}
                      >
                        {q.accepted.length > 0 ? "고치기" : "정답 입력"}
                      </button>
                    ) : null}
                  </>
                )}
              </div>

              {q.transcribed === 0 ? (
                <p className="subtle">
                  아직 손글씨를 읽지 않았습니다. 위의 <strong>손글씨 읽기</strong>를 눌러 주세요.
                </p>
              ) : (
                <div className="essay-groups">
                  {q.groups.map((group) => {
                    const groupId = `${q.no}:${group.key}`;
                    const scored = group.members.filter((m) => m.score !== null);
                    const currentScore = scored[0]?.score ?? null;
                    const allSame =
                      scored.length === group.members.length &&
                      scored.every((m) => m.score === currentScore);
                    const isOpen = openGroup === groupId;
                    return (
                      <div
                        className={`essay-group${group.matchesKey ? " match" : ""}${group.blank ? " blank" : ""}`}
                        key={groupId}
                      >
                        <div className="essay-group-head">
                          <span className="essay-count">{group.members.length}명</span>
                          <p className="essay-text">
                            {group.blank ? <em>(백지)</em> : group.text}
                          </p>
                          {group.matchesKey ? <span className="essay-badge">정답</span> : null}
                          {allSame && currentScore !== null ? (
                            <span className="essay-score-chip">{currentScore}점</span>
                          ) : null}
                        </div>

                        {canEdit ? (
                          <div className="essay-actions">
                            <span className="subtle">점수</span>
                            {[q.point, q.point / 2, 0].map((value) => {
                              const rounded = Math.round(value * 10) / 10;
                              return (
                                <button
                                  key={rounded}
                                  className={`button tiny${allSame && currentScore === rounded ? " primary" : " ghost"}`}
                                  disabled={busy !== null}
                                  onClick={() =>
                                    post(
                                      "gradeGroup",
                                      { questionNo: q.no, groupKey: group.key, score: rounded },
                                      groupId,
                                    )
                                  }
                                >
                                  {rounded}
                                </button>
                              );
                            })}
                            <input
                              type="number"
                              className="essay-score-input"
                              min={0}
                              max={q.point}
                              step={0.5}
                              placeholder="직접"
                              disabled={busy !== null}
                              onKeyDown={(e) => {
                                if (e.key !== "Enter") return;
                                const value = Number((e.target as HTMLInputElement).value);
                                if (Number.isFinite(value)) {
                                  void post(
                                    "gradeGroup",
                                    { questionNo: q.no, groupKey: group.key, score: value },
                                    groupId,
                                  );
                                }
                              }}
                            />
                            <button
                              className="button tiny ghost"
                              onClick={() => setOpenGroup(isOpen ? null : groupId)}
                            >
                              {isOpen ? "손글씨 닫기" : `손글씨 보기 (${group.members.length})`}
                            </button>
                          </div>
                        ) : null}

                        {isOpen ? (
                          <div className="essay-crops">
                            {group.members.map((member) => {
                              const editKey = `${member.scanId}:${q.no}`;
                              return (
                                <div className="essay-crop-row" key={member.scanId}>
                                  <div className="essay-crop-head">
                                    <strong>수험번호 {member.studentId ?? "—"}</strong>
                                    {member.score !== null ? <span>{member.score}점</span> : null}
                                  </div>
                                  {member.hasCrop ? (
                                    <EssayCrop scanId={member.scanId} questionNo={q.no} />
                                  ) : (
                                    <p className="essay-crop-empty">
                                      이미지가 없습니다(전사 기능 이전 업로드).
                                    </p>
                                  )}
                                  {canEdit ? (
                                    <div className="essay-fix">
                                      <input
                                        defaultValue={group.blank ? "" : group.text}
                                        placeholder="잘못 읽었으면 여기서 고쳐 주세요"
                                        onChange={(e) =>
                                          setEdits((prev) => ({ ...prev, [editKey]: e.target.value }))
                                        }
                                      />
                                      <button
                                        className="button tiny secondary"
                                        disabled={busy !== null || edits[editKey] === undefined}
                                        onClick={() =>
                                          post(
                                            "fixText",
                                            {
                                              questionNo: q.no,
                                              scanId: member.scanId,
                                              text: edits[editKey] ?? "",
                                            },
                                            editKey,
                                          )
                                        }
                                      >
                                        고침
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
