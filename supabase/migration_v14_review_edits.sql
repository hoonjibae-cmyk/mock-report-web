-- v14 — 검수 중 고친 내역 (교수부장이 검수하며 바로잡은 철자·띄어쓰기 등)
--
-- 검수자가 그 자리에서 고치면 담임은 무엇이 바뀌었는지 모른다. 그래서 고친
-- 내역을 시험 행에 남기고, 컨펌 알림 DM에 함께 실어 준다. 새로 검토를 요청하면
-- 비운다 — 이전 회차의 수정은 이미 알려 준 것이다.

alter table public.exams
  add column if not exists review_edits jsonb not null default '[]'::jsonb;
