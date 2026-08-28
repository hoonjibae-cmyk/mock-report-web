-- v6: 국영수 모의고사 시험 기반 정보(문항분류표 · 전국비교기준)
--
-- 학원에서 OMR로 채점한 점수만으로는 전국 등급·상위 추정과 문항 분류별 분석을
-- 만들 수 없다. 성적표를 뽑기 전에 그 회차의 기준 자료를 엑셀로 올려 시험에
-- 붙여 둔다(과목마다 시험이 따로이므로 시험 단위로 저장).
--
-- Supabase → SQL Editor 에 붙여넣고 실행하세요.

alter table public.exams
  add column if not exists mock_reference jsonb;

comment on column public.exams.mock_reference is
  '국영수 모의고사 기준 자료: {subject, items[], gradeCuts[], nationalAverage, ...}. 다른 유형은 null.';
