-- 목동유쌤영어학원 중3 모의고사 웹리포트 v1.5
-- 새 Supabase 프로젝트에서는 이 파일 전체를 한 번 실행하세요.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  display_name text not null,
  password_hash text not null,
  is_active boolean not null default true,
  permissions jsonb not null default '{"viewReports":true,"createReports":true,"manageReports":true,"deleteReports":true,"exportReports":true,"downloadTemplate":true}'::jsonb,
  last_login_at timestamptz,
  password_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_users_username_format check (username ~ '^[a-z0-9._-]{3,40}$')
);

create unique index if not exists app_users_username_unique_idx on public.app_users(lower(username));

drop trigger if exists app_users_set_updated_at on public.app_users;
create trigger app_users_set_updated_at
before update on public.app_users
for each row execute function public.set_updated_at();

create table if not exists public.report_batches (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  exam_label text not null,
  source_filename text,
  status text not null default 'active' check (status in ('active', 'archived')),
  report_count integer not null default 0,
  warnings jsonb not null default '[]'::jsonb,
  created_by_name text not null default '관리자',
  created_by_username text,
  created_at timestamptz not null default now()
);

create table if not exists public.student_reports (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.report_batches(id) on delete cascade,
  public_token text not null unique,
  student_name text not null,
  school text,
  grade text,
  parent_phone_masked text,
  access_pin_hash text,
  pin_required boolean not null default true,
  is_active boolean not null default true,
  report_data jsonb not null,
  ai_summary jsonb,
  view_count integer not null default 0,
  last_viewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists student_reports_batch_id_idx on public.student_reports(batch_id);
create index if not exists student_reports_created_at_idx on public.student_reports(created_at desc);
create unique index if not exists student_reports_public_token_idx on public.student_reports(public_token);

drop trigger if exists student_reports_set_updated_at on public.student_reports;
create trigger student_reports_set_updated_at
before update on public.student_reports
for each row execute function public.set_updated_at();

-- 모든 DB 접근은 Vercel 서버의 service-role 키를 통해서만 수행합니다.
alter table public.app_users enable row level security;
alter table public.report_batches enable row level security;
alter table public.student_reports enable row level security;

revoke all on table public.app_users from anon, authenticated;
revoke all on table public.report_batches from anon, authenticated;
revoke all on table public.student_reports from anon, authenticated;

notify pgrst, 'reload schema';
