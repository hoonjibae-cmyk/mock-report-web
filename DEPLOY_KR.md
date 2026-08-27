# 비개발자용 배포 가이드

> 이 버전은 Vercel 설치 오류를 막기 위해 Node.js 22, npm 10, 공개 npm 레지스트리, `npm ci`를 고정했습니다.

아래 순서대로 진행하면 됩니다. 코드를 수정할 필요는 없습니다.

## 1단계. Supabase 데이터베이스 만들기

1. Supabase에 로그인하고 **New project**를 누릅니다.
2. 프로젝트 이름과 데이터베이스 비밀번호를 정한 뒤 프로젝트를 생성합니다.
3. 왼쪽 메뉴에서 **SQL Editor**를 엽니다.
4. 이 프로젝트의 `supabase/schema.sql` 파일 내용을 전부 복사하여 붙여넣습니다.
5. **Run**을 눌러 실행합니다.
6. 왼쪽 **Table Editor**에서 아래 두 표가 생겼는지 확인합니다.
   - `report_batches`
   - `student_reports`

## 2단계. Supabase 키 확인하기

1. Supabase 프로젝트의 **Project Settings → API**로 이동합니다.
2. 아래 두 값을 별도로 메모합니다.
   - Project URL → `SUPABASE_URL`
   - `service_role` secret key → `SUPABASE_SERVICE_ROLE_KEY`
3. `service_role` 키는 절대 카카오톡·메일·문서에 공개하지 마세요. Vercel 환경변수에만 입력합니다.

## 3단계. Vercel에 프로젝트 올리기

### 기존 Vercel 프로젝트에 다시 배포하는 경우

1. 압축을 **새 폴더**에 풉니다.
2. `package.json`, `package-lock.json`, `vercel.json`이 바로 보이는 폴더로 들어갑니다.
3. 해당 폴더의 주소창에 `cmd`를 입력해 명령 프롬프트를 엽니다.
4. 아래 명령을 실행합니다.

```bat
npx.cmd vercel --prod --force
```

5. 기존 프로젝트 연결 여부가 나오면 **Yes**를 선택하고, 기존 모의고사 웹리포트 프로젝트를 선택합니다.
6. Supabase SQL과 Vercel 환경변수는 기존 값이 그대로라면 다시 만들 필요가 없습니다.

### 처음 배포하는 경우

가장 쉬운 방법은 이 폴더를 GitHub 저장소에 올린 뒤 Vercel에서 불러오는 것입니다.

1. GitHub에서 새 비공개 저장소를 만듭니다.
2. `mock-report-web-v1` 폴더의 파일을 저장소에 업로드합니다.
3. Vercel에서 **Add New → Project**를 누릅니다.
4. 방금 만든 GitHub 저장소를 선택합니다.
5. Framework Preset이 **Next.js**로 표시되는지 확인합니다.

## 4단계. Vercel 환경변수 입력하기

Vercel의 **Environment Variables**에 다음을 입력합니다.

| 이름 | 입력값 |
|---|---|
| `SUPABASE_URL` | Supabase Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role secret |
| `ADMIN_PASSWORD` | 관리자 화면에서 사용할 비밀번호 |
| `AUTH_SECRET` | 영문·숫자를 섞은 긴 임의 문자열, 32자 이상 권장 |
| `OPENAI_API_KEY` | AI 총평을 사용할 경우 OpenAI API 키 |
| `REPORT_PIN_REQUIRED` | `true` |
| `OMR_API_URL` | OMR 판독 서비스 주소(예: `https://omr-api-xxxx.onrender.com`) |
| `OMR_API_KEY` | OMR 서비스와 공유하는 비밀 키(서비스 배포 시 정한 값) |

`NEXT_PUBLIC_SITE_URL`은 비워도 됩니다. 커스텀 도메인을 쓰고 링크 주소를 고정하고 싶을 때만 `https://도메인`을 입력합니다.

`OMR_API_URL`/`OMR_API_KEY`는 **OMR 답안지 생성·스캔 판독** 기능(관리자 → “OMR 시험”)에 필요합니다.
별도 Python OMR 서비스(무상태)를 Render 등에 배포하고 그 주소·키를 입력하세요. 이 값이 없으면
기존 엑셀 업로드 성적표 기능은 정상 동작하고, OMR 답안지 생성 시에만 오류 메시지가 표시됩니다.

