-- v21 — 월말평가의 레벨·시행월과 성적표 비교 집단(반 평균 / 레벨 평균)
-- Supabase SQL Editor에서 그대로 실행한다(여러 번 실행해도 안전).
--
-- 월말평가 성적표의 평균은 지금까지 그 시험을 치른 반(그 시험의 답안지)만으로
-- 냈다. 담임이 같은 레벨의 다른 반도 가르치면 레벨 전체 평균과 견주고 싶을 수
-- 있어, 시험마다 비교 집단을 고르게 한다.
--
-- level        레벨(예: 'M4'). 비어 있으면 반 이름에서 유추한다(요일 앞부분).
-- period_month 시행월 'YYYY-MM'. 비어 있으면 제목의 'N월'(없으면 시험일·만든 날)에서 유추한다.
-- cohort_mode  'class' = 우리 반 평균(기본) / 'level' = 같은 레벨·같은 달·같은 담임의
--              다른 반 답안지까지 합쳐 평균을 낸다. 담임이 다른 반은 같은 레벨이어도 넣지 않는다.
alter table public.exams add column if not exists level text;
alter table public.exams add column if not exists period_month text;
alter table public.exams add column if not exists cohort_mode text not null default 'class'
  check (cohort_mode in ('class', 'level'));
