-- v9: 주관식 전사 — 학생이 손으로 쓴 답을 글자로 옮겨 담는다.
--
-- 지금까지 주관식은 선생님이 답안지를 한 장씩 넘겨보며 엑셀에 점수만 적었다.
-- 이제 판독할 때 주관식 칸 이미지를 함께 잘라 두고, 그것을 글자로 옮겨
-- 같은 답끼리 묶어 채점한다.
--
-- essay_answers  {문항번호: "전사된 답안"}
--   전사한 글자. 선생님이 검수하며 고치면 고친 값이 남는다.
--   원본 이미지는 아래 essay_crops에 그대로 있으므로 언제든 대조할 수 있다.
--
-- essay_crops    {문항번호: "보관함 경로"}
--   주관식 칸을 반듯하게 펴서 잘라낸 이미지. 채점 화면에서 전사 결과 옆에
--   나란히 띄운다 — 잘못 읽은 것이 있으면 눈으로 바로 확인된다.
--
-- 점수는 기존 essay_scores 열을 그대로 쓴다(채점 엔진이 이미 읽고 있다).

alter table public.omr_scans
  add column if not exists essay_answers jsonb not null default '{}'::jsonb;

alter table public.omr_scans
  add column if not exists essay_crops jsonb not null default '{}'::jsonb;

comment on column public.omr_scans.essay_answers is
  '{문항번호: 전사된 주관식 답안}. 선생님이 고치면 고친 값이 남는다.';

comment on column public.omr_scans.essay_crops is
  '{문항번호: Storage 경로}. 주관식 칸을 펴서 잘라낸 이미지 — 전사 대조용.';
