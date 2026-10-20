-- v19 — 반배치고사 재원 구분(재원생/신규생) 표기와 신규생의 학생 열쇠
-- Supabase SQL Editor에서 그대로 실행한다(여러 번 실행해도 안전).
--
-- 답안지의 '재원 구분' 칸을 판독기가 읽은 값. 신규생은 수험번호(출결번호)가 없어
-- 답안지에 전화번호 뒤 4자리를 쓰므로, 이 값이 '신규생'이면 student_id를 수험번호가
-- 아니라 전화번호 뒤 4자리로 본다.
alter table public.omr_scans add column if not exists enrollment text
  check (enrollment is null or enrollment in ('재원생', '신규생'));

-- 신규생을 학생 관리 프로그램에서 맞춘 뒤의 학생 열쇠(카드번호, 없으면 sc<학생ID>).
-- 성적표·반배정 요청은 이 열쇠로 학생을 가리킨다. 비어 있으면 student_id가 열쇠다.
alter table public.omr_scans add column if not exists student_key text;
