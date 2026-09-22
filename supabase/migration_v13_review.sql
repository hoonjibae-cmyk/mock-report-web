-- v13 — 월말평가 운영진 검토 (담임 의견 저장 → 운영진 검토 요청 → 컨펌 → 알림톡 발송)
--
-- 왜 시험에 두는가
-- ---------------
-- 검토는 성적표 한 장이 아니라 '이 시험의 성적표 전부'에 대한 것이다. 담임이
-- 의견을 다 쓰고 나서 한 번 요청하고, 운영진이 한 번 컨펌한다. 그래서 상태는
-- 시험 행에 산다. 컨펌 전에는 그 시험의 알림톡 발송이 막힌다(월말평가만).
--
-- status: none(요청 전) · requested(검토 기다리는 중) · approved(컨펌됨)

alter table public.exams
  add column if not exists review_status text not null default 'none',
  add column if not exists review_requested_by text,        -- 요청한 계정(username)
  add column if not exists review_requested_by_name text,   -- 화면에 보일 이름
  add column if not exists review_requested_at timestamptz,
  add column if not exists review_approved_by text,         -- 컨펌한 계정(username)
  add column if not exists review_approved_by_name text,
  add column if not exists review_approved_at timestamptz;

alter table public.exams
  drop constraint if exists exams_review_status_check;
alter table public.exams
  add constraint exams_review_status_check
  check (review_status in ('none', 'requested', 'approved'));
