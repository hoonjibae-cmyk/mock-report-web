// 시험(exams) 저장소 — Supabase service-role 경유

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  ACADEMY_NAME,
  reportFamilyFor,
  type ExamType,
  type OmrConfig,
  type OmrExam,
  type OmrSheetSpec,
} from "@/lib/omr-types";

interface ExamRow {
  id: string;
  exam_type: ExamType;
  report_family: string;
  title: string;
  subject: string | null;
  exam_date: string | null;
  num_questions: number;
  num_choices: number;
  id_digits: number;
  omr_style: "exam" | "basic";
  omr_config: OmrConfig | null;
  answer_key: Record<string, number> | null;
  points: Record<string, number> | null;
  question_meta: Record<string, { area?: string }> | null;
  grade_cuts: Array<{ grade: number; min: number }> | null;
  use_teacher_comment: boolean;
  created_by_name: string | null;
  created_at: string;
}

/** 마이그레이션 미실행으로 컬럼이 없을 때, 실행할 파일을 알려준다. */
function describeExamDbError(message: string): string {
  const missingColumn = message.match(/column [\w.]*?(\w+) does not exist/i);
  if (missingColumn) {
    const column = missingColumn[1];
    const guide: Record<string, string> = {
      question_meta: "supabase/migration_v2_omr.sql",
      points: "supabase/migration_v2_omr.sql",
      overview_comment: "supabase/migration_v2_omr.sql",
    };
    const file = guide[column] ?? "supabase 폴더의 최신 migration 파일";
    return `데이터베이스 업데이트가 필요합니다. Supabase → SQL Editor에서 ${file}을 실행해 주세요. (누락된 항목: ${column})`;
  }
  if (/relation .* does not exist/i.test(message)) {
    return `데이터베이스 표가 아직 없습니다. Supabase → SQL Editor에서 supabase/migration_v2_omr.sql을 실행해 주세요. (원문: ${message})`;
  }
  return message;
}

function mapExam(row: ExamRow): OmrExam {
  return {
    id: row.id,
    examType: row.exam_type,
    reportFamily: row.report_family as OmrExam["reportFamily"],
    title: row.title,
    subject: row.subject,
    examDate: row.exam_date,
    numQuestions: row.num_questions,
    numChoices: row.num_choices,
    idDigits: row.id_digits,
    omrStyle: row.omr_style,
    omrConfig: row.omr_config ?? {},
    answerKey: row.answer_key ?? {},
    points: row.points ?? {},
    questionMeta: row.question_meta ?? {},
    gradeCuts: row.grade_cuts ?? [],
    useTeacherComment: row.use_teacher_comment,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
  };
}

const SELECT =
  "id,exam_type,report_family,title,subject,exam_date,num_questions,num_choices,id_digits,omr_style,omr_config,answer_key,points,question_meta,grade_cuts,use_teacher_comment,created_by_name,created_at";

export interface CreateExamInput {
  examType: ExamType;
  title: string;
  subject?: string;
  examDate?: string;
  numQuestions: number;
  numChoices: number;
  idDigits: number;
  omrStyle: "exam" | "basic";
  omrConfig: OmrConfig;
  useTeacherComment: boolean;
}

export async function createExam(
  input: CreateExamInput,
  user: { username: string; displayName: string },
): Promise<OmrExam> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("exams")
    .insert({
      exam_type: input.examType,
      report_family: reportFamilyFor(input.examType),
      title: input.title,
      subject: input.subject || null,
      exam_date: input.examDate || null,
      num_questions: input.numQuestions,
      num_choices: input.numChoices,
      id_digits: input.idDigits,
      omr_style: input.omrStyle,
      omr_config: input.omrConfig,
      use_teacher_comment: input.useTeacherComment,
      created_by_username: user.username,
      created_by_name: user.displayName,
    })
    .select(SELECT)
    .single();
  if (error || !data) throw new Error(`시험 저장 실패: ${error?.message ?? "알 수 없는 오류"}`);
  return mapExam(data as ExamRow);
}

export async function listExams(): Promise<OmrExam[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("exams")
    .select(SELECT)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`시험 목록을 불러오지 못했습니다 — ${describeExamDbError(error.message)}`);
  return (data as ExamRow[]).map(mapExam);
}

export async function getExam(id: string): Promise<OmrExam | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("exams").select(SELECT).eq("id", id).maybeSingle();
  if (error) throw new Error(`시험을 불러오지 못했습니다 — ${describeExamDbError(error.message)}`);
  return data ? mapExam(data as ExamRow) : null;
}

/** 정답키·배점·영역 저장 (전달된 항목만 갱신) */
export async function updateExamAnswerKey(
  id: string,
  answerKey: Record<string, number>,
  extra?: {
    points?: Record<string, number>;
    questionMeta?: Record<string, { area?: string }>;
  },
): Promise<OmrExam> {
  const supabase = getSupabaseAdmin();
  const patch: Record<string, unknown> = { answer_key: answerKey };
  if (extra?.points !== undefined) patch.points = extra.points;
  if (extra?.questionMeta !== undefined) patch.question_meta = extra.questionMeta;
  const { data, error } = await supabase
    .from("exams")
    .update(patch)
    .eq("id", id)
    .select(SELECT)
    .single();
  if (error || !data) throw new Error(`정답 저장 실패: ${error?.message ?? "알 수 없는 오류"}`);
  return mapExam(data as ExamRow);
}

export async function deleteExam(id: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("exams").delete().eq("id", id);
  if (error) throw new Error(`시험 삭제 실패: ${error.message}`);
}

// 시험 → OMR API 답안지 스펙
export function sheetSpecFor(exam: OmrExam): OmrSheetSpec {
  const cfg = exam.omrConfig ?? {};
  return {
    exam_id: exam.id,
    title: exam.title,
    num_questions: exam.numQuestions,
    num_choices: exam.numChoices,
    id_digits: exam.idDigits,
    per_column: typeof cfg.per_column === "number" ? cfg.per_column : 20,
    style: exam.omrStyle,
    period: typeof cfg.period === "string" ? cfg.period : "",
    subject_label: typeof cfg.subject_label === "string" ? cfg.subject_label : "",
    academy: ACADEMY_NAME,
    essay_count: typeof cfg.essay_count === "number" ? cfg.essay_count : 0,
  };
}
