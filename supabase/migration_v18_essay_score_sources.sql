-- v18 — 주관식 점수의 출처 (자동 채점 vs 선생님)
--
-- 주관식 자동 채점이 "정답 일치 = 만점"에서 "일치 = 만점, 오답으로 보이거나
-- 백지 = 우선 0점"으로 넓어졌다. 0점은 전사(손글씨 읽기)가 틀렸을 수 있어
-- 선생님이 확인해야 하고, 자동 채점을 다시 돌려도 선생님이 매긴 점수는
-- 건드리면 안 된다. 그래서 문항마다 점수가 어디서 왔는지 남긴다.
--   {"46": "auto", "47": "teacher"}  — 키는 문항 번호(essay_scores 와 같은 키)
-- 적혀 있지 않은 옛 점수는 선생님이 매긴 것으로 본다(덮어쓰지 않는다).
alter table public.omr_scans
  add column if not exists essay_score_sources jsonb not null default '{}'::jsonb;
