-- v10: 성적표 발송 기록 — 누구에게, 언제, 어떤 결과로 나갔는가.
--
-- 이 표가 없으면 "누가 못 받았는지"를 영영 알 수 없다. 60명에게 보내고 나면
-- 실패한 몇 건이 조용히 묻히기 때문에, 실패분만 다시 보내려면 기록이 필요하다.
--
-- 전화번호는 **저장하지 않는다.** 성적표(student_reports)에도 마스킹된 번호만
-- 두고 있고, 실제 번호는 발송 시점에 학생 관리 프로그램에서 가져와 쓰고 버린다.
-- 여기에는 확인용 마스킹 값만 남긴다 — 개인정보를 두 곳에 늘리지 않기 위해서다.

create table if not exists public.report_messages (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.student_reports(id) on delete cascade,
  exam_id uuid references public.exams(id) on delete set null,

  -- 'parent' | 'student' — 같은 성적표를 둘에게 따로 보낼 수 있다
  recipient_type text not null,
  /** 확인용 마스킹 번호(예: 010-****-1234). 원본은 저장하지 않는다 */
  phone_masked text not null,

  -- 'sent' | 'failed'
  status text not null,
  -- 'alimtalk' | 'sms' — 알림톡이 실패해 문자로 대체 발송된 경우를 구분한다
  channel text,
  /** 대행사가 돌려준 메시지 ID — 나중에 결과를 다시 조회할 때 쓴다 */
  provider_message_id text,
  error text,

  sent_by text,
  created_at timestamptz not null default now()
);

create index if not exists report_messages_report_id_idx
  on public.report_messages(report_id, created_at desc);
create index if not exists report_messages_exam_id_idx
  on public.report_messages(exam_id, created_at desc);

comment on table public.report_messages is
  '성적표 알림톡·문자 발송 기록. 재발송과 실패 확인의 근거.';
comment on column public.report_messages.phone_masked is
  '확인용 마스킹 번호. 실제 번호는 저장하지 않고 발송 시점에만 조회해 쓴다.';
