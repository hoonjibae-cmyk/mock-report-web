-- v12 — 성적표에 담임·반을 남긴다 (담임 선생님의 '내 반' 화면용)
--
-- 왜 성적표에 두는가
-- ----------------
-- 담임은 학생 관리 프로그램(Student-Card)이 원본이고, 성적표를 만들 때 수험번호로
-- 불러온다. 그 값을 성적표 행에 같이 적어 두면 "이 성적표는 누구 반 학생 것인가"에
-- 그 시점 기준으로 답할 수 있다. 나중에 반이 바뀌어도 그때 성적표는 그때 담임의
-- 것으로 남는다 — 성적표는 발행 당시의 기록이지 현재 명부가 아니다.
--
-- homeroom_key
-- ------------
-- 담임 이름은 사람이 적은 글자라 '김 선생'과 '김선생'이 섞인다. 로그인한 직원의
-- 이름(인사 프로그램)과 맞춰 보려면 공백·대소문자를 뺀 열쇠가 필요하다. 조회할
-- 때마다 전 행을 훑지 않도록 생성 컬럼으로 미리 만들어 두고 인덱스를 건다.

alter table public.student_reports
  add column if not exists homeroom_teacher text,   -- 학생 관리 프로그램의 '담임' 그대로
  add column if not exists class_name text;         -- 학생 관리 프로그램의 '반' 그대로

alter table public.student_reports
  add column if not exists homeroom_key text
    generated always as (nullif(regexp_replace(lower(coalesce(homeroom_teacher, '')), '\s', '', 'g'), '')) stored;

create index if not exists student_reports_homeroom_key_idx
  on public.student_reports(homeroom_key)
  where homeroom_key is not null;
