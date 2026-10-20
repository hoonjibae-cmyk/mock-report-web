-- 반배정 요청·알림 중복 방지·ClassFit의 동일 성적표 출력. 기존 성적/학생은 보존한다.
begin;
alter table public.omr_scans add column if not exists preferred_schedule text;
create table if not exists public.placement_requests (
  report_id uuid primary key references public.student_reports(id) on delete cascade,
  exam_id uuid not null references public.exams(id), student_key text not null,
  grade text not null check (grade in ('초6','중1','중2','중3','고1','고2','고3')),
  preferred_schedule text not null check (preferred_schedule in ('화목','월수금','미정','상관없음')),
  requested_at timestamptz not null default now(),requested_by text not null,
  notification_state text not null default 'pending' check (notification_state in ('pending','sending','sent','skipped','blocked','error','uncertain')),
  notification_reason text,notification_claim uuid,notification_at timestamptz,
  image_token uuid not null default gen_random_uuid(),
  workspace_id uuid references public.placement_workspaces(id),
  unique(exam_id,student_key)
);
create table if not exists public.placement_print_tickets (
  token_hash text primary key,report_id uuid not null references public.student_reports(id) on delete cascade,
  workspace_id uuid not null references public.placement_workspaces(id),class_id text not null,
  actor text not null,expires_at timestamptz not null,used_at timestamptz
);
alter table public.placement_requests enable row level security;
alter table public.placement_print_tickets enable row level security;
revoke all on public.placement_requests,public.placement_print_tickets from anon,authenticated;
grant all on public.placement_requests,public.placement_print_tickets to service_role;
create or replace function public.placement_claim_notification(p_report_id uuid,p_claim uuid)
returns setof public.placement_requests language sql security definer set search_path=public as $$
 update public.placement_requests set notification_state='sending',notification_claim=p_claim,notification_at=now()
 where report_id=p_report_id and notification_state in ('pending','error') returning *;
$$;
create or replace function public.placement_redeem_print(p_hash text)
returns setof public.placement_print_tickets language sql security definer set search_path=public as $$
 update public.placement_print_tickets set used_at=now()
 where token_hash=p_hash and used_at is null and expires_at>now() returning *;
$$;
revoke all on function public.placement_claim_notification(uuid,uuid),public.placement_redeem_print(text) from public,anon,authenticated;
grant execute on function public.placement_claim_notification(uuid,uuid),public.placement_redeem_print(text) to service_role;
commit;
