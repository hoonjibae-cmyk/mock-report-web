-- 목동유쌤영어학원 웹리포트 v2 — OMR 시험/스캔 연동
-- 기존 스키마(v1.5) 위에 추가로 한 번 실행하세요.

-- 시험 정의(OMR 답안지 설정 + 정답키/분류)
create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  exam_type text not null check (exam_type in ('mock','saturday','monthly','placement','inclass')),
  report_family text not null check (report_family in ('A_rich','B_english','C_generic')),
  title text not null,
  subject text,
  exam_date text,
  num_questions integer not null,
  num_choices integer not null default 5,
  id_digits integer not null default 5,
  omr_style text not null default 'exam' check (omr_style in ('exam','basic')),
  omr_config jsonb not null default '{}'::jsonb,      -- period, subject_label, per_column 등
  answer_key jsonb not null default '{}'::jsonb,       -- {문항: 정답보기} (Ⓑ/Ⓒ)
  points jsonb not null default '{}'::jsonb,           -- {문항: 배점}
  question_meta jsonb not null default '{}'::jsonb,    -- {문항: {area,type,difficulty}}
  grade_cuts jsonb not null default '[]'::jsonb,       -- 절대평가 등급컷(선택)
  use_teacher_comment boolean not null default false,
  overview_comment jsonb,                              -- 이번 시험 공통 총평 {ai_draft,final,status}
  created_by_username text,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists exams_created_at_idx on public.exams(created_at desc);

drop trigger if exists exams_set_updated_at on public.exams;
create trigger exams_set_updated_at
before update on public.exams
for each row execute function public.set_updated_at();

-- 학생 성적표에 OMR 연동 컬럼 추가
alter table public.student_reports
  add column if not exists exam_id uuid references public.exams(id) on delete set null,
  add column if not exists scan_path text,                 -- omr-scans 버킷 내 경로
  add column if not exists student_key text,               -- 월별 연결용 학생 식별
  add column if not exists teacher_comment jsonb;          -- 개별 코멘트(표기/반영 키워드·초안·최종)

create index if not exists student_reports_exam_id_idx on public.student_reports(exam_id);
create index if not exists student_reports_student_key_idx on public.student_reports(student_key);

-- 모든 DB 접근은 service-role 키로만 수행
alter table public.exams enable row level security;
revoke all on table public.exams from anon, authenticated;

-- 참고: 스캔 원본 저장용 Storage 버킷 `omr-scans`(비공개)를 Supabase 대시보드에서 생성하고
--        7일 보관(수명주기/정리 크론)을 적용하세요. (Phase A 후속 PR에서 사용)

notify pgrst, 'reload schema';
