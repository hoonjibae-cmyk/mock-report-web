import {requestPlacement,placementStatuses} from '@/lib/placement-service';
import {preferredSchedule,placementGrade} from '@/lib/placement-policy';
import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { createPublicToken, hashPin } from "@/lib/crypto";
import { getVisibleExam } from "@/lib/exam-access";
import { listScans } from "@/lib/omr-scans";
import { scoreExam, maxScore, essayCountOf } from "@/lib/omr-scoring";
import {
  attachClassification,
  classificationStats,
  nationalComparison,
} from "@/lib/mock-report";
import { EXAM_TYPE_LABELS, ACADEMY_NAME } from "@/lib/omr-types";
import type { GenericReportData, GrowthPoint } from "@/lib/omr-report-types";
import { isGenericReport, recentGrowth } from "@/lib/omr-report-types";
import { gradeRange } from "@/lib/school-grade";
import { maskPhoneForGate, phoneLast4, normalizePhone, siteBaseUrl } from "@/lib/utils";
import { APP_VERSION } from "@/lib/version";

export const runtime = "nodejs";
export const maxDuration = 120;

interface StudentInput {
  scanId: string;
  name: string;
  school?: string;
  phone?: string;
  /** 학생 관리 프로그램의 담임 — 담임 선생님의 '내 반' 화면이 이 값으로 찾는다 */
  teacher?: string;
  className?: string;
  grade?:string;
  preferredSchedule?:string;
}

