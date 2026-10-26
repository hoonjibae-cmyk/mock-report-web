# 사용설명서 화면 사진 다시 찍기

`/guide` 에 실리는 화면 사진(`public/guide/*.png`)을 만드는 도구입니다.
화면을 고쳐서 설명서의 사진이 실제와 달라졌을 때 씁니다.

## 왜 이렇게 찍는가

**진짜 화면을 가짜 데이터로 띄워서** 찍습니다. 손으로 캡처하지 않는 이유가
셋 있습니다.

1. **설명서는 로그인 없이 열립니다.** 슬랙 안내 DM에서 계정이 없는 신규
   입사자도 바로 열어 보라고 만든 문서라, 진짜 학생 이름·연락처가 사진에
   들어가면 그대로 공개됩니다. 지어낸 데이터로 찍으면 그 걱정이 없습니다.
2. **데이터가 없는 단계도 채워진 모습으로 찍을 수 있습니다.** 검수·담임
   의견·발송 화면은 실제로 그 상황이 되어야 볼 수 있는데, 설명서에는 채워진
   모습이 실려야 뜻이 통합니다.
3. **화면만 잘라 나옵니다.** 브라우저 주소창이나 다른 탭이 섞이지 않고,
   화면이 바뀌면 같은 명령 한 줄로 아홉 장을 다시 찍습니다.

## 하는 법

```bash
# 1. 임시 페이지를 자리에 놓는다 (배포에 남기지 않는다)
mkdir -p app/shots-tmp
cp docs/guide-shots/fixtures-page.tsx.example app/shots-tmp/page.tsx

# 2. 개발 서버를 띄운다
npm run dev

# 3. 사진을 찍는다 (public/guide/ 에 바로 저장된다)
NODE_PATH=/opt/node22/lib/node_modules node docs/guide-shots/capture.mjs

# 4. 임시 페이지를 치운다 — 이 정리를 빠뜨리면 그대로 배포된다
rm -rf app/shots-tmp
```

`capture.mjs` 안의 `SHOTS` 가 어느 화면을 어디까지 자를지 정합니다.
`clipRows` 는 CSS 픽셀 기준 높이로, 긴 화면을 설명에 필요한 윗부분까지만
남깁니다.

서버를 부르는 화면(검수 요약·발송 대상 등)은 `page.route` 로 그럴듯한 답을
대신 줍니다. **응답 모양을 실제 API와 맞춰 두어야 합니다** — 필드 하나가
빠지면 화면이 그 자리에서 죽습니다(실제 API는 늘 채워 보내므로 프로그램
쪽 문제가 아닙니다).

## 사진을 새로 늘릴 때

가이드의 이미지 경로·설명·크기는 `app/guide/guide-data.json`에서 관리합니다.

### 발송 전 성적표 미리보기 (2026-10-26)

`report-preview-page.tsx.example`을 임시 `app/shots-tmp/page.tsx`로 복사하고
개발 서버를 실행합니다. 실제 `OmrDashboard`, `ExamSummary`, `GenericReport`
컴포넌트에 가상의 시험·학생·점수·의견을 전달하므로 공개 가이드에 실제
학생 정보가 포함되지 않습니다.

브라우저에서 아래 화면을 차례대로 열고 본문을 캡처합니다.

- `/shots-tmp?screen=list` → `public/guide/10-preview-exam-list.jpg`
- `/shots-tmp?screen=summary` → `public/guide/11-preview-student-name.jpg`
- `/shots-tmp?screen=report` → `public/guide/12-preview-report.jpg`

예시 이름 링크의 토큰은 실제 성적표가 아닙니다. 링크를 클릭하는 대신
`screen=report`로 이동합니다. 임시 경로는 개발 모드에서만 동작하지만,
캡처 후 임시 `app/shots-tmp/page.tsx`를 반드시 제거하고 배포합니다.
