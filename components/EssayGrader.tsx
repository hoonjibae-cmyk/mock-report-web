"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import AcademyLogo from "@/components/AcademyLogo";
import EssayCrop from "@/components/EssayCrop";
import ScanPreview from "@/components/ScanPreview";
import UploaderScopeBar from "@/components/UploaderScopeBar";
import { EXAM_TYPE_LABELS, type OmrExam } from "@/lib/omr-types";
import type { UploaderEssayProgress, UploaderScope } from "@/lib/uploaders";

/**
 * 주관식 채점 화면 — 학생이 아니라 **답안**을 단위로 채점한다.
 *
 * 60명을 한 명씩 보면 60번 판단해야 하지만, 영작은 답이 몇 갈래로 수렴한다.
 * 같은 답끼리 묶어 한 번만 채점하면 판단 횟수가 크게 줄고, 덤으로 "같은 답에
 * 같은 점수"가 구조적으로 보장된다.
 *
 * 자동 채점은 일치하면 만점, 오답으로 보이거나 백지면 우선 0점이다. 자동 점수는
 * 점선 테두리로 '아직 사람이 보지 않았다'를 드러내고, 묶음의 바탕색(초록·빨강·
 * 주황)으로 맞고 틀림이 한눈에 갈린다. 선생님이 확인하거나 고치면 ✓가 붙고
 * 자동 채점이 다시 돌아도 바뀌지 않는다.
 */

interface Member {
  scanId: string;
  studentId: string | null;
  score: number | null;
  /** 'auto' 자동 채점(확인 전) · 'teacher' 선생님이 확인·매김 · null 미채점 */
  source: "auto" | "teacher" | null;
  hasCrop: boolean;
  /** 답안지 전체 미리보기가 있는가 — 칸 이미지가 없을 때 대신 보여 준다 */
  hasPreview: boolean;
  /** 원본 스캔이 보관되어 있는가 — 있으면 '손글씨 읽기'가 칸 이미지를 다시 만든다 */
  hasOriginal: boolean;
  /** 사람이 정해야 하는 답 — 불확실하게 읽었거나 손글씨 대조로도 정하지 못했다 */
  unclear: boolean;
  /** 손글씨 대조 결과 — match 정답대로 씀 · mismatch 다르게 씀 · review 판단 보류 · typed 사람이 옮겨 적음 */
  flag?: "unclear" | "typed" | "match" | "mismatch" | "review" | null;
  /** 정답과 다르게 읽혀 손글씨 대조를 기다리는 답 */
  pending?: boolean;
}

interface Group {
  key: string;
  text: string;
  matchesKey: boolean;
  blank: boolean;
  /** 판독이 불확실한 답안들의 묶음 */
  unclear: boolean;
  /**
   * 아직 글로 옮기지 못한 답안들 — 'unread' 칸 이미지는 있는데 안 읽음, 'noImage' 칸 이미지가
   * 없어 읽을 수 없음. 학생마다 답이 다르므로 학생별로 매긴다.
   */
  missing: "unread" | "noImage" | null;
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
  /** 로그인한 사람의 계정 ID — '내가 올린 답안지' 범위의 기준 */
  me: string;
}

interface AutoSummary {
  applied: number;
  zeroed: number;
  kept: number;
  /** 못 읽은 답안에 남아 있어 지운 예전 자동 점수 */
  cleared?: number;
}

/** 정답과 다르게 읽힌 답을 손글씨와 다시 대조한 결과 */
interface CheckSummary {
  checked: number;
  matched: number;
  mismatched: number;
  review: number;
  failed: number;
  /** 시간이 모자라 다음 요청으로 넘긴 칸 — 화면이 이어서 부른다 */
  pending: number;
}

const NO_CHECKS: CheckSummary = { checked: 0, matched: 0, mismatched: 0, review: 0, failed: 0, pending: 0 };

/** 여러 번 나눠 대조한 결과를 더한다(남은 칸 수는 마지막 것을 쓴다) */
function addChecks(total: CheckSummary, next: CheckSummary | undefined): CheckSummary {
  if (!next) return total;
  return {
    checked: total.checked + next.checked,
    matched: total.matched + next.matched,
    mismatched: total.mismatched + next.mismatched,
    review: total.review + next.review,
    failed: total.failed + next.failed,
    pending: next.pending,
  };
}

/** 손글씨 대조 결과를 한 문장으로 — 프로그램이 정한 것과 사람에게 넘긴 것 */
function checkText(c: CheckSummary): string {
  const parts: string[] = [];
  if (c.checked > 0) {
    parts.push(
      `정답과 다르게 읽힌 ${c.checked}칸은 손글씨와 다시 대조해 프로그램이 정했습니다 — 정답대로 씀 ${c.matched} · 다르게 씀 ${c.mismatched}` +
        (c.review > 0 ? ` · 판단 보류 ${c.review}(확인 필요로 남김)` : "") +
        ".",
    );
  }
  if (c.failed > 0) parts.push(`${c.failed}칸은 대조하지 못했습니다(일시 오류) — 다시 누르면 그 칸만 다시 대조합니다.`);
  return parts.join(" ");
}