/** 학생 식별 제안 + 이 시험의 기존 성적표 현황 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApi("viewReports");
  if (auth.response) return auth.response;
  const { id } = await context.params;

  try {
    const exam = await getVisibleExam(id);
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

    // 이미 살아 있는 성적표가 있는 학생 — 화면이 "새로 만들 것 n장 · 갱신 m장"을 미리 보여 준다
    const { data: existingRows } = await supabase
      .from("student_reports")
      .select("student_key")
      .eq("exam_id", id)
      .eq("is_active", true);
    const existingKeys = [
      ...new Set(
        (existingRows ?? [])
          .map((row) => row.student_key as string | null)
          .filter((key): key is string => Boolean(key)),
      ),
    ];

    return NextResponse.json({ ok: true, suggestions, existingReports: count ?? 0, existingKeys, placementReports:exam.examType==='placement'?await placementStatuses(id):[] });
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
    const exam = await getVisibleExam(id);
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
    const reviewedAll = allScans.filter((scan) => scan.status === "reviewed" && scan.studentId);
    if (reviewedAll.length === 0) {
      return NextResponse.json(
        { error: "검수 완료된 답안이 없습니다. 스캔 · 검수를 먼저 진행해 주세요." },
        { status: 400 },
      );
    }
    // 같은 수험번호 답안지가 두 장 이상이면 마지막 것만 쓴다 — 한 학생에게 성적표는 하나다.
    const latestByKey = new Map<string, (typeof reviewedAll)[number]>();
    for (const scan of [...reviewedAll].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      latestByKey.set(scan.studentId as string, scan);
    }
    const reviewed = [...latestByKey.values()].filter(scan=>exam.examType!=='placement'||inputs.some(input=>input.scanId===scan.id));
    const duplicateKeys = [...latestByKey.keys()].filter(
      (key) => reviewedAll.filter((scan) => scan.studentId === key).length > 1,
    );

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

    if(exam.examType==='placement')for(const scan of reviewed){
      const input=nameByScan.get(scan.id)!;
      if(!placementGrade(input.grade??'')||!preferredSchedule(input.preferredSchedule??scan.preferredSchedule))return NextResponse.json({error:`${input.name}: 학년과 선호 요일을 선택해 주세요.`},{status:400});
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
    const { cohort, scored, listening } = scoreExam(exam, reviewed);
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
    // 이 시험에 이미 살아 있는 성적표(학생마다 가장 최근 것) — 다시 만들지 않고 제자리에서
    // 갱신한다. 링크·담임 의견·발송 기록이 그대로 남아야 같은 학생에게 두 번 나가지 않는다.
    const existingByKey = new Map<string, { id: string; token: string }>();
    if (keys.length > 0) {
      const { data: prior } = await supabase
        .from("student_reports")
        .select("id,student_key,exam_id,report_data,teacher_comment,created_at,is_active,public_token")
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
          // 오름차순이라 마지막에 남는 것이 가장 최근 — 중지된 링크는 새로 만든다
          if (row.is_active !== false) {
            existingByKey.set(row.student_key as string, { id: row.id as string, token: row.public_token as string });
          }
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

    const generatedAt = new Date().toISOString();

    // 응시생 학년 범위 — 지금 이 시험을 본 학생들의 학교 칸("은가람중 2")에서 읽는다.
    // 토요모의고사 성적표가 "중1부터 고1까지 응시한 시험"이라고 적는 근거다.
    const cohortGrades = gradeRange(reviewed.map((scan) => nameByScan.get(scan.id)?.school ?? ""));

    // 학생마다 성적표 내용을 만든다 — 새로 만들든 제자리에서 갱신하든 내용은 같다
    const prepared = reviewed.map((scan) => {
      const input = nameByScan.get(scan.id)!;
      const result = scoredByScan.get(scan.id)!;
      const key = scan.studentId as string;
      // 기록이 아무리 쌓여도 최근 GROWTH_LIMIT 회차만 싣는다.
      const growth = recentGrowth(growthByKey.get(key) ?? [], {
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
        student: {
          key,
          name: input.name.trim(),
          school: input.school?.trim() ?? "",
          // 반 이름도 성적표에 찍는다 — 학생 관리 프로그램에서 온 값 그대로
          className: input.className?.trim() || undefined,
        },
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
        // 듣기 미응시 — 성적표에 "듣기 점수는 본 학생들의 평균을 적용했다"고 적는다
        listeningAbsent:
          result.listeningAbsent && listening
            ? { mean: listening.mean, possible: listening.possible, count: listening.questions.length }
            : null,
        cohortGrades,
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
      return { scan, input, key, reportData, phone, pin, pinRequired };
    });

    const toInsert = prepared.filter((p) => !existingByKey.has(p.key));
    const toUpdate = prepared.filter((p) => existingByKey.has(p.key));

    // 새 성적표가 있을 때만 묶음을 만든다 — 갱신만 하는 날에 빈 묶음이 쌓이지 않게
    let batchId: string | null = null;
    if (toInsert.length > 0) {
      const { data: batch, error: batchError } = await supabase
        .from("report_batches")
        .insert({
          title: exam.title,
          exam_label: exam.examDate || EXAM_TYPE_LABELS[exam.examType],
          source_filename: `OMR ${toInsert.length}매`,
          report_count: toInsert.length,
          created_by_name: auth.user.displayName,
          created_by_username: auth.user.username,
        })
        .select("id")
        .single();
      if (batchError || !batch) {
        throw new Error(`성적표 묶음 저장 실패: ${batchError?.message ?? "알 수 없는 오류"}`);
      }
      batchId = batch.id as string;
    }

    const rows = toInsert.map((p) => ({
      batch_id: batchId,
      public_token: createPublicToken(),
      student_name: p.input.name.trim(),
      school: p.input.school?.trim() || null,
      grade: exam.examType==='placement'?placementGrade(p.input.grade??''):null,
      parent_phone_masked: p.phone ? maskPhoneForGate(p.phone) : null,
      access_pin_hash: p.pinRequired ? hashPin(p.pin) : null,
      pin_required: p.pinRequired,
      is_active: true,
      report_data: p.reportData,
      exam_id: id,
      student_key: p.key,
      scan_path: p.scan.scanPath,
      teacher_comment: commentByKey.get(p.key) ?? null,
      // 발행 시점의 담임·반을 남긴다 — 나중에 반이 바뀌어도 이 성적표는 그때 담임 것이다
      homeroom_teacher: p.input.teacher?.trim() || null,
      class_name: p.input.className?.trim() || null,
    }));

    interface InsertedRow {
      id: string;
      public_token: string;
      student_name: string;
      school: string | null;
      pin_required: boolean;
      created_at: string;
    }
    let inserted: InsertedRow[] = [];
    if (rows.length > 0) {
      const { data, error: insertError } = await supabase
        .from("student_reports")
        .insert(rows)
        .select("id,public_token,student_name,school,pin_required,created_at");
      if (insertError || !data) {
        if (batchId) await supabase.from("report_batches").delete().eq("id", batchId);
        throw new Error(`성적표 저장 실패: ${insertError?.message ?? "알 수 없는 오류"}`);
      }
      inserted = data as InsertedRow[];
    }

    // 이미 있는 성적표는 내용만 갱신 — 토큰·담임 의견·발송 기록·조회수는 그대로.
    // 이번에 안 들어온 값(연락처·학교·반)으로 있던 것을 지우지 않는다.
    const updated: Array<{ id: string; studentName: string; token: string }> = [];
    const updateErrors: string[] = [];
    await Promise.all(
      toUpdate.map(async (p) => {
        const existing = existingByKey.get(p.key)!;
        const change: Record<string, unknown> = {
          student_name: p.input.name.trim(),
          report_data: p.reportData,
          scan_path: p.scan.scanPath,
        };
        if(exam.examType==='placement')change.grade=placementGrade(p.input.grade??'');
        if (p.input.school?.trim()) change.school = p.input.school.trim();
        if (p.input.teacher?.trim()) change.homeroom_teacher = p.input.teacher.trim();
        if (p.input.className?.trim()) change.class_name = p.input.className.trim();
        if (p.phone) {
          change.parent_phone_masked = maskPhoneForGate(p.phone);
          change.access_pin_hash = p.pinRequired ? hashPin(p.pin) : null;
          change.pin_required = p.pinRequired;
        }
        const { error: updateError } = await supabase.from("student_reports").update(change).eq("id", existing.id);
        if (updateError) updateErrors.push(`${p.input.name.trim()}: ${updateError.message}`);
        else updated.push({ id: existing.id, studentName: p.input.name.trim(), token: existing.token });
      }),
    );
    if (updateErrors.length > 0) {
      throw new Error(`성적표 갱신 실패: ${updateErrors.slice(0, 3).join(" · ")}${updateErrors.length > 3 ? " 외" : ""}`);
    }

    const baseUrl = siteBaseUrl(request.url);
    if(exam.examType==='placement'){
      // 이름이 같은 학생이 있어도 수험번호로만 연결한다.
      const {data:active,error:activeError}=await supabase.from('student_reports').select('id,student_key').eq('exam_id',id).eq('is_active',true).order('created_at',{ascending:false});
      if(activeError)throw Error('반배정 성적 기록을 확인하지 못했습니다.');
      const byKey=new Map<string,string>();for(const r of active??[])if(r.student_key&&!byKey.has(r.student_key))byKey.set(r.student_key,r.id);
      const requests=await requestPlacement(prepared.map(p=>({id:byKey.get(p.key)!,key:p.key,data:p.reportData,grade:p.input.grade,preferredSchedule:p.input.preferredSchedule??p.scan.preferredSchedule})),auth.user.username);
      return NextResponse.json({ok:true,placementRequests:requests,placementReports:await placementStatuses(id),reports:[],updated:[],duplicates:duplicateKeys,cohort});
    }
    return NextResponse.json({
      ok: true,
      batchId,
      reports: inserted.map((row) => ({
        id: row.id,
        studentName: row.student_name,
        school: row.school ?? "",
        token: row.public_token,
        url: `${baseUrl}/r/${row.public_token}`,
        pinRequired: row.pin_required,
        createdAt: row.created_at,
      })),
      updated: updated.map((row) => ({ ...row, url: `${baseUrl}/r/${row.token}` })),
      duplicates: duplicateKeys,
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
