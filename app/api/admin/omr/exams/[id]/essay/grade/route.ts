import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { getAiModel } from "@/lib/app-settings";
import {
  applyGroupScore,
  autoGrade,
  groupEssayAnswers,
  parseAcceptedAnswers,
  type EssayAnswer,
} from "@/lib/essay-grading";
import { getExam } from "@/lib/omr-exams";
import { downloadEssayCrop, listScans, updateScan, type OmrScan } from "@/lib/omr-scans";
import { essayCountOf, pointFor } from "@/lib/omr-scoring";
import { transcribeMany, TranscribeNotConfiguredError } from "@/lib/omr-transcribe";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * 주관식 전사·채점.
 *
 * 60명을 학생 단위로 채점하면 60번 판단해야 하지만, 영작은 답이 몇 갈래로
 * 수렴한다. 같은 답끼리 묶으면 판단 횟수가 크게 줄고 "같은 답에 같은 점수"가
 * 구조적으로 보장된다.
 *
 * GET   현재 전사·채점 상태(묶음 목록)
 * POST  { action: "transcribe" }        아직 전사하지 않은 답안을 읽어 온다
 *       { action: "autoGrade" }          정답과 정확히 일치하는 묶음만 만점 처리
 *       { action: "gradeGroup", ... }    한 묶음 전체에 같은 점수를 매긴다
 *       { action: "fixText", ... }       전사를 고친다(잘못 읽은 것 정정)
 */

/** 이 시험의 주관식 문항 번호 */
function essayNumbers(exam: { numQuestions: number }, count: number): number[] {
  return Array.from({ length: count }, (_, i) => exam.numQuestions + i + 1);
}

/** 채점 대상 답안지 — 검수를 마친 것만 본다(수험번호가 확정되어야 점수가 제자리로 간다) */
function gradableScans(scans: OmrScan[]): OmrScan[] {
  return scans.filter((scan) => scan.status === "reviewed" && scan.studentId);
}

function buildGroups(exam: Awaited<ReturnType<typeof getExam>>, scans: OmrScan[]) {
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

/** 화면으로 내보낼 모양 — 점수와 이미지 유무를 함께 붙인다 */
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
        return {
          scanId: member.scanId,
          studentId: member.studentId,
          score: scan?.essayScores?.[String(q.no)] ?? null,
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
    const exam = await getExam(id);
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
    const exam = await getExam(id);
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
        jobs.map(({ key, jpeg, question }) => ({ key, jpeg, question })),
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

      const fresh = await listScans(id);
      return NextResponse.json({
        ok: true,
        transcribed: jobs.length,
        studentCount: gradable.length,
        questions: serialize(buildGroups(exam, fresh), fresh),
      });
    }

    // --- 자동 채점: 정답과 정확히 일치하는 묶음만 ---
    if (body.action === "autoGrade") {
      let applied = 0;
      const updates = new Map<string, Record<string, number>>();
      for (const q of buildGroups(exam, scans)) {
        if (q.accepted.length === 0) continue; // 정답을 안 넣었으면 판단 근거가 없다
        const result = autoGrade(q.groups, q.point);
        for (const [scanId, score] of Object.entries(result.scores)) {
          const current = updates.get(scanId) ?? {};
          current[String(q.no)] = score;
          updates.set(scanId, current);
          applied += 1;
        }
      }
      for (const [scanId, scores] of updates) {
        const scan = scans.find((s) => s.id === scanId);
        await updateScan(scanId, { essayScores: { ...(scan?.essayScores ?? {}), ...scores } });
      }
      const fresh = await listScans(id);
      return NextResponse.json({
        ok: true,
        applied,
        questions: serialize(buildGroups(exam, fresh), fresh),
      });
    }

    // --- 묶음 채점: 같은 답을 쓴 학생 전원에게 같은 점수 ---
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

      const text = String(body.text ?? "").slice(0, 2000);
      await updateScan(scanId, {
        essayAnswers: { ...(scan.essayAnswers ?? {}), [String(no)]: text },
      });
      const fresh = await listScans(id);
      return NextResponse.json({
        ok: true,
        questions: serialize(buildGroups(exam, fresh), fresh),
      });
    }

    return NextResponse.json(
      { error: "action은 transcribe · autoGrade · gradeGroup · fixText 중 하나여야 합니다." },
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
