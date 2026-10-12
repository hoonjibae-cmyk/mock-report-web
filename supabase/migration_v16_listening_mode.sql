-- v16 — 듣기 미응시 처리 방식 (토요모의고사)
--
-- 개별로 응시해 듣기를 못 본 학생의 답안지는 듣기 문항(1~17번)이 비어 온다.
-- 선생님이 성적표를 만들기 전에 답안지마다 고른 값을 여기 남긴다.
--   'absent' = 듣기 안 봄 → 듣기 점수를 듣기를 본 학생들의 평균으로 산출
--   'marked' = 듣기 봄   → 마킹한 대로 채점
--   null     = 아직 안 정함 → 듣기 문항이 거의 비어 있으면 'absent', 아니면 'marked'로 본다
alter table public.omr_scans
  add column if not exists listening_mode text null;

alter table public.omr_scans
  drop constraint if exists omr_scans_listening_mode_check;
alter table public.omr_scans
  add constraint omr_scans_listening_mode_check
  check (listening_mode is null or listening_mode in ('absent', 'marked'));
