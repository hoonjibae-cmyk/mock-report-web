-- 목동유쌤영어학원 웹리포트 v3 — OMR 스캔 판독/검수
-- migration_v2_omr.sql 실행 후 한 번 실행하세요.

-- 스캔 1장 = 응시자 1명의 판독 결과. 검수(수정) 결과도 같은 행에 보관한다.
create table if not exists public.omr_scans (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  filename text not null,
  scan_path text,                                    -- omr-scans 버킷 내 경로(7일 보관)
  student_id text,                                   -- 검수 후 확정 수험번호
  student_id_qr text,                                -- QR에서 읽은 값(참고)
  student_id_bubbles text,                           -- 버블에서 읽은 값(참고)
  answers jsonb not null default '{}'::jsonb,        -- {"문항번호": 보기번호 | null}
  review_flags jsonb not null default '[]'::jsonb,   -- 판독기가 남긴 검수 대상 목록
  status text not null default 'pending' check (status in ('pending', 'reviewed')),
  read_error text,                                   -- 판독 실패 사유(있으면)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 같은 시험에 같은 파일을 다시 올리면 새 행이 아니라 기존 행을 갱신한다.
create unique index if not exists omr_scans_exam_filename_key
  on public.omr_scans(exam_id, filename);

create index if not exists omr_scans_exam_id_idx on public.omr_scans(exam_id, created_at);

drop trigger if exists omr_scans_set_updated_at on public.omr_scans;
create trigger omr_scans_set_updated_at
before update on public.omr_scans
for each row execute function public.set_updated_at();

-- 모든 DB 접근은 service-role 키로만 수행
alter table public.omr_scans enable row level security;
revoke all on table public.omr_scans from anon, authenticated;

-- 참고: 스캔 원본 저장용 Storage 버킷 `omr-scans`(비공개)를 Supabase 대시보드에서 만들어야
--        업로드 원본이 보관됩니다. 버킷이 없어도 판독·검수는 동작합니다(원본만 미보관).

notify pgrst, 'reload schema';
