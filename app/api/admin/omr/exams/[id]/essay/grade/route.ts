import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { getAiModel } from "@/lib/app-settings";
import {
  applyGroupScore,
  autoGrade,
  autoVerdict,
  groupEssayAnswers,
  parseAcceptedAnswers,
  type CurrentScore,
  type EssayAnswer,
  type EssayGradeSource,
} from "@/lib/essay-grading";
import { updateExamAnswerKey } from "@/lib/omr-exams";
import { getVisibleExam } from "@/lib/exam-access";
import { downloadEssayCrop, listScans, updateScan, type OmrScan } from "@/lib/omr-scans";
import { essayCountOf, pointFor } from "@/lib/omr-scoring";
import { scriptOf, transcribeMany, TranscribeNotConfiguredError } from "@/lib/omr-transcribe";

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
 * GET   현재 전사·채점 상태(묶음 목록)
 * POST  { action: "transcribe" }        아직 전사하지 않은 답안을 읽고 자동 채점
 *       { action: "autoGrade" }          자동 채점(선생님 점수는 그대로)
 *       { action: "gradeGroup", ... }    한 묶음 전체에 같은 점수 — 선생님 점수가 된다
 *       { action: "fixText", ... }       전사를 고친다(그 학생의 자동 점수는 다시 매긴다)
 *       { action: "setAnswer", ... }     정답을 넣거나 고치고 자동 채점을 다시 돈다
 */

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
  return essayNumbers(exam, count).map((no) => {
    const key = String(no);
    const accepted = parseAcceptedAnswers(exam.answerKey?.[key]);
    const answers: EssayAnswer[] = gradableScans(scans).map((scan) => ({
      scanId: scan.id,
      studentId: scan.studentId,
      text: scan.essayAnswers?.[key] ?? "",
    }));
    return {
      no,
      point: pointFor(exam, no),
      accepted,
      transcribed: gradableScans(scans).filter((s) => key in (s.essayAnswers ?? {})).length,
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
}

/** 자동 채점을 돌리고 저장한다 — 일치는 만점, 오답으로 보이거나 백지는 0점, 선생님 점수는 그대로 */
async function runAutoGrade(exam: Exam, scans: OmrScan[]): Promise<AutoSummary> {
  const summary: AutoSummary = { applied: 0, zeroed: 0, kept: 0 };
  const scoreUpdates = new Map<string, Record<string, number>>();
  const sourceUpdates = new Map<string, Record<string, EssayGradeSource>>();
  for (const q of buildGroups(exam, scans)) {
    const result = autoGrade(q.groups, q.point, { accepted: q.accepted, current: currentScores(scans, q.no) });
    summary.kept += result.kept;
    for (const [scanId, score] of Object.entries(result.scores)) {
      const scores = scoreUpdates.get(scanId) ?? {};
      scores[String(q.no)] = score;
      scoreUpdates.set(scanId, scores);
      const sources = sourceUpdates.get(scanId) ?? {};
      sources[String(q.no)] = "auto";
      sourceUpdates.set(scanId, sources);
      if (score >= q.point - 1e-9) summary.applied += 1;
      else summary.zeroed += 1;
    }
  }
  for (const [scanId, scores] of scoreUpdates) {
    const scan = scans.find((s) => s.id === scanId);
    await updateScan(scanId, {
      essayScores: { ...(scan?.essayScores ?? {}), ...scores },
      essayScoreSources: { ...(scan?.essayScoreSources ?? {}), ...(sourceUpdates.get(scanId) ?? {}) },
    });
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
        };
      }),
    })),
  }));
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
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
    const gradable = gradableScans(scans);
    return NextResponse.json({
      ok: true,
      studentCount: gradable.length,
      pendingReview: scans.length - gradable.length,
      questions: serialize(buildGroups(exam, scans), scans),
    });
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

  try {
    const exam = await getVisibleExam(id);
    if (!exam) return NextResponse.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });
    const count = essayCountOf(exam);
    if (count === 0) {
      return NextResponse.json({ error: "이 시험에는 주관식 문항이 없습니다." }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const scans = await listScans(id);
    const gradable = gradableScans(scans);
    const numbers = essayNumbers(exam, count);

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

      const jobs: Array<{ key: string; jpeg: Buffer; question: number; scan: OmrScan }> = [];
      for (const scan of gradable) {
        for (const no of numbers) {
          const qk = String(no);
          // 선생님이 이미 고쳐 둔 전사를 덮어쓰지 않는다
          if (qk in (scan.essayAnswers ?? {}) && !body.force) continue;
          const path = scan.essayCrops?.[qk];
          if (!path) continue;
          const jpeg = await downloadEssayCrop(path);
          if (jpeg) jobs.push({ key: `${scan.id}:${qk}`, jpeg, question: no, scan });
        }
      }

      if (jobs.length === 0) {
        return NextResponse.json({
          ok: true,
          transcribed: 0,
          message:
            "새로 읽을 답안이 없습니다. 이 기능이 생기기 전에 올린 답안지라면 스캔을 다시 올려 주세요.",
        });
      }

      const model = await getAiModel();
      const results = await transcribeMany(
        jobs.map(({ key, jpeg, question }) => ({
          key,
          jpeg,
          question,
          script: scriptByQuestion.get(question) ?? null,
        })),
        model,
      );

      // 학생별로 모아 한 번에 저장한다
      const patch = new Map<string, Record<string, string>>();
      for (const job of jobs) {
        const transcript = results.get(job.key);
        if (!transcript) continue;
        const current = patch.get(job.scan.id) ?? { ...(job.scan.essayAnswers ?? {}) };
        current[String(job.question)] = transcript.text;
        patch.set(job.scan.id, current);
      }
      for (const [scanId, essayAnswers] of patch) {
        await updateScan(scanId, { essayAnswers });
      }

      // 읽자마자 자동 채점 — 일치는 만점, 오답으로 보이거나 백지는 우선 0점
      const auto = await runAutoGrade(exam, await listScans(id));
      const fresh = await listScans(id);
      return NextResponse.json({
        ok: true,
        transcribed: jobs.length,
        auto,
        studentCount: gradable.length,
        questions: serialize(buildGroups(exam, fresh), fresh),
      });
    }

    // --- 자동 채점: 선생님 점수는 그대로, 나머지는 일치=만점 · 오답·백지=0점 ---
    if (body.action === "autoGrade") {
      const auto = await runAutoGrade(exam, scans);
      const fresh = await listScans(id);
      return NextResponse.json({
        ok: true,
        applied: auto.applied,
        zeroed: auto.zeroed,
        kept: auto.kept,
        auto,
        questions: serialize(buildGroups(exam, fresh), fresh),
      });
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

      const scores = applyGroupScore(group, score, question.point);
      for (const [scanId, value] of Object.entries(scores)) {
        const scan = scans.find((s) => s.id === scanId);
        await updateScan(scanId, {
          essayScores: { ...(scan?.essayScores ?? {}), [String(no)]: value },
          essayScoreSources: { ...(scan?.essayScoreSources ?? {}), [String(no)]: "teacher" },
        });
      }
      const fresh = await listScans(id);
      return NextResponse.json({
        ok: true,
        graded: Object.keys(scores).length,
        questions: serialize(buildGroups(exam, fresh), fresh),
      });
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
      const essayAnswers = { ...(scan.essayAnswers ?? {}), [qk]: text };

      // 자동으로 매긴 점수는 고친 글로 다시 판정한다. 선생님이 매긴 점수는 그대로 —
      // 글을 고쳤다고 점수까지 바꿀 권한이 자동 채점에는 없다.
      const hasScore = typeof scan.essayScores?.[qk] === "number";
      const source = scan.essayScoreSources?.[qk];
      if (!hasScore || source === "auto") {
        const verdict = autoVerdict(text, parseAcceptedAnswers(exam.answerKey?.[qk]), pointFor(exam, no));
        const essayScores = { ...(scan.essayScores ?? {}) };
        const essayScoreSources = { ...(scan.essayScoreSources ?? {}) };
        if (verdict === null) {
          delete essayScores[qk];
          delete essayScoreSources[qk];
        } else {
          essayScores[qk] = verdict;
          essayScoreSources[qk] = "auto";
        }
        await updateScan(scanId, { essayAnswers, essayScores, essayScoreSources });
      } else {
        await updateScan(scanId, { essayAnswers });
      }
      const fresh = await listScans(id);
      return NextResponse.json({
        ok: true,
        questions: serialize(buildGroups(exam, fresh), fresh),
      });
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
      const auto = await runAutoGrade(freshExam, scans);
      const fresh = await listScans(id);
      return NextResponse.json({
        ok: true,
        auto,
        questions: serialize(buildGroups(freshExam, fresh), fresh),
      });
    }

    return NextResponse.json(
      { error: "action은 transcribe · autoGrade · gradeGroup · fixText · setAnswer 중 하나여야 합니다." },
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
