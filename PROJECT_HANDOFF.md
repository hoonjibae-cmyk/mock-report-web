# 개발 인수인계 요약

## 핵심 흐름

1. `/admin`에서 `.xlsx` 파일 업로드
2. `lib/parser.ts`가 국어·수학·영어 시트와 학생·문항 열 탐지
3. `lib/analysis.ts`가 정답·배점·영역 기준으로 분석
4. `lib/ai.ts`가 익명 분석값으로 AI 총평 생성, 실패 시 규칙 총평
5. `report_batches`, `student_reports`에 저장
6. `/r/[token]`에서 PIN 확인 후 웹리포트 표시

## 수정 지점

- 문항 정답/분류/전국 통계: `data/exams.json`
- 웹리포트 UI: `components/ReportView.tsx`, `app/globals.css`
- 엑셀 파싱: `lib/parser.ts`
- 점수·순위·상위 추정 계산: `lib/analysis.ts`
- AI 프롬프트·출력 스키마: `lib/ai.ts`
- DB: `supabase/schema.sql`

## 보안 원칙

- Supabase service-role과 OpenAI API 키는 서버 전용
- 전체 휴대전화 미저장
- AI에 학생명·전화번호 미전송
- 공개 토큰은 난수, PIN은 HMAC 해시

## v1.5 계정·권한 구조
- 환경변수 `ADMIN_USERNAME`/`ADMIN_PASSWORD`는 최상위 관리자 계정이다. `ADMIN_USERNAME` 기본값은 `admin`이다.
- 일반 사용자는 Supabase `app_users` 테이블에 저장한다.
- 비밀번호는 Node.js scrypt 해시로 저장하며 평문은 저장하지 않는다.
- 일반 사용자 세션은 매 요청마다 DB의 활성 상태와 최신 권한을 다시 확인한다.
- 일반 사용자는 AI 모델 선택 및 사용자 관리 API/UI에 접근할 수 없다.
- 일반 사용자 업로드는 `DEFAULT_AI_MODEL`을 서버에서 강제 적용한다.
- 권한: viewReports, createReports, manageReports, deleteReports, exportReports, downloadTemplate.
- 기존 설치본은 `supabase/migration_v1.5_user_accounts.sql` 실행이 필수다.