## 5단계. 배포하기

1. Vercel에서 **Deploy**를 누릅니다.
2. 배포가 끝나면 제공된 주소를 엽니다.
3. `ADMIN_PASSWORD`로 로그인합니다.
4. 관리자 화면 상단의 **입력 템플릿 받기**로 파일을 내려받습니다.

## 6단계. 실제 성적표 만들기

1. 템플릿의 국어·수학·영어 탭에 학생 정보를 입력합니다.
2. 문항별 학생 답안 또는 O/X를 입력합니다.
3. 관리자 화면에서 엑셀을 업로드합니다.
4. 생성된 학생별 링크를 복사합니다.
5. 링크 CSV를 내려받아 문자 발송 목록에 활용할 수 있습니다.
6. PIN 보호를 켰다면 학부모는 등록된 휴대전화 뒤 4자리를 입력해야 합니다.

## 7단계. 링크 관리하기

- **중지**: 기존 링크를 즉시 열 수 없게 합니다.
- **활성화**: 중지한 링크를 다시 엽니다.
- **새 링크**: 기존 URL을 폐기하고 새로운 URL을 생성합니다.
- **전체 CSV**: 학생명·학교·링크 목록을 내려받습니다.

## 문제 해결

### “SUPABASE_URL…” 오류가 뜨는 경우
Vercel 환경변수가 빠졌거나 오타가 있습니다. 수정 후 **Redeploy**합니다.

### 국어·수학·영어 시트를 찾지 못했다고 나오는 경우
엑셀 시트명을 정확히 `국어`, `수학`, `영어`로 맞춥니다.

### 문항이 미입력으로 나오는 경우
열 제목을 `1번문항`, `2번문항` 형식으로 확인하고, 문항 값은 숫자 또는 O/X로 입력합니다.

### AI 총평이 규칙 기반으로 표시되는 경우
`OPENAI_API_KEY`가 없거나 API 응답이 실패한 경우입니다. 점수·영역 분석과 링크 생성에는 문제가 없습니다.

### 학부모 PIN이 맞지 않는 경우
엑셀의 `학부모HP` 마지막 4자리를 확인합니다. 필요하면 관리자 화면에서 새 링크를 만들기보다 해당 성적표를 다시 생성하는 것이 안전합니다.


### `npm error Exit handler never called!`가 뜨는 경우

이 수정본에는 외부에서 접근할 수 없는 사설 패키지 주소가 들어가지 않도록 정리한 `package-lock.json`과 공개 npm 주소를 지정한 `.npmrc`가 포함되어 있습니다. 반드시 예전 폴더가 아니라 이 수정본 폴더 전체로 다시 배포하세요.

Vercel의 **Settings → Build and Deployment**에서 Install Command를 따로 입력해 둔 적이 있다면 지우고 기본값으로 두어도 됩니다. 이 프로젝트의 `vercel.json`이 `npm ci --no-audit --no-fund`를 자동 적용합니다.


## v1.4 참고
- `OPENAI_MODEL` 환경변수는 만들지 않아도 됩니다. 관리자 화면에서 모델을 선택합니다.
- 삭제 기능을 위해 추가 SQL을 실행할 필요는 없습니다. 기존 `on delete cascade` 구조를 사용합니다.

---

## v1.5 일반 사용자 계정 기능 적용

기존 v1.4 이하 프로젝트에서 업데이트하는 경우, Vercel 재배포 전에 Supabase SQL Editor에서 아래 파일을 전체 실행하세요.

```text
supabase/migration_v1.5_user_accounts.sql
```

관리자 로그인 정보는 다음과 같습니다.

```text
아이디: ADMIN_USERNAME 환경변수 (미설정 시 admin)
비밀번호: ADMIN_PASSWORD 환경변수
```

관리자로 로그인한 뒤 관리자 페이지 하단의 `일반 사용자 계정 관리`에서 일반 사용자 아이디, 이름, 초기 비밀번호를 등록합니다. 일반 사용자는 AI 총평 모델 선택과 계정 관리 기능을 사용할 수 없으며, 나머지 기능은 관리자 권한 설정에 따라 사용할 수 있습니다.
