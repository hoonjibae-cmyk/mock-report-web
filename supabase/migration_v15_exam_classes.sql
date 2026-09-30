-- v15 — 시험을 만들 때 담임이 고른 반 (월말평가)
--
-- 검수 화면의 '반 인원 대 응시 인원'은 어느 반을 기준으로 볼지 알아야 한다.
-- 성적표에 적힌 반은 학생마다 다를 수 있고(전반·이름 표기 차이) 예전 시험에는
-- 비어 있기도 하므로, 담임이 시험을 만들 때 고른 반을 시험 행에 남긴다.
-- 문자열 배열(jsonb). 그 전에 만든 시험은 빈 배열이고, 검수 화면은 그때
-- 성적표에 적힌 반으로 물러난다.

alter table public.exams
  add column if not exists class_names jsonb not null default '[]'::jsonb;
