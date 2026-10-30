# 학생 정보 연동 규약 (OMR 리포트 ↔ Student-Card)

OMR 답안지가 읽을 수 있는 학생 정보는 **수험번호 하나뿐**입니다. 이름·학교·학년·학부모 연락처는
OMR 리포트에 두지 않고, 학생 관리 프로그램(**Student-Card**)을 단일 출처로 삼아 성적표를 만들 때
가져옵니다.

이 문서는 **Student-Card 쪽에 추가해야 할 엔드포인트 하나**의 규약입니다. OMR 리포트 쪽 구현
(`lib/student-directory.ts`)은 이미 이 규약대로 호출합니다.

---

## 1. OMR 리포트에 넣을 환경변수

Vercel → Settings → Environment Variables (Production · Preview · Development 모두)

| 이름 | 값 |
|---|---|
| `STUDENT_API_URL` | Student-Card 주소 (예: `https://student-card.vercel.app`) |
| `STUDENT_API_KEY` | Student-Card의 `API_KEY` 환경변수와 **같은 값** |

넣지 않으면 연동이 꺼진 상태로 동작합니다 — 성적표 화면에서 이름을 직접 입력하면 됩니다.

---

## 2. Student-Card가 제공할 엔드포인트

```
POST /api/students/lookup
Header: x-api-key: <API_KEY>
Content-Type: application/json
```

Student-Card에는 이미 `requireApiKeyOrAuth`(`server/lib/auth.js`)와 `API_KEY` 설정이 있으므로
그대로 쓰면 됩니다. `/api/reports/hr/teacher-monthly`와 같은 방식입니다.

### 요청

```json
{ "examNumbers": ["10231", "10244", "10255"] }
```

- 최대 300개
- 값은 문자열. OMR이 읽은 수험번호를 그대로 보냅니다(앞자리 0이 있을 수 있어 문자열입니다).

### 응답

```json
{
  "ok": true,
  "students": [
    {
      "examNumber": "10231",
      "name": "김민준",
      "school": "목운중학교",
      "grade": "3",
      "parentPhone": "010-1234-5678",
      "className": "중3 A반",
      "teacher": "박선생",
      "status": "재원"
    }
  ]
}
```

- 찾지 못한 수험번호는 **배열에서 빼면 됩니다**(오류가 아닙니다). OMR 쪽이 빠진 번호를 모아
  "찾지 못한 수험번호"로 화면에 보여 줍니다.
- 필드 이름은 snake_case(`parent_phone`, `school_name`, `card_no` …)로 보내도 됩니다. OMR 쪽에서
  두 표기를 모두 받습니다.

### 수험번호를 무엇과 맞출 것인가

> **OMR 리포트의 수험번호 = Student-Card의 카드번호(`student_card.students.card_no`)**

이 대응이 규약입니다. `card_no`로 정확히 일치하는 학생을 찾으면 됩니다.

```sql
select * from student_card.students where card_no = any($1::text[]);
```

- 앞자리 0이 있을 수 있으므로 **문자열로 비교**하세요(숫자 변환 금지).
- 같은 카드번호를 쓰는 학생이 둘 이상이면(퇴원생이 쓰던 번호를 신입생이 물려받은 경우)
  `status = '재원'` 인 학생을 우선하고, 그래도 여럿이면 `registered_at`이 최신인 쪽을 돌려주세요.
- 응답의 `examNumber`에는 **요청받은 값을 그대로** 돌려주는 것이 가장 안전합니다.

`student_no`(학번)나 `student_key`는 이 연동에서 쓰지 않습니다. 다만 예전 자료 때문에 카드번호가
비어 있는 학생이 있다면, 보조로 `student_no`까지 찾아보는 것은 무방합니다.

### 구현 예시 (Express)

```js
// server/routes/students.js
router.post('/lookup', requireApiKeyOrAuth, wrap(async (req, res) => {
  const keys = (req.body?.examNumbers ?? []).map(String).map((s) => s.trim()).filter(Boolean);
  if (keys.length === 0) return res.json({ ok: true, students: [] });
  if (keys.length > 300) return res.status(400).json({ error: '한 번에 최대 300명까지 조회할 수 있습니다.' });

  // 수험번호 = 카드번호(card_no). 문자열로 비교한다.
  const rows = await findStudentsByCardNo(keys);
  res.json({
    ok: true,
    students: rows.map((row) => ({
      examNumber: row.matchedKey,          // 요청받은 값을 그대로
      name: row.name,
      school: row.school_name,
      grade: row.grade == null ? '' : String(row.grade),
      parentPhone: row.parent_phone || row.parent_hp1 || '',
      className: row.class_name,
      teacher: row.teacher,
      status: row.status,
    })),
  });
}));
```

---

## 3. OMR 리포트 쪽 동작

