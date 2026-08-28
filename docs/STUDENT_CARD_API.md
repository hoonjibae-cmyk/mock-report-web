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
