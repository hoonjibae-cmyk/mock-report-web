-- v22 — 답안지를 올린 사람 · 내용 기반 고유 키 · 손글씨 판독 상태
--
-- 반배치고사처럼 여러 직원이 답안지를 나눠 스캔해 동시에 올리면, 지금까지의
-- 고유 키(시험, 파일명)가 서로를 덮어썼다. 스캐너가 붙이는 기본 파일명
-- (Scan0001.pdf, img001.jpg …)은 사람이 달라도 같기 때문이다. 덮어쓸 때 서술형
-- 전사·점수 열은 그대로 남아, 앞 학생의 전사(빈칸 포함)가 뒤 학생에게 붙는
-- 사고가 났다 — "답을 썼는데 빈칸으로 읽혔다"의 정체다.
--
-- uploaded_by   올린 사람(계정 ID). 검수·주관식 채점 화면이 "내가 올린 답안지"
--               범위로 좁혀 보는 근거.
-- content_hash  파일 내용의 SHA-256(PDF는 쪽 번호까지 붙인다). 똑같은 파일을
--               다시 올리면 그 행을 갱신하고, 이름만 같은 다른 파일은 새 행이
--               된다. 예전 행은 해시가 없어(null) 서로 겹치지 않는다.
-- essay_flags   {문항번호: "unclear"} — 손글씨를 읽긴 했지만 확실하지 않아
--               사람이 봐야 하는 칸. 자동 채점이 0점으로 넘기지 않는다.

alter table public.omr_scans add column if not exists uploaded_by text;
alter table public.omr_scans add column if not exists content_hash text;
alter table public.omr_scans add column if not exists essay_flags jsonb not null default '{}'::jsonb;

-- 파일명 고유 키 → 내용 고유 키
drop index if exists public.omr_scans_exam_filename_key;
create unique index if not exists omr_scans_exam_hash_key on public.omr_scans(exam_id, content_hash);
create index if not exists omr_scans_exam_uploader_idx on public.omr_scans(exam_id, uploaded_by);

comment on column public.omr_scans.uploaded_by is
  '올린 사람(app_users.username). 검수·채점 화면의 "내가 올린 답안지" 범위 기준.';
comment on column public.omr_scans.content_hash is
  '파일 내용 SHA-256(PDF는 ":p쪽번호" 접미). 같은 내용은 같은 행, 같은 이름의 다른 내용은 다른 행.';
comment on column public.omr_scans.essay_flags is
  '{문항번호: "unclear"} — 손글씨 판독이 불확실해 사람이 봐야 하는 칸.';

notify pgrst, 'reload schema';
