import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { createPublicToken, hashPin } from "@/lib/crypto";
import { getExam } from "@/lib/omr-exams";
import { listScans } from "@/lib/omr-scans";
import { scoreExam, maxScore, essayCountOf } from "@/lib/omr-scoring";
import {
  attachClassification,
  classificationStats,
  nationalComparison,
} from "@/lib/mock-report";
import { EXAM_TYPE_LABELS, ACADEMY_NAME } from "@/lib/omr-types";
import type { GenericReportData, GrowthPoint } from "@/lib/omr-report-types";
import { isGenericReport } from "@/lib/omr-report-types";
import { maskPhoneForGate, phoneLast4, normalizePhone, siteBaseUrl } from "@/lib/utils";
import { APP_VERSION } from "@/lib/version";

export const runtime = "nodejs";
export const maxDuration = 120;

interface StudentInput {
  scanId: string;
  name: string;
  school?: string;
  phone?: string;
}

/** 학생 식별 제안 + 이 시험의 기존 성적표 현황 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApi("viewReports");
  if (auth.response) return auth.response;
  const { id } = await context.params;

  try {
    const exam = await getExam(id);
    if (!exam) return NextResponse.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });

    const scans = await listScans(id);
    const keys = [
      ...new Set(scans.map((scan) => scan.studentId).filter((v): v is string => Boolean(v))),
    ];

    const supabase = getSupabaseAdmin();

    // 이전 성적표에서 수험번호 → 이름·학교 제안(최신 우선)
    const suggestions: Record<string, { name: string; school: string }> = {};
    if (keys.length > 0) {
      const { data } = await supabase
        .from("student_reports")
        .select("student_key,student_name,school,created_at")
        .in("student_key", keys)
        .order("created_at", { ascending: false });
      for (const row of data ?? []) {
        const key = row.student_key as string;
        if (key && !suggestions[key]) {
          suggestions[key] = { name: row.student_name ?? "", school: row.school ?? "" };
        }
      }
    }

    const { count } = await supabase
      .from("student_reports")
      .select("id", { count: "exact", head: true })
      .eq("exam_id", id);

    return NextResponse.json({ ok: true, suggestions, existingReports: count ?? 0 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "조회 오류" },
      { status: 500 },
    );
  }
}

/** 검수 완료 스캔을 채점해 학생별 성적표(웹링크)를 생성한다. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApi("createReports");
  if (auth.response) return auth.response;
  const { id } = await context.params;

  try {
    const exam = await getExam(id);
    if (!exam) return NextResponse.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });

    const keyFilled = Object.keys(exam.answerKey ?? {}).length;
    if (keyFilled < exam.numQuestions) {
      return NextResponse.json(
        { error: `정답이 ${keyFilled}/${exam.numQuestions}문항만 입력되어 있습니다. 정답 입력을 먼저 완료해 주세요.` },
        { status: 400 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const inputs: StudentInput[] = Array.isArray(body.students) ? body.students : [];
    const requestPin = body.pinRequired !== false;

    // 국영수 모의고사는 전국 비교·문항 분류가 성적표의 핵심이라, 기준 자료 없이는
    // 만들지 않는다(3단계 업로드를 건너뛴 채 성적표가 나가는 것을 막는다).
    if (exam.examType === "mock" && !exam.mockReference) {
      return NextResponse.json(
        {
          error:
            "시험 기반 정보(문항분류표·전국비교기준)를 아직 올리지 않았습니다. 성적표를 만들기 전에 엑셀을 업로드해 주세요.",
        },
        { status: 400 },
      );
    }

    const allScans = await listScans(id);
    const reviewed = allScans.filter((scan) => scan.status === "reviewed" && scan.studentId);
    if (reviewed.length === 0) {
      return NextResponse.json(
        { error: "검수 완료된 답안이 없습니다. 스캔 · 검수를 먼저 진행해 주세요." },
        { status: 400 },
      );
    }

    const nameByScan = new Map<string, StudentInput>();
    for (const input of inputs) {
      if (input && typeof input.scanId === "string" && typeof input.name === "string") {
        nameByScan.set(input.scanId, input);
      }
    }
    const missing = reviewed.filter((scan) => !nameByScan.get(scan.id)?.name?.trim());
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: `학생 이름이 비어 있는 답안이 ${missing.length}건 있습니다(수험번호 ${missing
            .map((scan) => scan.studentId)
            .slice(0, 5)
            .join(", ")}${missing.length > 5 ? " 외" : ""}). 이름을 모두 입력해 주세요.`,
        },
        { status: 400 },
      );
    }

    // 주관식은 채점하지 않으면 **조용히 0점**으로 들어간다. 그대로 성적표를
    // 만들면 학생이 쓴 답이 통째로 사라진 점수가 학부모에게 나간다. 되돌리기
    // 어려운 실수라, 정답 미입력과 같은 선에서 막는다.
    const essayCount = essayCountOf(exam);
    if (essayCount > 0) {
      const objectiveCount = exam.numQuestions;
      let ungraded = 0;
      for (const scan of reviewed) {
        for (let q = objectiveCount + 1; q <= objectiveCount + essayCount; q += 1) {
          if (typeof scan.essayScores?.[String(q)] !== "number") ungraded += 1;
        }
      }
      if (ungraded > 0) {
        return NextResponse.json(
          {
            error:
              `주관식 채점이 ${ungraded}칸 남아 있습니다. 지금 성적표를 만들면 그 칸이 0점으로 들어갑니다. ` +
              "'주관식 채점'에서 마친 뒤 다시 시도해 주세요.",
          },
          { status: 400 },
        );
      }
    }

    // 채점(검수 완료 전체가 응시 집단)
    const { cohort, scored } = scoreExam(exam, reviewed);
    // 국영수 모의고사 기준 자료 — 있으면 전국 비교·문항 분류를 얹는다
    const reference = exam.examType === "mock" ? exam.mockReference : null;
    const scoredByScan = new Map(scored.map((s) => [s.scanId, s]));
    const examMax = maxScore(exam);

    const supabase = getSupabaseAdmin();

    // 성장 추이: 같은 student_key + 같은 시험 유형의 이전 C_generic 성적표
    // + 재생성 시 이전 성적표에 작성해 둔 담임 개별 코멘트 승계
    const keys = [...new Set(reviewed.map((scan) => scan.studentId as string))];
    const growthByKey = new Map<string, GrowthPoint[]>();
    const commentByKey = new Map<string, unknown>();
    if (keys.length > 0) {
      const { data: prior } = await supabase
        .from("student_reports")
        .select("student_key,exam_id,report_data,teacher_comment,created_at")
        .in("student_key", keys)
        .not("exam_id", "is", null)
        .order("created_at", { ascending: true });
      for (const row of prior ?? []) {
        const data = row.report_data;
        if (!isGenericReport(data)) continue;
        if (data.examType !== exam.examType) continue;
        if (row.exam_id === id) {
          // 같은 시험의 이전 성적표: 성장추이에서는 제외하고, 담임 코멘트만 승계(최신 우선)
          if (row.teacher_comment) commentByKey.set(row.student_key as string, row.teacher_comment);
          continue;
        }
        const key = row.student_key as string;
        const list = growthByKey.get(key) ?? [];
        // 같은 시험은 최신 생성본 하나만
        const existingIdx = list.findIndex((p) => p.examId === row.exam_id);
        const point: GrowthPoint = {
          examId: row.exam_id as string,
          title: data.examTitle,
          date: data.examDate ?? (row.created_at as string).slice(0, 10),
          standardScore: data.standardScore,
          raw: data.score.raw,
          mean: data.cohort.mean,
        };
        if (existingIdx >= 0) list[existingIdx] = point;
        else list.push(point);
        growthByKey.set(key, list);
      }
    }

    // 성적표 묶음 생성
    const { data: batch, error: batchError } = await supabase
      .from("report_batches")
      .insert({
        title: exam.title,
        exam_label: exam.examDate || EXAM_TYPE_LABELS[exam.examType],
        source_filename: `OMR ${reviewed.length}매`,
        report_count: reviewed.length,
        created_by_name: auth.user.displayName,
        created_by_username: auth.user.username,
      })
      .select("id")
      .single();
    if (batchError || !batch) {
      throw new Error(`성적표 묶음 저장 실패: ${batchError?.message ?? "알 수 없는 오류"}`);
    }

    const generatedAt = new Date().toISOString();

    const rows = reviewed.map((scan) => {
      const input = nameByScan.get(scan.id)!;
      const result = scoredByScan.get(scan.id)!;
      const key = scan.studentId as string;
      const growth = [...(growthByKey.get(key) ?? [])].sort((a, b) =>
        a.date.localeCompare(b.date),
      );
      growth.push({
        examId: id,
        title: exam.title,
        date: exam.examDate || generatedAt.slice(0, 10),
        standardScore: result.standardScore,
        raw: result.raw,
        mean: cohort.mean,
      });

      const reportData: GenericReportData = {
        schemaVersion: 2,
        family: "C_generic",
        examId: id,
        examType: exam.examType,
        examTypeLabel: EXAM_TYPE_LABELS[exam.examType],
        examTitle: exam.title,
        examDate: exam.examDate,
        academy: ACADEMY_NAME,
        student: { key, name: input.name.trim(), school: input.school?.trim() ?? "" },
        score: {
          raw: result.raw,
          objectiveRaw: result.objectiveRaw,
          essayRaw: result.essayRaw,
          max: examMax,
          correctCount: result.correctCount,
          wrongCount: result.wrongCount,
          blankCount: result.blankCount,
          totalQuestions: exam.numQuestions,
        },
        cohort,
        standardScore: result.standardScore,
        rank: result.rank,
        topPercent: result.topPercent,
        grade: result.grade,
        items: reference ? attachClassification(result.items, reference) : result.items,
        areas: result.areas,
        contents: result.contents,
        weakItems: result.weakItems,
        growth,
        essayCount,
        national: reference ? nationalComparison(reference, result.raw) : null,
        classificationStats: reference
          ? classificationStats(attachClassification(result.items, reference))
          : undefined,
        teacherComment: null,
        appVersion: APP_VERSION,
        generatedAt,
      };

      const phone = normalizePhone(input.phone ?? "");
      const pin = phoneLast4(phone);
      const pinRequired = requestPin && Boolean(pin);

      return {
        batch_id: batch.id,
        public_token: createPublicToken(),
        student_name: input.name.trim(),
        school: input.school?.trim() || null,
        grade: null,
        parent_phone_masked: phone ? maskPhoneForGate(phone) : null,
        access_pin_hash: pinRequired ? hashPin(pin) : null,
        pin_required: pinRequired,
        is_active: true,
        report_data: reportData,
        exam_id: id,
        student_key: key,
        scan_path: scan.scanPath,
        teacher_comment: commentByKey.get(key) ?? null,
      };
    });

    const { data: inserted, error: insertError } = await supabase
      .from("student_reports")
      .insert(rows)
      .select("id,public_token,student_name,school,pin_required,created_at");
    if (insertError || !inserted) {
      await supabase.from("report_batches").delete().eq("id", batch.id);
      throw new Error(`성적표 저장 실패: ${insertError?.message ?? "알 수 없는 오류"}`);
    }

    const baseUrl = siteBaseUrl(request.url);
    return NextResponse.json({
      ok: true,
      batchId: batch.id,
      reports: inserted.map((row) => ({
        id: row.id,
        studentName: row.student_name,
        school: row.school ?? "",
        token: row.public_token,
        url: `${baseUrl}/r/${row.public_token}`,
        pinRequired: row.pin_required,
        createdAt: row.created_at,
      })),
      cohort,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "성적표 생성 오류" },
      { status: 500 },
    );
  }
}
