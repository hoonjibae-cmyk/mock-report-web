-- v5: 시스템 전역 설정 (AI 총평 모델 등)
--
-- 예전에는 AI 모델을 브라우저 localStorage에 저장해서, 사람마다·기기마다 달랐고
-- 서버에서 도는 작업(성적표 일괄 생성 등)에는 반영되지 않았다. 한 곳에 저장해
-- 모든 AI 기능이 같은 모델을 쓰도록 한다.
--
-- Supabase → SQL Editor 에 붙여넣고 실행하세요.

create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

comment on table app_settings is '시스템 전역 설정. key 하나당 값 하나(jsonb).';

-- service-role 키로만 접근한다(관리자 API 경유). 익명 접근은 막는다.
alter table app_settings enable row level security;
