-- 목동유쌤영어학원 OMR 리포트 v4 — 서술형(주관식) 채점 점수
-- migration_v3_omr_scans.sql 실행 후 한 번 실행하세요.

-- 서술형 문항은 OMR로 판독하지 않고 채점자가 직접 점수를 입력한다.
-- {"21": 4, "22": 2.5} 형태로 답안지 1장(=학생 1명)의 서술형 점수를 보관.
alter table public.omr_scans
  add column if not exists essay_scores jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
