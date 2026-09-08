-- v11: 인사 프로그램 연동 계정 — 부서가 권한을 정하고, 로그인은 슬랙으로.
--
-- 왜 바꾸는가
-- ----------
-- 지금까지 계정은 사람이 손으로 만들고 지웠다. 그러면 반드시 낡는다 —
-- 퇴사자가 몇 달째 로그인되고, 새로 온 선생님은 한참 뒤에야 계정을 받는다.
-- 소속은 인사 프로그램(HR-Manager)이 원본이므로, 거기서 읽어 와 맞춘다.
--
-- 비밀번호를 없앤 이유
-- ------------------
-- 직원은 이미 슬랙으로 일하고, 계정 안내도 슬랙으로 간다. 비밀번호를 따로
-- 만들면 그것을 어떻게든 전달해야 하고(슬랙 DM에 영영 남는다), 퇴사해도 그
-- 비밀번호는 살아 있다.
--
-- 슬랙 워크스페이스 멤버십은 회사가 통제한다. 퇴사자를 내보내면 그 순간
-- 로그인도 막힌다. 슬랙은 **누구인지** 를 확인해 주고, **들어와도 되는지** 는
-- 이 표가 정한다 — 조교팀도 슬랙에는 있지만 이 프로그램은 쓰지 않는다.
--
-- 그래서 password_hash 를 비울 수 있게 한다. 비어 있는 계정은 **비밀번호로
-- 로그인할 수 없다**(슬랙으로만 들어온다). 환경변수 관리자 계정은 그대로 남는다 —
-- 슬랙이나 인사 프로그램이 멈췄을 때 들어갈 문이 하나는 있어야 한다.

alter table public.app_users
  -- 'admin'(총괄) | 'user'(일반). 지금까지는 DB 계정이 무조건 일반이었고
  -- 관리자는 환경변수 계정 하나뿐이었다. 경영지원에 총괄을 주려면 필요하다.
  add column if not exists role text not null default 'user',
  -- 로그인 신원(슬랙 계정 이메일). 이 값이 로그인의 열쇠다.
  add column if not exists email text,
  -- 인사 프로그램의 사번. 이름이나 이메일이 바뀌어도 이 값은 안 바뀐다.
  add column if not exists hr_emp_no text,
  -- 마지막으로 확인한 소속. 화면에 보여 주고, 부서가 바뀌면 권한을 다시 맞춘다.
  add column if not exists hr_department text,
  -- 인사 연동이 만든 계정인가. 손으로 만든 계정을 연동이 함부로 끄지 않기 위해서다.
  add column if not exists managed_by_hr boolean not null default false,
  -- 슬랙 안내를 언제 보냈는가. 비어 있으면 아직 못 보낸 것 —
  -- 신규 입사자는 슬랙 가입 전일 수 있어, 다음 동기화 때 다시 시도한다.
  add column if not exists slack_notified_at timestamptz,
  -- 왜 껐는가(퇴사·부서 이동). 화면에서 사람이 읽는다.
  add column if not exists deactivated_reason text;

alter table public.app_users
  add constraint app_users_role_check check (role in ('admin', 'user')) not valid;
alter table public.app_users validate constraint app_users_role_check;

-- 슬랙으로 들어오는 계정은 비밀번호가 없다.
alter table public.app_users alter column password_hash drop not null;

-- 이메일은 로그인 열쇠라 겹치면 안 된다. 비어 있는 계정(예전 방식)은 여럿 있어도 된다.
create unique index if not exists app_users_email_unique_idx
  on public.app_users (lower(email)) where email is not null;

-- 한 직원에 계정 하나. 이름을 바꿔 다시 입사해도 계정이 둘로 갈라지지 않는다.
create unique index if not exists app_users_hr_emp_no_unique_idx
  on public.app_users (hr_emp_no) where hr_emp_no is not null;

comment on column public.app_users.role is
  '총괄(admin) | 일반(user). 인사 프로그램의 부서가 정한다.';
comment on column public.app_users.email is
  '로그인 신원. 슬랙 계정 이메일이 인사 프로그램의 직원 이메일과 같아야 로그인된다.';
comment on column public.app_users.managed_by_hr is
  '인사 연동이 만든 계정. 손으로 만든 계정은 연동이 끄지 않는다.';
comment on column public.app_users.slack_notified_at is
  '슬랙 안내를 보낸 시각. 비어 있으면 아직 못 보낸 것(슬랙 미가입 등)이라 다시 시도한다.';

notify pgrst, 'reload schema';
