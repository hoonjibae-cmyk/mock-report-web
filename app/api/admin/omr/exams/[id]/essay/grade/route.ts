import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { getAiModel } from "@/lib/app-settings";
import {
  applyGroupScore,
  autoGrade,
  autoVerdict,
  clampEssayScore,
  groupEssayAnswers,
  parseAcceptedAnswers,
  type CurrentScore,
  type EssayAnswer,
  type EssayFlag,
  type EssayGradeSource,
} from "@/lib/essay-grading";
import { updateExamAnswerKey } from "@/lib/omr-exams";
import { getVisibleExam } from "@/lib/exam-access";
import { downloadEssayCrop, listScans, patchScanEssay, type OmrScan } from "@/lib/omr-scans";
import { essayCountOf, pointFor } from "@/lib/omr-scoring";
import { scriptOf, transcribeMany, TranscribeNotConfiguredError } from "@/lib/omr-transcribe";
import { loadUploaderNames } from "@/lib/uploader-names";
import { filterByUploader, parseScopeParam, summarizeEssayProgress, type UploaderScope } from "@/lib/uploaders";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * 주관식 전사·채점.
 *
 * 60명을 학생 단위로 채점하면 60번 판단해야 하지만, 영작은 답이 몇 갈래로
 * 수렴한다. 같은 답끼리 묶으면 판단 횟수가 크게 줄고 "같은 답에 같은 점수"가
 * 구조적으로 보장된다.
 *
 * 자동 채점은 일치하면 만점, 오답으로 보이거나 백지면 **우선 0점**이다. 자동
 * 점수는 출처 'auto'로 남아 다시 돌리면 바뀔 수 있고, 선생님이 확인하거나 매긴
 * 점수('teacher')는 건드리지 않는다. 손글씨를 읽은 직후와 정답을 고친 직후에도
 * 자동 채점이 돈다 — 버튼을 한 번 더 누르지 않아도 화면이 맞아떨어지게.
 *
 * **범위(uploader)** — 여러 직원이 답안지를 나눠 올린 시험에서는 각자 자기가 올린
 * 답안지만 먼저 읽고 채점한다. 모든 요청이 `uploader`(계정 ID · "all" · "auto")를
 * 받아 그 범위의 답안지만 다룬다. 범위는 화면의 일일 뿐, 성적표는 늘 전체로 만든다.
 *
 * GET   현재 전사·채점 상태(묶음 목록) + 올린 사람별 진행
 * POST  { action: "transcribe" }        아직 읽지 않은 답안 칸을 읽는다(한 번에 상한만큼,
 *                                      남으면 remaining 으로 알려 화면이 이어서 부른다)
 *       { action: "autoGrade" }          자동 채점(선생님 점수는 그대로)
 *       { action: "gradeGroup", ... }    한 묶음 전체에 같은 점수 — 선생님 점수가 된다
 *       { action: "gradeOne", ... }      학생 한 명의 한 칸에 점수 — 못 읽은 답안(학생마다 답이 다르다)용
 *       { action: "fixText", ... }       전사를 고친다(그 학생의 자동 점수는 다시 매긴다)
 *       { action: "setAnswer", ... }     정답을 넣거나 고치고 자동 채점을 다시 돈다
 */

/** 한 요청에서 읽는 답안 칸 수 상한 — 서버 함수 제한 시간 안에 끝나고, 끊겨도 여기까지는 남는다 */
const TRANSCRIBE_BATCH = 120;
/** 이만큼 읽을 때마다 저장한다 — 중간에 끊겨도 읽은 것은 남는다 */
const SAVE_EVERY = 30;

/** 이 시험의 주관식 문항 번호 */
function essayNumbers(exam: { numQuestions: number }, count: number): number[] {
  return Array.from({ length: count }, (_, i) => exam.numQuestions + i + 1);
}

