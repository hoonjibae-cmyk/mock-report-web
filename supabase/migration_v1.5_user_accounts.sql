-- 기존 v1.4 이하 설치본에 일반 사용자 계정·권한 기능을 추가하는 마이그레이션
-- Supabase SQL Editor에서 전체를 한 번 실행하세요.

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

alter table public.report_batches
  add column if not exists created_by_name text not null default '관리자';

alter table public.report_batches
  add column if not exists created_by_username text;

alter table public.app_users enable row level security;
revoke all on table public.app_users from anon, authenticated;

notify pgrst, 'reload schema';
