-- v7: 검수 화면용 스캔 미리보기 경로
--
-- 원본 스캔(특히 PDF)은 한 장을 보려고 파일 전체를 받아야 해 느리다.
-- 판독할 때 만든 가벼운 미리보기(판독기가 실제로 본 이미지)를 따로 보관하고
-- 검수 화면에서는 이것만 띄운다.
--
-- Supabase → SQL Editor 에 붙여넣고 실행하세요.

alter table public.omr_scans
  add column if not exists preview_path text;

comment on column public.omr_scans.preview_path is
  '검수용 미리보기 이미지의 Storage 경로. 원본과 함께 보관 기간이 지나면 삭제된다.';