- 성적표 화면(`STEP 3`/`STEP 4`)의 **학생 정보 불러오기** 버튼 → 검수 완료된 수험번호를 한 번에 조회
- **이미 손으로 채워 둔 칸은 덮어쓰지 않습니다**
- 학부모 연락처 뒤 4자리가 성적표 열람 PIN이 됩니다
- API 키는 브라우저로 나가지 않습니다 — OMR 서버(`/api/admin/students/lookup`)가 대신 호출합니다
- 타임아웃 10초. 연동이 없거나 실패해도 성적표 생성은 막지 않습니다(이름 직접 입력으로 진행)

## 4. 연결 확인

OMR 리포트 → **설정 → 학생 정보 연동 → 연결 확인**

| 결과 | 뜻 |
|---|---|
| `연결됨 — <주소>` | 정상 |
| `STUDENT_API_URL이 설정되어 있지 않습니다` | 환경변수 없음 |
| `조회 API(/api/students/lookup)가 아직 없습니다` | Student-Card에 엔드포인트 미구현 |
| `인증을 거부했습니다` | 두 시스템의 키가 다름 |

---

## 3. 반 명단 조회 (v1.65.0 이상) — 월말평가 미응시자 확인

OMR 리포트의 운영진 검토 화면이 "이 반에서 시험을 아예 안 본 학생이 있나"를 보여 주기 위해 씁니다.
성적표는 시험 본 학생에게만 있으므로, 반 전체가 누구인지는 Student-Card에서 가져옵니다.

```
POST /api/students/roster
Header: x-api-key: <API_KEY>
Content-Type: application/json
```

### 요청

```json
{ "classNames": ["M4 화목 R", "중3 A반"] }
```

- 최대 30개 반. 값은 성적표에 적힌 반 이름 그대로입니다(Student-Card의 반명과 같아야 맞춰집니다).

### 응답

```json
{
  "ok": true,
  "classes": [
    {
      "className": "M4 화목 R",
      "students": [
        { "examNumber": "10231", "name": "김민준", "teacher": "박선생", "status": "재원" }
      ]
    }
  ]
}
```

- **재원생만**, 이름순. '지금 그 반'은 Student-Card 화면·대시보드와 같은 규칙(열린 배정 구간, 없으면 대표 반)입니다.
- 이름·카드번호·담임만 나갑니다. **연락처는 나가지 않습니다.**
- 없는 반은 빈 `students` 로 돌아옵니다(오류가 아닙니다).
- 본인 담당반만 보는 계정(교수부)으로는 403. 조회는 감사 기록(`student.lookup`)에 남습니다.

OMR 리포트 쪽은 카드번호(= 수험번호)로 맞추고, 카드번호가 없을 때만 이름(띄어쓰기 무시)으로 맞춥니다.

---

## 4. 반 목록 조회 (v1.66.0 이상) — 월말평가 '반 선택'

담임이 OMR 리포트에서 월말평가를 만들 때 자기 반을 고르기 위해 씁니다.

```
GET /api/students/classes
Header: x-api-key: <API_KEY>
```

### 응답

```json
{
  "ok": true,
  "classes": [
    { "className": "M4 화목 R", "teacher": "박선생", "count": 18 }
  ]
}
```

- 오늘 기준으로 재원생이 있는 반만, 반 현황 화면과 같은 규칙(열린 배정 구간)으로 셉니다.
- 학생 이름·연락처는 나가지 않습니다.
- OMR 리포트는 `teacher` 를 로그인한 계정 이름과 이름 열쇠(공백·대소문자 무시)로 맞춰 **그 선생님 반만** 보여 줍니다.
  맞는 반이 없으면(경영지원 등) 전체 반을 보여 줍니다.

---

## 5. 전화번호 뒤 4자리 조회 (v1.95.0 이상) — 반배치고사 신규생

반배치고사를 보러 온 신규생은 아직 수험번호(카드번호)가 없어 답안지의 수험번호 칸에 **전화번호 뒤
4자리**를 씁니다(답안지 '재원 구분'에 ‘신규생’ 표기). OMR 리포트는 그 번호로 학생을 찾습니다.

```
POST /api/students/phone-lookup
Header: x-api-key: <API_KEY>
Content-Type: application/json
```

### 요청

```json
{ "suffixes": ["7788", "4455"] }
```

- 최대 300개, 각각 숫자 4자리.

### 응답

```json
{
  "ok": true,
  "matches": [
    {
      "suffix": "7788",
      "students": [
        {
          "examNumber": "",
          "reportKey": "sc123",
          "name": "김민준",
          "school": "목운중학교",
          "grade": "1",
          "schoolLevel": "중등",
          "parentPhone": "010-5555-7788",
          "studentPhone": "",
          "className": "응시반",
          "teacher": "",
          "status": "재원",
          "regularEnrolled": false
        }
      ]
    }
  ]
}
```