/** 채점 대상 답안지 — 검수를 마친 것만 본다(수험번호가 확정되어야 점수가 제자리로 간다) */
function gradableScans(scans: OmrScan[]): OmrScan[] {
  return scans.filter((scan) => scan.status === "reviewed" && scan.studentId);
}

type Exam = NonNullable<Awaited<ReturnType<typeof getVisibleExam>>>;

function buildGroups(exam: Exam | null, scans: OmrScan[]) {
  if (!exam) return [];
  const count = essayCountOf(exam);
  const gradable = gradableScans(scans);
  return essayNumbers(exam, count).map((no) => {
    const key = String(no);
    const accepted = parseAcceptedAnswers(exam.answerKey?.[key]);
    const answers: EssayAnswer[] = gradable.map((scan) => {
      // 전사가 없으면 백지가 아니다 — 칸 이미지가 있으면 '아직 안 읽음', 없으면 '읽을 수 없음'
      const read = key in (scan.essayAnswers ?? {});
      return {
        scanId: scan.id,
        studentId: scan.studentId,
        text: read ? (scan.essayAnswers?.[key] ?? "") : "",
        unclear: read && scan.essayFlags?.[key] === "unclear",
        missing: read ? undefined : scan.essayCrops?.[key] ? "unread" : "noImage",
      };
    });
    return {
      no,
      point: pointFor(exam, no),
      accepted,
      transcribed: gradable.filter((s) => key in (s.essayAnswers ?? {})).length,
      groups: groupEssayAnswers(answers, accepted),
    };
  });
}

/** 한 문항의 학생별 현재 점수와 출처 — 자동 채점이 덮어써도 되는지 가른다 */
function currentScores(scans: OmrScan[], no: number): Record<string, CurrentScore | undefined> {
  const key = String(no);
  const out: Record<string, CurrentScore | undefined> = {};
  for (const scan of scans) {
    const score = scan.essayScores?.[key];
    if (typeof score !== "number") continue;
    // 출처를 모르는 옛 점수는 선생님이 매긴 것으로 본다 — 덮어쓰지 않는다
    out[scan.id] = { score, source: scan.essayScoreSources?.[key] ?? "teacher" };
  }
  return out;
}

export interface AutoSummary {
  /** 자동 만점 */
  applied: number;
  /** 자동 0점 — 확인이 필요한 쪽 */
  zeroed: number;
  /** 선생님 점수라 건드리지 않은 답안 */
  kept: number;
  /** 지금은 판정할 수 없어 지운 예전 자동 점수(못 읽은 답안에 남아 있던 0점 등) */
  cleared: number;
}

/**
 * 자동 채점을 돌리고 저장한다 — 일치는 만점, 오답으로 보이거나 백지는 0점, 선생님 점수는 그대로.
 * 못 읽은 답안에 남은 자동 점수는 지운다. 값이 그대로인 칸은 다시 쓰지 않는다 — 손글씨를
 * 나눠 읽는 동안 몇 번이고 돌기 때문이다.
 */
async function runAutoGrade(exam: Exam, scans: OmrScan[]): Promise<AutoSummary> {
  const summary: AutoSummary = { applied: 0, zeroed: 0, kept: 0, cleared: 0 };
  const byId = new Map(scans.map((scan) => [scan.id, scan]));
  const updates = new Map<string, { scores: Record<string, number | null>; sources: Record<string, EssayGradeSource | null> }>();
  const entry = (scanId: string) => {
    const found = updates.get(scanId) ?? { scores: {}, sources: {} };
    updates.set(scanId, found);
    return found;
  };
  for (const q of buildGroups(exam, scans)) {
    const qk = String(q.no);
    const result = autoGrade(q.groups, q.point, { accepted: q.accepted, current: currentScores(scans, q.no) });
    summary.kept += result.kept;
    for (const [scanId, score] of Object.entries(result.scores)) {
      if (score >= q.point - 1e-9) summary.applied += 1;
      else summary.zeroed += 1;
      const scan = byId.get(scanId);
      const unchanged = scan?.essayScores?.[qk] === score && scan?.essayScoreSources?.[qk] === "auto";
      if (unchanged) continue;
      const e = entry(scanId);
      e.scores[qk] = score;
      e.sources[qk] = "auto";
    }
    for (const scanId of result.cleared) {
      summary.cleared += 1;
      const e = entry(scanId);
      e.scores[qk] = null;
      e.sources[qk] = null;
    }
  }
  for (const [scanId, patch] of updates) {
    await patchScanEssay(scanId, patch);
  }
  return summary;
}

