# Vercel `Exit handler never called` 오류 수정 내용

## 원인

기존 `package-lock.json`의 패키지 다운로드 주소가 외부 Vercel 빌드 서버에서 접근할 수 없는 사설 레지스트리 주소로 고정되어 있었습니다. 또한 `package.json`의 `postcss` override가 기존 lock 파일에 완전히 반영되지 않아 설치 트리가 불일치했습니다.

## 수정

- lock 파일을 `package.json`과 다시 동기화
- `postcss@8.5.10`을 lock 파일에 반영
- lock 파일에서 레지스트리별 `resolved` 주소 제거
- `.npmrc`에서 공개 npm 레지스트리 지정
- Node.js 22.x 지정
- Vercel 설치 명령을 `npm ci --no-audit --no-fund`로 고정

## 재배포

압축을 새 폴더에 푼 뒤, `package.json`이 있는 폴더에서 다음을 실행합니다.

```bat
npx.cmd vercel --prod --force
```

기존 프로젝트를 유지하려면 연결 질문에서 기존 모의고사 웹리포트 프로젝트를 선택합니다.

## v1.2 템플릿 다운로드 404 수정

- 한글 파일명을 URL로 직접 요청하던 방식을 제거했습니다.
- 관리자 버튼은 `/api/admin/template` 다운로드 API를 호출합니다.
- 실제 배포 파일명은 ASCII 전용 `score-input-template-2026.xlsx`를 사용합니다.
- API 응답의 `Content-Disposition`에서 사용자에게는 한글 파일명으로 저장되도록 처리했습니다.
- Vercel 서버리스 함수 번들에 템플릿이 포함되도록 `outputFileTracingIncludes`를 추가했습니다.