- **지금 응시반인 재원생만**, 학생·학부모 번호 어느 쪽이든 뒤 4자리가 맞으면 후보입니다(이름순).
  정규 반 재원생은 나오지 않습니다 — 그 학생은 수험번호로 찾습니다.
- 물어본 번호는 모두 들어 있고, 없으면 `students` 가 빈 배열입니다. 형제가 같은 날 시험을 보면
  후보가 둘 이상이고, OMR 리포트 화면에서 고릅니다.
- `reportKey` 는 OMR 리포트가 이 학생을 다시 가리킬 열쇠입니다 — 카드번호가 있으면 그것, 없으면
  `sc<학생ID>`. 수험번호 조회(`/lookup`)에 이 값을 그대로 보내면 같은 학생이 다시 나옵니다
  (`examNumber` 자리에 요청값이 그대로 돌아옵니다). OMR 리포트는 이 열쇠를 성적표의 `student_key`
  로 씁니다.
- 수험번호 조회 응답에도 `reportKey` · `schoolLevel` · `regularEnrolled`(정규 반 등록 여부) 가 함께 옵니다.
- 인증·권한·감사 기록은 수험번호 조회와 같습니다.

---

## 6. 시험 기록 보내기 (Student-Card v1.107.0 이상) — 학생 카드의 테스트 탭

OMR 리포트가 **성적표를 만들 때마다** 그 기록을 Student-Card 로 보내고, Student-Card 는 학생 카드의 **테스트** 탭에
최신 시험부터 보여 준다. 줄을 누르면 성적표(`/r/<token>`)가 새 창에 열린다 — 직원이 OMR 리포트에 로그인해 있으면 PIN 없이.
OMR 쪽 구현은 `lib/student-card-exams.ts`, 환경변수는 학생 정보 연동과 같다(`STUDENT_API_URL` · `STUDENT_API_KEY`).

```
POST /api/exams
Header: x-api-key: <API_KEY>
Content-Type: application/json
```

### 요청

```json
{ "exams": [
  { "studentKey": "72111",            // 성적표의 student_key — 수험번호(카드번호) 또는 sc<학생ID>
    "reportId": "a1b2c3…",            // 성적표 id (student_reports.id) — 같은 값이 다시 오면 덮어쓴다
    "examId": "exam-uuid",            // (선택)
    "examTitle": "10월 월말평가",
    "examKind": "월말평가",            // 월말평가 · 반배치고사 · 국영수 모의고사 · 토요모의고사 · 인클래스 테스트
    "examDate": "2026-10-28",         // 응시일 — 없으면 만든 날
    "score": 88.4, "max": 100,        // 100점 환산 원점수 · 배점 (점수가 배점을 넘으면 배점은 보내지 않는다)
    "rank": 3, "rankTotal": 21,       // 석차 · 비교 집단 인원 (있을 때만)
    "reportUrl": "https://…/r/<token>",
    "isTest": false } ] }             // 시험용 시험(제목에 '테스트용' 등)이면 true — Student-Card 가 저장하지 않는다
```

- 한 번에 200건까지(`EXAM_SYNC_CHUNK`). `student_key` 가 없는 성적표(옛 모의고사 엑셀)는 보내지 않는다.

### 응답

```json
{ "ok": true, "results": [ { "reportId": "a1b2c3…", "matched": true, "saved": true, "studentId": 12, "created": true } ] }
```

- `matched:false` 는 열쇠로 학생을 못 찾은 것(`reason: "no-student"`) 또는 시험용(`reason: "test-exam"`) — 오류가 아니다.
- 모양이 틀리면 그 묶음 전체가 400 이다. 열쇠 없이는 403, 틀리면 401.

### 언제 보내나

| 때 | OMR 쪽 |
|---|---|
| 성적표 생성 · 갱신 (`POST /api/admin/omr/exams/[id]/reports`) | 새로 만든 것 + 갱신한 것을 보낸다 (응답의 `studentCard` 에 결과) |
| 링크 중지 / 다시 켜기 / 새 링크 (`POST /api/admin/reports/[id]`) | 중지는 `DELETE /api/exams/<reportId>`, 켜기 · 새 링크는 다시 보낸다 |
| 성적표 삭제 · 묶음 삭제 · 여러 건 삭제 | `DELETE /api/exams/<reportId>` |
| 설정 → 학생 정보 연동 → **[시험 기록 전체 보내기]** (관리자) | 살아 있는 성적표 전부 — 처음 연동할 때 지난 성적표를 채운다 |
| 매일 19:40 KST cron (`/api/cron/student-card-exams`) | 살아 있는 성적표 전부를 다시 보내 빠진 것을 메운다 |

실패해도 예외를 던지지 않는다 — 성적표 생성은 끝난 일이고, 못 보낸 것은 cron 이 메운다.