/** 화면으로 내보낼 모양 — 점수·출처와 이미지 유무를 함께 붙인다 */
function serialize(questions: ReturnType<typeof buildGroups>, scans: OmrScan[]) {
  const byId = new Map(scans.map((scan) => [scan.id, scan]));
  return questions.map((q) => ({
    no: q.no,
    point: q.point,
    accepted: q.accepted,
    transcribed: q.transcribed,
    groups: q.groups.map((group) => ({
      key: group.key,
      text: group.text,
      matchesKey: group.matchesKey,
      blank: group.blank,
      unclear: group.unclear,
      missing: group.missing,
      members: group.members.map((member) => {
        const scan = byId.get(member.scanId);
        const score = scan?.essayScores?.[String(q.no)];
        return {
          scanId: member.scanId,
          studentId: member.studentId,
          score: typeof score === "number" ? score : null,
          // 출처를 모르는 옛 점수는 선생님 것으로 본다
          source: typeof score === "number" ? (scan?.essayScoreSources?.[String(q.no)] ?? "teacher") : null,
          hasCrop: Boolean(scan?.essayCrops?.[String(q.no)]),
          // 칸 이미지가 없을 때 답안지 전체 미리보기로라도 보게 한다
          hasPreview: Boolean(scan?.previewPath),
          unclear: scan?.essayFlags?.[String(q.no)] === "unclear",
        };
      }),
    })),
  }));
}

