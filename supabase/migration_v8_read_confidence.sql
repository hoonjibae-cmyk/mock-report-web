-- v8: 판독 확신 정보 저장 — 자동 검수 통과 판단에 쓴다.
--
-- 판독기가 '어떻게 읽었는지'(answers)와 별개로 '얼마나 확실한지'를 함께 넘긴다.
-- 학생이 그냥 안 푼 문항과 연필이 흐려 못 읽은 문항을 구분해야, 사람이 실제로
-- 봐야 하는 답안지만 골라낼 수 있다.
--
-- read_confidence 예시:
--   {"uncertain": [7, 23], "multiMarked": [12], "idUncertain": false, "idConflict": false}
--     uncertain   — 판정이 경계에 걸쳐 사람이 눈으로 봐야 하는 문항
--     multiMarked — 둘 이상 칠해진 문항('모두 고르기'면 정상)
--     idUncertain — 수험번호 자리 중 애매하게 읽힌 곳이 있음
--     idConflict  — QR과 마킹의 수험번호가 어긋남(학생별 답안지에서만 발생)
--
-- 이 값이 없는(=이전에 올린) 답안지는 null이며, 자동 통과 대상에서 제외된다.

alter table public.omr_scans
  add column if not exists read_confidence jsonb;

comment on column public.omr_scans.read_confidence is
  '판독 확신 정보. 자동 검수 통과 판단용. null이면 판정 정보 없음(수동 검수).';

-- 자동 확인으로 넘어간 답안지를 사람이 누른 것과 구분해 기록한다.
-- 나중에 "이 성적표는 누가 확인한 것인가"를 되짚을 수 있어야 한다.
alter table public.omr_scans
  add column if not exists reviewed_by text;

comment on column public.omr_scans.reviewed_by is
  '검수 확인 주체. ''auto'' = 시스템 자동 통과, 그 외에는 사용자 ID.';
