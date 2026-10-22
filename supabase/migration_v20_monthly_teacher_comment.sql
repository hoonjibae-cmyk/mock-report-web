-- v20 — 이미 만든 월말평가에 '담임 의견 사용'을 켠다 (자료 고침, 표 구조 변경 없음)
-- Supabase SQL Editor에서 그대로 실행한다(여러 번 실행해도 안전).
--
-- v1.51.4부터 월말평가를 만들 때 '담임 의견 사용'이 기본으로 켜진다. 그 전에 만든
-- 월말평가 중 체크를 빠뜨린 시험도 같은 상태로 맞춘다 — 월말평가 성적표에는 담임
-- 의견이 늘 들어가므로, 꺼져 있으면 담임 의견 화면이 비고 성적표에 코멘트가 빠진다.
update public.exams
   set use_teacher_comment = true
 where exam_type = 'monthly'
   and use_teacher_comment = false;

-- 확인: 월말평가 가운데 아직 꺼진 시험이 0건이어야 한다
select count(*) as still_off
  from public.exams
 where exam_type = 'monthly'
   and use_teacher_comment = false;