/** 화면이 범위와 진행을 함께 받도록 한 번에 꾸린다 */
async function payload(exam: Exam, all: OmrScan[], scope: UploaderScope, me: string) {
  const scoped = filterByUploader(all, scope);
  const gradable = gradableScans(scoped);
  const keys = essayNumbers(exam, essayCountOf(exam)).map(String);
  const names = await loadUploaderNames();
  return {
    me,
    scope,
    uploaders: summarizeEssayProgress(all, keys, names, me),
    studentCount: gradable.length,
    pendingReview: scoped.length - gradable.length,
    questions: serialize(buildGroups(exam, scoped), scoped),
  };
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApi("viewReports");
  if (auth.response) return auth.response;
  const { id } = await context.params;

  try {
    const exam = await getVisibleExam(id);
    if (!exam) return NextResponse.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });
    if (essayCountOf(exam) === 0) {
      return NextResponse.json({ error: "이 시험에는 주관식 문항이 없습니다." }, { status: 400 });
    }
    const scans = await listScans(id);
    const scope = parseScopeParam(new URL(request.url).searchParams.get("uploader"), auth.user.username, scans);
    return NextResponse.json({ ok: true, ...(await payload(exam, scans, scope, auth.user.username)) });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "주관식 채점 정보 오류" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApi("createReports");
  if (auth.response) return auth.response;
  const { id } = await context.params;
  const me = auth.user.username;

  try {
    const exam = await getVisibleExam(id);
    if (!exam) return NextResponse.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });
    const count = essayCountOf(exam);
    if (count === 0) {
      return NextResponse.json({ error: "이 시험에는 주관식 문항이 없습니다." }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const all = await listScans(id);
    // 범위 — 화면이 보낸 값. 안 보냈으면 전체(예전 화면·외부 호출 호환)
    const scope = parseScopeParam(body.uploader ?? "all", me, all);
    const scans = filterByUploader(all, scope);
    const gradable = gradableScans(scans);
    const numbers = essayNumbers(exam, count);
    const respond = async (extra: Record<string, unknown>) =>
      NextResponse.json({ ok: true, ...extra, ...(await payload(exam, await listScans(id), scope, me)) });

    // --- 전사: 아직 읽지 않은 답안 칸만 읽는다(이미 읽은 것을 다시 읽으면 낭비다) ---
    if (body.action === "transcribe") {
      if (gradable.length === 0) {
        return NextResponse.json(
          { error: "검수를 마친 답안지가 없습니다. 먼저 스캔 검수를 끝내 주세요." },
          { status: 400 },
        );
      }

      // 정답을 입력해 뒀으면 어느 글자로 쓰인 답인지 알 수 있다. 후보가 줄면
      // 오독이 준다 — 특히 한글은 구별할 음절이 많아 효과가 크다.
      // (글자 종류만 알려 준다. 정답 문장을 알려 주면 모델이 그쪽으로 끌려가
      //  틀린 답을 맞은 답으로 읽는다.)
      const scriptByQuestion = new Map<number, ReturnType<typeof scriptOf>>();
      for (const no of numbers) {
        scriptByQuestion.set(no, scriptOf(parseAcceptedAnswers(exam.answerKey?.[String(no)])));
      }

      // 읽을 칸 — 전사가 없는 칸. 실패해 저장하지 못한 칸도 전사가 없으므로 여기 다시 들어온다.
      const candidates: Array<{ scan: OmrScan; question: number; path: string }> = [];
      for (const scan of gradable) {
        for (const no of numbers) {
          const qk = String(no);
          // 선생님이 이미 고쳐 둔 전사를 덮어쓰지 않는다
          if (qk in (scan.essayAnswers ?? {}) && !body.force) continue;
          const path = scan.essayCrops?.[qk];
          if (path) candidates.push({ scan, question: no, path });
        }
      }

      // 손글씨 칸 이미지가 없어 읽을 수 없는 칸 — 다시 올리거나 종이를 보고 매겨야 한다
      const noImage = gradable.reduce(
        (sum, scan) =>
          sum +
          numbers.filter((no) => !(String(no) in (scan.essayAnswers ?? {})) && !scan.essayCrops?.[String(no)]).length,
        0,
      );

      if (candidates.length === 0) {
        // 읽을 것은 없어도 자동 채점은 돈다 — 못 읽은 답안에 남아 있던 예전 자동 0점을 지운다
        const auto = await runAutoGrade(exam, scans);
        return respond({
          transcribed: 0,
          failed: 0,
          unclear: 0,
          remaining: 0,
          noImage,
          auto,
          message:
            noImage > 0
              ? `손글씨 칸 이미지가 없는 답안 ${noImage}칸은 읽을 수 없습니다. 같은 스캔 파일을 다시 올리면 이미지가 저장되고, 급하면 맨 위 '이미지 없음' 묶음에서 종이를 보고 학생별로 점수를 매겨 주세요.`
              : "새로 읽을 답안이 없습니다.",
        });
      }

      // 한 요청에 상한만큼만 — 수백 장을 한 번에 읽다 서버 시간이 끝나면 읽은 것까지 날아간다.
      const batch = candidates.slice(0, TRANSCRIBE_BATCH);
      const remaining = candidates.length - batch.length;
      const model = await getAiModel();
      let transcribed = 0;
      let unclear = 0;
      let failed = 0;

      for (let i = 0; i < batch.length; i += SAVE_EVERY) {
        const slice = batch.slice(i, i + SAVE_EVERY);
        const jobs: Array<{ key: string; jpeg: Buffer; question: number; scanId: string }> = [];
        for (const item of slice) {
          const jpeg = await downloadEssayCrop(item.path);
          if (jpeg) jobs.push({ key: `${item.scan.id}:${item.question}`, jpeg, question: item.question, scanId: item.scan.id });
          else failed += 1;
        }
        const results = await transcribeMany(
          jobs.map(({ key, jpeg, question }) => ({ key, jpeg, question, script: scriptByQuestion.get(question) ?? null })),
          model,
        );

        // 학생별로 모아 저장한다. 실패한 칸은 저장하지 않는다 — 빈 답으로 남기면 0점이 되고 다시 읽지도 않는다.
        const perScan = new Map<string, { answers: Record<string, string>; flags: Record<string, EssayFlag | null> }>();
        for (const job of jobs) {
          const transcript = results.get(job.key);
          if (!transcript) {
            failed += 1;
            continue;
          }
          const entry = perScan.get(job.scanId) ?? { answers: {}, flags: {} };
          const qk = String(job.question);
          entry.answers[qk] = transcript.text;
          entry.flags[qk] = transcript.unclear ? "unclear" : null;
          perScan.set(job.scanId, entry);
          transcribed += 1;
          if (transcript.unclear) unclear += 1;
        }
        for (const [scanId, patch] of perScan) {
          await patchScanEssay(scanId, patch);
        }
      }

      // 읽은 만큼 바로 자동 채점 — 바뀐 칸만 다시 쓰므로 나눠 읽는 동안 여러 번 돌아도 가볍다.
      // 중간에 끊겨도 읽은 답안의 점수가 예전 판정(못 읽은 칸의 0점 등)으로 남지 않는다.
      const auto = await runAutoGrade(exam, filterByUploader(await listScans(id), scope));
      return respond({ transcribed, failed, unclear, remaining, noImage, auto });
    }

    // --- 자동 채점: 선생님 점수는 그대로, 나머지는 일치=만점 · 오답·백지=0점 ---
    if (body.action === "autoGrade") {
      const auto = await runAutoGrade(exam, scans);
      return respond({ applied: auto.applied, zeroed: auto.zeroed, kept: auto.kept, auto });
    }

    // --- 묶음 채점: 같은 답을 쓴 학생 전원에게 같은 점수 — 선생님 점수가 된다 ---
    if (body.action === "gradeGroup") {
      const no = Number(body.questionNo);
      if (!numbers.includes(no)) {
        return NextResponse.json({ error: "주관식 문항이 아닙니다." }, { status: 400 });
      }
      const score = Number(body.score);
      if (!Number.isFinite(score)) {
        return NextResponse.json({ error: "점수를 숫자로 입력해 주세요." }, { status: 400 });
      }
      const question = buildGroups(exam, scans).find((q) => q.no === no);
      const group = question?.groups.find((g) => g.key === String(body.groupKey ?? ""));
      if (!question || !group) {
        return NextResponse.json({ error: "채점할 답안 묶음을 찾지 못했습니다." }, { status: 404 });
      }
      // 못 읽은 답안 묶음은 학생마다 답이 다르다 — 한 점수를 모두에게 줄 수 없다
      if (group.missing) {
        return NextResponse.json(
          { error: "아직 읽지 못한 답안은 학생마다 답이 달라 한 번에 매길 수 없습니다. 학생별로 매겨 주세요." },
          { status: 400 },
        );
      }

      const qk = String(no);
      const scores = applyGroupScore(group, score, question.point);
      for (const [scanId, value] of Object.entries(scores)) {
        // 선생님이 보고 매긴 점수 — 판독 불확실 표시는 이제 할 일을 다했다
        await patchScanEssay(scanId, { scores: { [qk]: value }, sources: { [qk]: "teacher" }, flags: { [qk]: null } });
      }
      return respond({ graded: Object.keys(scores).length });
    }

    // --- 학생별 채점: 못 읽은 답안(손글씨 칸 이미지가 없거나 아직 안 읽음)을 종이·미리보기를 보고 매긴다 ---
    if (body.action === "gradeOne") {
      const no = Number(body.questionNo);
      const scanId = String(body.scanId ?? "");
      if (!numbers.includes(no) || !scanId) {
        return NextResponse.json({ error: "문항 또는 답안지를 찾지 못했습니다." }, { status: 400 });
      }
      const score = Number(body.score);
      if (!Number.isFinite(score)) {
        return NextResponse.json({ error: "점수를 숫자로 입력해 주세요." }, { status: 400 });
      }
      if (!gradable.some((scan) => scan.id === scanId)) {
        return NextResponse.json({ error: "검수를 마친 답안지에만 점수를 매길 수 있습니다." }, { status: 404 });
      }
      const qk = String(no);
      const value = clampEssayScore(score, pointFor(exam, no));
      await patchScanEssay(scanId, { scores: { [qk]: value }, sources: { [qk]: "teacher" }, flags: { [qk]: null } });
      return respond({ graded: 1 });
    }

    // --- 전사 정정: 잘못 읽은 답안을 사람이 고친다 ---
    if (body.action === "fixText") {
      const no = Number(body.questionNo);
      const scanId = String(body.scanId ?? "");
      if (!numbers.includes(no) || !scanId) {
        return NextResponse.json({ error: "문항 또는 답안지를 찾지 못했습니다." }, { status: 400 });
      }
      const scan = scans.find((s) => s.id === scanId);
      if (!scan) return NextResponse.json({ error: "답안지를 찾지 못했습니다." }, { status: 404 });

      const qk = String(no);
      const text = String(body.text ?? "").slice(0, 2000);

      // 자동으로 매긴 점수는 고친 글로 다시 판정한다. 선생님이 매긴 점수는 그대로 —
      // 글을 고쳤다고 점수까지 바꿀 권한이 자동 채점에는 없다. 사람이 고친 글은 확실한 글이다.
      const hasScore = typeof scan.essayScores?.[qk] === "number";
      const source = scan.essayScoreSources?.[qk];
      if (!hasScore || source === "auto") {
        const verdict = autoVerdict(text, parseAcceptedAnswers(exam.answerKey?.[qk]), pointFor(exam, no));
        await patchScanEssay(scanId, {
          answers: { [qk]: text },
          flags: { [qk]: null },
          scores: { [qk]: verdict },
          sources: { [qk]: verdict === null ? null : "auto" },
        });
      } else {
        await patchScanEssay(scanId, { answers: { [qk]: text }, flags: { [qk]: null } });
      }
      return respond({});
    }

    // --- 정답 입력: 채점 화면에서 바로 넣고, 자동 채점을 다시 돈다 ---
    if (body.action === "setAnswer") {
      const no = Number(body.questionNo);
      if (!numbers.includes(no)) {
        return NextResponse.json({ error: "주관식 문항이 아닙니다." }, { status: 400 });
      }
      const text = String(body.text ?? "").trim().slice(0, 2000);
      const answerKey = { ...(exam.answerKey ?? {}) };
      if (text) answerKey[String(no)] = text;
      else delete answerKey[String(no)];
      await updateExamAnswerKey(id, answerKey);

      const freshExam = await getVisibleExam(id);
      if (!freshExam) return NextResponse.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });
      // 정답은 시험 전체의 것이라 자동 채점도 전체에 돈다 — 다른 사람 범위의 자동 점수도 새 정답을 따라야 한다
      const auto = await runAutoGrade(freshExam, all);
      return NextResponse.json({ ok: true, auto, ...(await payload(freshExam, await listScans(id), scope, me)) });
    }

    return NextResponse.json(
      { error: "action은 transcribe · autoGrade · gradeGroup · gradeOne · fixText · setAnswer 중 하나여야 합니다." },
      { status: 400 },
    );
  } catch (error) {
    console.error(error);
    if (error instanceof TranscribeNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "주관식 채점 오류" },
      { status: 500 },
    );
  }
}