/** 지금 화면에서 사람이 정해야 하는 답 수 — 대조로도 정하지 못했고 점수가 없다 */
function openForPerson(questions: Question[]): number {
  return questions.reduce(
    (sum, q) =>
      sum +
      q.groups
        .filter((g) => !g.missing)
        .reduce((n, g) => n + g.members.filter((m) => m.unclear && m.score === null).length, 0),
    0,
  );
}

/** 서버가 범위·진행과 함께 돌려주는 응답 */
interface GradePayload {
  scope?: UploaderScope;
  uploaders?: UploaderEssayProgress[];
  questions?: Question[];
  studentCount?: number;
  pendingReview?: number;
}

/** 보관된 원본으로 손글씨 칸 이미지를 다시 만든 결과(손글씨 읽기 응답) */
interface RestoreReport {
  restored: number;
  noOriginal: number;
  noOriginalFiles?: string[];
  failed?: Array<{ filename: string; reason: string }>;
  failedCount: number;
  pending: number;
}

/** 화면이 '손글씨 읽기'를 이어서 부르는 최대 횟수 — 끝없이 도는 일을 막는 안전장치 */
const MAX_TRANSCRIBE_ROUNDS = 40;

/** 배점 표시 — 균등 배분이면 100/45 같은 값이 나오므로 소수점을 정리한다 */
function fmtPoint(value: number): string {
  return String(Math.round(value * 10) / 10);
}

type StateKind = "full" | "zero" | "partial" | "mixed" | "none";

interface GroupState {
  kind: StateKind;
  /** 묶음 전원이 같은 점수일 때 그 점수 */
  score: number | null;
  /** 점수가 있는 학생이 모두 자동 채점(확인 전)인가 */
  auto: boolean;
}

/** 묶음의 채점 상태 — 바탕색과 칩을 정한다 */
function groupState(group: Group, point: number): GroupState {
  const scored = group.members.filter((m) => m.score !== null);
  if (scored.length === 0) return { kind: "none", score: null, auto: false };
  const first = scored[0].score as number;
  const allSame = scored.length === group.members.length && scored.every((m) => m.score === first);
  const auto = scored.every((m) => m.source === "auto");
  if (!allSame) return { kind: "mixed", score: null, auto };
  const kind: StateKind = first >= point - 0.05 ? "full" : first <= 0.05 ? "zero" : "partial";
  return { kind, score: first, auto };
}

/**
 * 학생 한 명의 한 칸 점수 — 못 읽은 답안을 종이나 답안지 이미지를 보고 매길 때.
 * 누르는 즉시 선생님 점수로 저장되고, 자동 채점이 바꾸지 않는다.
 */
function MemberScore({
  member,
  point,
  disabled,
  onScore,
}: {
  member: Member;
  point: number;
  disabled: boolean;
  onScore: (score: number) => void;
}) {
  const teacher = member.source === "teacher" && member.score !== null;
  const score = member.score ?? 0;
  const kind = score >= point - 0.05 ? "full" : score <= 0.05 ? "zero" : "partial";
  return (
    <div className="essay-actions member">
      <span className="subtle">점수</span>
      {[point, point / 2, 0].map((value) => {
        const on = teacher && Math.abs(score - value) < 0.05;
        return (
          <button
            key={fmtPoint(value)}
            className={`button tiny${on ? " primary" : " ghost"}`}
            disabled={disabled}
            onClick={() => onScore(value)}
          >
            {fmtPoint(value)}
          </button>
        );
      })}
      <input
        type="number"
        className="essay-score-input"
        min={0}
        max={point}
        step={0.5}
        placeholder="직접"
        title="부분점수를 직접 입력합니다. Enter를 누르거나 칸을 벗어나면 저장됩니다."
        disabled={disabled}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        onBlur={(e) => {
          const raw = e.target.value.trim();
          if (!raw) return;
          const value = Number(raw);
          if (!Number.isFinite(value)) return;
          e.target.value = "";
          onScore(value);
        }}
      />
      {teacher ? (
        <span className={`essay-score-chip ${kind}`}>✓ {fmtPoint(score)}점</span>
      ) : member.source === "auto" ? (
        <span className="essay-score-chip zero auto" title="못 읽은 답안에 남은 예전 자동 점수 — 다음 자동 채점 때 지워집니다">
          자동 {fmtPoint(score)}점 — 근거 없음
        </span>
      ) : (
        <span className="essay-score-chip none">미채점</span>
      )}
    </div>
  );
}

function autoText(auto: AutoSummary | undefined): string {
  if (!auto) return "";
  return (
    `만점 ${auto.applied} · 0점 ${auto.zeroed}` +
    (auto.kept > 0 ? ` (선생님이 매긴 ${auto.kept}개는 그대로)` : "")
  );
}

export default function EssayGrader({ exam, setupError, canEdit, me }: Props) {
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
  // 손글씨 칸 이미지가 없는 답안 — 답안지 전체 미리보기를 한 장씩만 연다(열 때 불러온다)
  const [sheetPreview, setSheetPreview] = useState<string | null>(null);
  // 범위 — 처음에는 서버가 정한다(내가 올린 답안지가 있으면 그것만, 없으면 전체).
  // 'scopeReady' 전에는 "auto"를 보내 서버의 선택을 받는다.
  const [scope, setScope] = useState<UploaderScope>(null);
  const [scopeReady, setScopeReady] = useState(false);
  const [uploaders, setUploaders] = useState<UploaderEssayProgress[]>([]);
  // 이어서 부르는 전사 요청이 겹치지 않게 — 사용자가 다른 버튼을 누르면 멈춘다
  const transcribing = useRef(false);

  /** 정답을 이 화면에서 바로 저장한다 — 엑셀을 다시 올리러 가지 않아도 되게 */
  async function saveAnswerKey(questionNo: number) {
    await post("setAnswer", { questionNo, text: keyDraft }, `key-${questionNo}`);
    setEditingKey(null);
  }

  /** 서버 응답의 범위·진행·묶음을 화면에 옮긴다 */
  const absorb = useCallback((data: GradePayload) => {
    if (data.questions) setQuestions(data.questions);
    if (Array.isArray(data.uploaders)) setUploaders(data.uploaders);
    if (typeof data.studentCount === "number") setStudentCount(data.studentCount);
    if (typeof data.pendingReview === "number") setPendingReview(data.pendingReview);
    if (data.scope !== undefined) {
      setScope(data.scope);
      setScopeReady(true);
    }
  }, []);

  const scopeParam = scopeReady ? (scope ?? "all") : "auto";

  const load = useCallback(
    async (which: string) => {
      if (!exam?.id) return;
      try {
        const res = await fetch(
          `/api/admin/omr/exams/${exam.id}/essay/grade?uploader=${encodeURIComponent(which)}`,
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "주관식 정보를 불러오지 못했습니다.");
        absorb(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "불러오는 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    },
    [exam?.id, absorb],
  );

  useEffect(() => {
    void load("auto");
    // 처음 한 번만 — 범위를 바꿀 때는 changeScope 가 다시 부른다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam?.id]);

  /** 범위를 바꾸면 그 범위의 묶음을 새로 받는다. 묶음 열쇠가 달라지므로 펼친 것은 닫는다. */
  async function changeScope(next: UploaderScope) {
    if (busy) return;
    setOpenGroup(null);
    setEdits({});
    setMessage("");
    setLoading(true);
    setScope(next);
    setScopeReady(true);
    await load(next ?? "all");
  }

  async function request(action: string, extra: Record<string, unknown> = {}) {
    const res = await fetch(`/api/admin/omr/exams/${exam?.id}/essay/grade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, uploader: scopeParam, ...extra }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "처리하지 못했습니다.");
    absorb(data);
    return data;
  }

  /**
   * 손글씨 읽기 — 서버는 한 번에 상한만큼만 읽고 남은 수를 알려 준다. 남아 있으면
   * 이어서 부른다. 수백 장을 한 요청에 읽다 서버 시간이 끝나는 일을 이렇게 피한다.
   */
  async function transcribeAll() {
    if (!exam?.id || transcribing.current) return;
    transcribing.current = true;
    setBusy("transcribe");
    setError("");
    setMessage("");
    const tally = { transcribed: 0, failed: 0, unclear: 0, cleared: 0, restored: 0, restoreFailed: 0 };
    const restoreReasons: string[] = [];
    let checks: CheckSummary = { ...NO_CHECKS };
    let latest: Question[] = [];
    try {
      let rounds = 0;
      let remaining = 0;
      let restorePending = 0;
      let noOriginal = 0;
      let noImage = 0;
      let auto: AutoSummary | undefined;
      let note = "";
      do {
        rounds += 1;
        const data = await request("transcribe");
        tally.transcribed += Number(data.transcribed ?? 0);
        tally.failed += Number(data.failed ?? 0);
        tally.unclear += Number(data.unclear ?? 0);
        remaining = Number(data.remaining ?? 0);
        noImage = Number(data.noImage ?? 0);
        const restore = data.restore as RestoreReport | undefined;
        if (restore) {
          tally.restored += Number(restore.restored ?? 0);
          tally.restoreFailed += Number(restore.failedCount ?? 0);
          for (const item of restore.failed ?? []) restoreReasons.push(`${item.filename}: ${item.reason}`);
          restorePending = Number(restore.pending ?? 0);
          noOriginal = Number(restore.noOriginal ?? 0);
        }
        auto = (data.auto as AutoSummary | undefined) ?? auto;
        tally.cleared += Number((data.auto as AutoSummary | undefined)?.cleared ?? 0);
        checks = addChecks(checks, data.checks as CheckSummary | undefined);
        if (Array.isArray(data.questions)) latest = data.questions as Question[];
        note = typeof data.message === "string" ? data.message : "";
        if (remaining > 0 || restorePending > 0 || checks.pending > 0) {
          setMessage(
            `손글씨를 읽는 중… ${tally.transcribed}칸 읽음 · 남은 ${remaining}칸` +
              (tally.restored > 0 || restorePending > 0
                ? ` · 원본에서 다시 만든 답안지 ${tally.restored}장${restorePending > 0 ? `(남은 ${restorePending}장)` : ""}`
                : "") +
              (checks.checked > 0 || checks.pending > 0
                ? ` · 손글씨 대조 ${checks.checked}칸${checks.pending > 0 ? `(남은 ${checks.pending}칸)` : ""}`
                : ""),
          );
        }
      } while ((remaining > 0 || restorePending > 0 || checks.pending > 0) && rounds < MAX_TRANSCRIBE_ROUNDS);

      const parts: string[] = [];
      if (tally.restored > 0) {
        parts.push(`보관된 원본으로 답안지 ${tally.restored}장의 손글씨 칸 이미지를 다시 만들어 읽었습니다.`);
      }
      if (tally.transcribed > 0) {
        parts.push(`${tally.transcribed}칸을 읽고 채점했습니다 — ${autoText(auto)}.`);
        if (noImage > 0) {
          parts.push(
            `손글씨 칸 이미지가 없는 ${noImage}칸은 읽을 수 없어 맨 위 '이미지 없음' 묶음에 남았습니다 — 같은 스캔 파일을 다시 올리거나 종이를 보고 학생별로 매겨 주세요.`,
          );
        }
      } else if (tally.failed === 0 && checks.checked === 0) {
        parts.push(note || "새로 읽을 답안이 없습니다.");
      }
      const checkSentence = checkText(checks);
      if (checkSentence) parts.push(checkSentence);
      // 프로그램이 끝내 정하지 못한 답만 사람에게 — 남아 있으면 몇 칸인지 알린다
      const open = openForPerson(latest);
      if (open > 0) parts.push(`판단이 서지 않은 ${open}칸만 '확인 필요'로 남겼습니다. 손글씨를 보고 점수를 정해 주세요.`);
      if (noOriginal > 0 && tally.transcribed > 0) {
        parts.push(`답안지 ${noOriginal}장은 원본도 보관되어 있지 않아 이미지를 다시 만들 수 없습니다.`);
      }
      if (tally.restoreFailed > 0) {
        parts.push(
          `답안지 ${tally.restoreFailed}장은 보관된 원본을 쓰지 못했습니다 — ${restoreReasons.slice(0, 2).join(" / ")}${tally.restoreFailed > 2 ? " 외" : ""}.`,
        );
      }
      if (tally.cleared > 0) {
        parts.push(`못 읽은 답안에 근거 없이 남아 있던 자동 점수 ${tally.cleared}개를 지웠습니다.`);
      }
      if (tally.failed > 0) {
        parts.push(
          `${tally.failed}칸은 읽지 못했습니다(일시적인 오류). 잠시 뒤 '손글씨 읽기'를 다시 누르면 그 칸만 다시 읽습니다.`,
        );
      }
      if (remaining > 0 || restorePending > 0 || checks.pending > 0) {
        parts.push(`아직 남은 답안이 있습니다. '손글씨 읽기'를 다시 눌러 주세요.`);
      }
      setMessage(parts.join(" "));
    } catch (err) {
      setError(err instanceof Error ? err.message : "처리 중 오류가 발생했습니다.");
    } finally {
      transcribing.current = false;
      setBusy(null);
    }
  }

  async function post(action: string, extra: Record<string, unknown> = {}, tag = action) {
    if (!exam?.id) return;
    setBusy(tag);
    setError("");
    setMessage("");
    try {
      let data = await request(action, extra);
      let auto = data.auto as AutoSummary | undefined;
      // 자동 채점·정답 저장은 손글씨 대조를 함께 한다 — 시간이 모자라 남은 칸이 있으면 이어서 부른다
      let checks = addChecks({ ...NO_CHECKS }, data.checks as CheckSummary | undefined);
      for (let round = 0; (action === "autoGrade" || action === "setAnswer") && checks.pending > 0 && round < MAX_TRANSCRIBE_ROUNDS; round += 1) {
        setMessage(`손글씨 대조 중… ${checks.checked}칸 정함 · 남은 ${checks.pending}칸`);
        data = await request("autoGrade");
        auto = (data.auto as AutoSummary | undefined) ?? auto;
        checks = addChecks(checks, data.checks as CheckSummary | undefined);
      }
      const open = Array.isArray(data.questions) ? openForPerson(data.questions as Question[]) : 0;
      const tail = [checkText(checks), open > 0 ? `판단이 서지 않은 ${open}칸만 '확인 필요'로 남겼습니다.` : ""]
        .filter(Boolean)
        .join(" ");
      if (action === "autoGrade") {
        setMessage(
          auto && auto.applied + auto.zeroed > 0
            ? `채점했습니다 — ${autoText(auto)}.${tail ? ` ${tail}` : ""}`
            : tail || "자동으로 매길 답안이 없습니다. 정답을 넣었는지, 손글씨를 읽었는지 확인해 주세요.",
        );
      } else if (action === "gradeGroup") {
        setMessage(`${data.graded}명에게 점수를 매겼습니다. 자동 채점이 다시 돌아도 바뀌지 않습니다.`);
      } else if (action === "gradeOne") {
        setMessage("점수를 저장했습니다. 선생님이 매긴 점수라 자동 채점이 바꾸지 않습니다.");
      } else if (action === "setAnswer") {
        setMessage(`정답을 저장하고 다시 채점했습니다 — ${autoText(auto)}.${tail ? ` ${tail}` : ""}`);
      } else if (action === "fixText") {
        setMessage("전사를 고쳤습니다. 자동 점수였다면 고친 글로 다시 매겼습니다.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "처리 중 오류가 발생했습니다.");
    } finally {
      setBusy(null);
    }
  }

  if (!exam) {
    return (
      <div className="admin-shell">
        <header className="admin-header">
          <div className="brand-lockup">
            <AcademyLogo size="large" href="/admin" />
            <div>
              <strong>주관식 채점</strong>
              <span>목동유쌤영어학원</span>
            </div>
          </div>
          <Link className="button ghost" href="/admin/omr">
            ← 시험 목록
          </Link>
        </header>
        <p className="form-error block">{setupError || "시험을 찾을 수 없습니다."}</p>
      </div>
    );
  }

  const allMembers = questions.flatMap((q) => q.groups.flatMap((g) => g.members));
  const totalAnswers = allMembers.length;
  const totalGraded = allMembers.filter((m) => m.score !== null).length;
  const autoCount = allMembers.filter((m) => m.source === "auto").length;
  // 프로그램이 끝내 정하지 못한 답 — 사람이 정해야 한다
  const unclearCount = allMembers.filter((m) => m.unclear && m.score === null).length;
  // 정답과 다르게 읽혀 손글씨 대조를 기다리는 답 — '자동 채점'이나 '손글씨 읽기'를 누르면 정해진다
  const pendingCount = allMembers.filter((m) => m.pending && m.score === null).length;
  // 못 읽은 답안 중 선생님이 아직 매기지 않은 것 — 이것이 남아 있으면 성적표를 만들 수 없다
  const missingMembers = questions.flatMap((q) =>
    q.groups.filter((g) => g.missing).flatMap((g) => g.members.map((m) => ({ ...m, why: g.missing }))),
  );
  const missingOpen = missingMembers.filter((m) => m.source !== "teacher");
  const noImageOpen = missingOpen.filter((m) => m.why === "noImage").length;
  // 아직 끝나지 않은 범위 — '전체'로 볼 때 누구 몫이 남았는지 알려 준다
  const unfinished = uploaders.filter((u) => u.graded < u.gradable || u.reviewed < u.total);

  return (
    <div className="admin-shell">
      {/* 이 화면은 스캔 검수와 성적표 사이에 있다. 양쪽으로 오갈 길을 둔다. */}
      <header className="admin-header">
        <div className="brand-lockup">
          <AcademyLogo size="large" href="/admin" />
          <div>
            <strong>주관식 채점</strong>
            <span>
              {EXAM_TYPE_LABELS[exam.examType]} · {exam.title}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="button ghost" href="/admin/omr">
            시험 목록
          </Link>
          <Link className="button ghost" href={`/admin/omr/${exam.id}/scans`}>
            ← 스캔 · 검수
          </Link>
          <Link className="button secondary" href={`/admin/omr/${exam.id}/reports`}>
            성적표 →
          </Link>
        </div>
      </header>

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
                onClick={() => void transcribeAll()}
                title="아직 읽지 않은 답안 칸만 읽습니다. 한 번에 120칸씩 읽고 남으면 이어서 읽습니다. 손글씨 칸 이미지가 빠진 답안지는 보관된 원본에서 먼저 다시 만듭니다."
              >
                {busy === "transcribe" ? "읽는 중…" : "손글씨 읽기"}
              </button>
              <button
                className="button primary"
                disabled={busy !== null}
                onClick={() => post("autoGrade")}
                title="정답과 일치하면 만점, 오답으로 보이거나 백지면 0점. 선생님이 매긴 점수는 그대로 둡니다."
              >
                {busy === "autoGrade" ? "채점 중…" : "자동 채점"}
              </button>
            </div>
          ) : null}
        </div>

        {/* 여러 사람이 나눠 올린 시험 — 내가 올린 답안지만 먼저 채점하고, 마친 뒤 '전체'로 합쳐 본다 */}
        {uploaders.length > 0 ? (
          <UploaderScopeBar
            uploaders={uploaders}
            scope={scope}
            disabled={busy !== null || loading}
            onChange={(next) => void changeScope(next)}
            describe={(u) =>
              `검수 ${u.reviewed}/${u.total} · 손글씨 ${u.transcribed}/${u.gradable} · 채점 ${u.graded}/${u.gradable}` +
              (u.unclear > 0 ? ` · 불확실 ${u.unclear}` : "")
            }
            note={
              scope === null
                ? unfinished.length > 0
                  ? `아직 끝나지 않은 범위가 있습니다 — ${unfinished.map((u) => u.displayName).join(", ")}. 전체에서 매긴 점수는 그 사람의 답안지에도 들어갑니다.`
                  : "모든 범위의 답안지를 함께 봅니다. 점수는 범위와 상관없이 학생에게 저장됩니다."
                : "이 범위의 답안지만 읽고 채점합니다. 다른 분이 올린 답안지는 그분이 마친 뒤 '전체'에서 함께 보입니다."
            }
          />
        ) : null}

        <div className="review-summary" style={{ marginTop: 4 }}>
          <div className="review-counts">
            <span>
              채점 대상 <strong>{studentCount}</strong>명
            </span>
            <span className="auto">
              채점 완료 <strong>{totalGraded}</strong>/{totalAnswers}답안
            </span>
            {autoCount > 0 ? (
              <span title="프로그램이 정답과 비교하고 필요하면 손글씨와 다시 대조해 정한 점수">
                프로그램 채점 <strong>{autoCount}</strong>답안
              </span>
            ) : null}
            {pendingCount > 0 ? (
              <span title="정답과 다르게 읽혀 손글씨와 다시 대조할 답 — '자동 채점'을 누르면 프로그램이 정합니다">
                손글씨 대조 대기 <strong>{pendingCount}</strong>답안
              </span>
            ) : null}
            {unclearCount > 0 ? (
              <span className="need" title="손글씨를 다시 대조해도 판단이 서지 않은 답 — 손글씨를 보고 점수를 정해 주세요">
                확인 필요 <strong>{unclearCount}</strong>답안
              </span>
            ) : null}
            {missingOpen.length > 0 ? (
              <span
                className="need"
                title="손글씨를 아직 읽지 않았거나 칸 이미지가 없어 읽을 수 없는 답안 — 매기기 전에는 성적표를 만들 수 없습니다"
              >
                못 읽은 답안 <strong>{missingOpen.length}</strong>
                {noImageOpen > 0 ? ` · 이미지 없음 ${noImageOpen}` : ""}
              </span>
            ) : null}
            {pendingReview > 0 ? (
              <span className="need">
                검수 미완료 <strong>{pendingReview}</strong>장
              </span>
            ) : null}
          </div>
          <p className="review-note">
            손글씨를 읽으면 <strong>프로그램이 직접 채점합니다</strong>. 마침표·쉼표·물음표 같은 문장부호와
            대소문자는 채점하지 않고 낱말과 철자만 봅니다. 정답과 같으면 <strong>만점</strong>, 백지면{" "}
            <strong>0점</strong>입니다. 정답과 다르게 읽힌 답은 손글씨를 잘못 읽었을 수도 있어{" "}
            <strong>손글씨 이미지와 다시 대조</strong>해, 학생이 정답대로 썼으면 만점, 다르게 썼으면 0점으로
            정합니다. 그래도 판단이 서지 않는 답만 <span className="essay-score-chip unclear">확인 필요</span>로
            남깁니다 — 그것만 손글씨를 보고 정해 주세요. 점선 테두리의{" "}
            <span className="essay-score-chip zero auto">자동 0점</span>은 프로그램이 정한 점수이고, 점수를
            고르면 <span className="essay-score-chip full">✓ 점수</span>가 되어 자동 채점이 다시 돌아도 바뀌지
            않습니다. <strong>점수를 누르면 곧바로 저장됩니다</strong>(따로 저장 버튼이 없습니다).
            {pendingReview > 0 ? (
              <>
                {" "}
                검수를 마치지 않은 답안지는 채점 대상에서 빠집니다.{" "}
                <Link href={`/admin/omr/${exam.id}/scans`}>스캔 검수로 이동 →</Link>
              </>
            ) : null}
          </p>
          <p className="essay-legend" aria-label="색 설명">
            <span><i style={{ background: "#2e9e5b" }} />만점</span>
            <span><i style={{ background: "#d9534f" }} />0점</span>
            <span><i style={{ background: "#d99a1e" }} />부분점수</span>
            <span><i style={{ background: "#cfd6df" }} />미채점</span>
            <span>점선 = 프로그램이 정함 · ✓ = 선생님이 정함</span>
          </p>
        </div>
      </div>

      {loading ? (
        <div className="panel">
          <p className="subtle">불러오는 중…</p>
        </div>
      ) : (
        questions.map((q) => {
          const members = q.groups.flatMap((g) => g.members);
          const graded = members.filter((m) => m.score !== null).length;
          const total = members.length;
          const unconfirmed = members.filter((m) => m.source === "auto").length;
          return (
            <div className="panel" key={q.no}>
              <div className="section-heading wrap">
                <div>
                  <h3 style={{ margin: 0, fontSize: 16 }}>
                    {q.no}번 <span className="subtle">· 배점 {fmtPoint(q.point)}점</span>
                  </h3>
                  <p className="subtle" style={{ margin: "4px 0 0" }}>
                    {total}명 → <strong>{q.groups.length}개 묶음</strong> · 채점 {graded}/{total}
                    {unconfirmed > 0 ? ` · 프로그램 채점 ${unconfirmed}` : ""}
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
                        아직 없습니다. 넣어 두면 일치하는 답안은 만점, 나머지는 0점으로 자동 채점됩니다
                        (정답이 없으면 백지만 0점입니다).
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

              {/* 읽을 수 있는데 아직 안 읽은 답안뿐이면 안내만. 이미지가 없는 답안이 있으면
                  손글씨 읽기로는 해결되지 않으므로 묶음을 보여 주어 학생별로 매기게 한다. */}
              {q.transcribed === 0 && q.groups.every((g) => g.missing === "unread") ? (
                <p className="subtle">
                  아직 손글씨를 읽지 않았습니다. 위의 <strong>손글씨 읽기</strong>를 눌러 주세요.
                </p>
              ) : (
                <div className="essay-groups">
                  {q.groups.map((group) => {
                    const groupId = `${q.no}:${group.key}`;
                    if (group.missing) {
                      // 못 읽은 답안 — 학생마다 답이 다르므로 묶음 점수 없이 학생별로 보여 주고 매긴다
                      const done = group.members.filter((m) => m.source === "teacher" && m.score !== null).length;
                      const noImage = group.missing === "noImage";
                      return (
                        <div className={`essay-group missing ${group.missing}`} key={groupId}>
                          <div className="essay-group-head">
                            <span className="essay-count">{group.members.length}명</span>
                            <p className="essay-text">
                              <em>{noImage ? "손글씨 칸 이미지가 없어 읽을 수 없는 답안" : "아직 손글씨를 읽지 않은 답안"}</em>
                            </p>
                            <span className={`essay-badge ${noImage ? "noimage" : "unread"}`}>
                              {noImage ? "이미지 없음" : "읽기 전"}
                            </span>
                            <span className={`essay-score-chip ${done === group.members.length ? "full" : "none"}`}>
                              학생별 채점 {done}/{group.members.length}
                            </span>
                          </div>
                          <p className="essay-missing-note">
                            {noImage
                              ? group.members.some((m) => m.hasOriginal)
                                ? "백지가 아닙니다 — 이미지가 저장되지 않아 읽지 못했을 뿐입니다. 원본 스캔이 보관된 답안지는 위의 '손글씨 읽기'를 누르면 원본에서 칸 이미지를 다시 만들어 읽습니다. 원본도 없는 답안지는 같은 스캔 파일을 다시 올리거나 종이를 보고 학생별로 매겨 주세요."
                                : "백지가 아닙니다 — 이미지가 저장되지 않아 읽지 못했을 뿐입니다. 원본 스캔도 보관되어 있지 않아 다시 만들 수 없습니다. 같은 스캔 파일을 다시 올리면 이미지가 저장되어 읽을 수 있고, 급하면 종이를 보고 학생별로 점수를 매기거나 답을 옮겨 적어 '고침'을 눌러 주세요."
                              : "위의 '손글씨 읽기'를 누르면 읽고 자동 채점합니다. 급하면 아래에서 학생별로 점수를 매길 수 있습니다."}
                          </p>
                          <div className="essay-crops">
                            {group.members.map((member) => {
                              const editKey = `${member.scanId}:${q.no}`;
                              const sheetOpen = sheetPreview === editKey;
                              return (
                                <div className="essay-crop-row" key={member.scanId}>
                                  <div className="essay-crop-head">
                                    <strong>수험번호 {member.studentId ?? "—"}</strong>
                                    {noImage ? (
                                      <span className={`essay-badge ${member.hasOriginal ? "unread" : "noimage"}`}>
                                        {member.hasOriginal ? "원본 있음 · 손글씨 읽기로 다시 만듦" : "원본 없음 · 다시 올려 주세요"}
                                      </span>
                                    ) : null}
                                  </div>
                                  {member.hasCrop ? (
                                    <EssayCrop scanId={member.scanId} questionNo={q.no} />
                                  ) : member.hasPreview ? (
                                    <div className="essay-sheet-preview">
                                      <button
                                        type="button"
                                        className="button tiny ghost"
                                        onClick={() => setSheetPreview(sheetOpen ? null : editKey)}
                                      >
                                        {sheetOpen ? "답안지 닫기" : `답안지 전체 보기 — ${q.no}번 칸을 찾아 확인`}
                                      </button>
                                      {sheetOpen ? <ScanPreview scanId={member.scanId} /> : null}
                                    </div>
                                  ) : (
                                    <p className="essay-crop-empty">
                                      답안지 이미지도 저장되지 않았습니다. 종이 답안지를 보고 매기거나, 같은 스캔 파일을 다시 올려 주세요.
                                    </p>
                                  )}
                                  {canEdit ? (
                                    <>
                                      <MemberScore
                                        member={member}
                                        point={q.point}
                                        disabled={busy !== null}
                                        onScore={(score) =>
                                          void post("gradeOne", { questionNo: q.no, scanId: member.scanId, score }, editKey)
                                        }
                                      />
                                      <div className="essay-fix">
                                        <input
                                          placeholder="학생 답을 옮겨 적으면 정답과 대조해 자동 채점합니다"
                                          onChange={(e) => setEdits((prev) => ({ ...prev, [editKey]: e.target.value }))}
                                        />
                                        <button
                                          className="button tiny secondary"
                                          disabled={busy !== null || edits[editKey] === undefined}
                                          onClick={() =>
                                            post("fixText", { questionNo: q.no, scanId: member.scanId, text: edits[editKey] ?? "" }, editKey)
                                          }
                                        >
                                          고침
                                        </button>
                                      </div>
                                    </>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    }
                    const state = groupState(group, q.point);
                    const isOpen = openGroup === groupId;
                    const chipLabel =
                      state.kind === "none"
                        ? "미채점"
                        : state.kind === "mixed"
                          ? "학생별로 다름"
                          : state.kind === "full"
                            ? `만점 ${fmtPoint(state.score ?? q.point)}점`
                            : state.kind === "zero"
                              ? "0점"
                              : `${fmtPoint(state.score ?? 0)}점`;
                    return (
                      <div
                        className={`essay-group state-${state.kind}${group.matchesKey ? " match" : ""}${group.blank ? " blank" : ""}${group.unclear ? " unclear" : ""}`}
                        key={groupId}
                      >
                        <div className="essay-group-head">
                          <span className="essay-count">{group.members.length}명</span>
                          <p className="essay-text">
                            {group.blank ? (
                              <em>(백지)</em>
                            ) : group.unclear && !group.text ? (
                              <em>(글씨를 알아볼 수 없음 — 백지일 수도, 못 알아본 글씨일 수도 있습니다)</em>
                            ) : (
                              group.text
                            )}
                          </p>
                          {group.matchesKey ? <span className="essay-badge">정답 일치</span> : null}
                          {group.unclear && group.members.some((m) => m.score === null) ? (
                            <span
                              className="essay-badge unclear"
                              title="손글씨를 다시 대조해도 프로그램이 판단하지 못한 답입니다. 손글씨를 보고 점수를 정해 주세요."
                            >
                              확인 필요
                            </span>
                          ) : null}
                          {group.members.some((m) => m.pending && m.score === null) ? (
                            <span
                              className="essay-badge unread"
                              title="정답과 다르게 읽혀 손글씨와 다시 대조할 답입니다. '자동 채점'을 누르면 프로그램이 정합니다."
                            >
                              손글씨 대조 대기
                            </span>
                          ) : null}
                          {/* 누르는 즉시 저장되므로, 저장됐다는 사실과 출처를 눈에 보이게 남긴다 */}
                          <span
                            className={`essay-score-chip ${state.kind}${state.auto && state.kind !== "none" ? " auto" : ""}`}
                            title={
                              state.kind === "none"
                                ? "아직 점수가 없습니다"
                                : state.auto
                                  ? "자동 채점 — 아직 사람이 확인하지 않았습니다"
                                  : "선생님이 확인한 점수 — 자동 채점이 바꾸지 않습니다"
                            }
                          >
                            {state.kind !== "none" && state.kind !== "mixed" ? (state.auto ? "자동 " : "✓ ") : ""}
                            {chipLabel}

                          </span>
                        </div>

                        {canEdit ? (
                          <div className="essay-actions">
                            <span className="subtle">점수</span>
                            {[q.point, q.point / 2, 0].map((value) => {
                              // 화면에는 반올림해 보여 주되, 저장은 정확한 값으로 한다
                              const on =
                                state.kind !== "none" &&
                                state.kind !== "mixed" &&
                                !state.auto &&
                                state.score !== null &&
                                Math.abs(state.score - value) < 0.05;
                              return (
                                <button
                                  key={fmtPoint(value)}
                                  className={`button tiny${on ? " primary" : " ghost"}`}
                                  disabled={busy !== null}
                                  onClick={() =>
                                    post(
                                      "gradeGroup",
                                      { questionNo: q.no, groupKey: group.key, score: value },
                                      groupId,
                                    )
                                  }
                                >
                                  {fmtPoint(value)}
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
                              title="부분점수를 직접 입력합니다. Enter를 누르거나 칸을 벗어나면 저장됩니다."
                              disabled={busy !== null}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                              }}
                              // Enter만 받으면 입력해 놓고 저장이 안 된 줄 모르는 일이 생긴다.
                              // 칸을 벗어날 때도 저장하되, 값이 실제로 바뀐 경우만 보낸다.
                              onBlur={(e) => {
                                const raw = e.target.value.trim();
                                if (!raw) return;
                                const value = Number(raw);
                                if (!Number.isFinite(value)) return;
                                const clamped = Math.max(0, Math.min(q.point, value));
                                if (
                                  !state.auto &&
                                  state.score !== null &&
                                  state.score === Math.round(clamped * 10) / 10
                                )
                                  return;
                                e.target.value = "";
                                void post(
                                  "gradeGroup",
                                  { questionNo: q.no, groupKey: group.key, score: value },
                                  groupId,
                                );
                              }}
                            />
                            {state.auto && state.score !== null ? (
                              // 자동 점수를 사람이 본 뒤 그대로 둔다 — 출처가 선생님으로 바뀌어 ✓가 된다
                              <button
                                className="button tiny secondary"
                                disabled={busy !== null}
                                title="프로그램이 정한 이 점수를 선생님 점수로 고정합니다 — 자동 채점이 다시 돌아도 바뀌지 않습니다. 누르지 않아도 성적표에는 이 점수가 들어갑니다."
                                onClick={() =>
                                  post(
                                    "gradeGroup",
                                    { questionNo: q.no, groupKey: group.key, score: state.score },
                                    groupId,
                                  )
                                }
                              >
                                이 점수로 고정
                              </button>
                            ) : null}
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
                                    {member.unclear && member.score === null ? (
                                      <span className="essay-badge unclear">확인 필요</span>
                                    ) : null}
                                    {member.flag === "match" ? (
                                      <span className="essay-badge" title="처음에 잘못 읽었던 글자를 손글씨와 다시 대조해 정답대로 쓴 것을 확인했습니다">
                                        손글씨 대조 · 정답대로 씀
                                      </span>
                                    ) : member.flag === "mismatch" ? (
                                      <span className="essay-badge noimage" title="손글씨와 다시 대조해 정답과 다르게 쓴 것을 확인했습니다">
                                        손글씨 대조 · 다르게 씀
                                      </span>
                                    ) : member.flag === "typed" ? (
                                      <span className="essay-badge unread">사람이 옮겨 적음</span>
                                    ) : null}
                                    {member.score !== null ? (
                                      <span>
                                        {fmtPoint(member.score)}점{member.source === "auto" ? " (자동)" : ""}
                                      </span>
                                    ) : null}
                                  </div>
                                  {member.hasCrop ? (
                                    <EssayCrop scanId={member.scanId} questionNo={q.no} />
                                  ) : (
                                    <p className="essay-crop-empty">
                                      손글씨 칸 이미지가 없습니다. 같은 스캔 파일을 다시 올리면 저장됩니다.
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
