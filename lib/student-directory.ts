// 학생 기본정보 연동 — 학생 관리 프로그램(Student-Card)에서 수험번호로 불러온다.
//
// OMR 답안지가 읽을 수 있는 학생 정보는 '수험번호' 하나뿐이다. 이름·학교·학년·
// 학부모 연락처는 이 시스템에 두지 않고, 학생 관리 프로그램을 단일 출처로 삼아
// 성적표를 만들 때 가져온다.
//
//   OMR 리포트의 '수험번호'  =  Student-Card의 '카드번호'(students.card_no)
//
// 환경변수
//   STUDENT_API_URL  학생 관리 프로그램 주소 (예: https://student-card.vercel.app)
//   STUDENT_API_KEY  Student-Card의 API_KEY 와 같은 값 (헤더 x-api-key)
//
// 규약은 docs/STUDENT_CARD_API.md 참고. 아직 상대 쪽 엔드포인트가 없으면
// '연동 안 됨'으로 조용히 넘어가고, 지금처럼 이름을 직접 입력하면 된다.

export interface DirectoryStudent {
  /** 조회에 쓴 수험번호(= Student-Card 카드번호) */
  examNumber: string;
  name: string;
  school: string;
  /** 학년(숫자 또는 '중3' 같은 표기) */
  grade: string;
  /** 학부모 연락처 — 성적표 PIN(뒤 4자리)에 쓴다 */
  parentPhone: string;
  className: string;
  teacher: string;
  /** 재원 / 휴원 / 퇴원 등 */
  status: string;
}

export interface LookupResult {
  configured: boolean;
  students: Map<string, DirectoryStudent>;
  /** 조회했지만 학생 관리 프로그램에 없던 수험번호 */
  missing: string[];
  /** 연동 자체가 실패한 경우의 안내 문구 */
  error?: string;
}

export function directoryConfigured(): boolean {
  return Boolean(process.env.STUDENT_API_URL);
}

function base(): string {
  return (process.env.STUDENT_API_URL ?? "").replace(/\/$/, "");
}

/** 학생 관리 프로그램이 돌려준 한 건을 우리 모양으로 정규화 */
function normalize(raw: Record<string, unknown>, requested: string): DirectoryStudent {
  const pick = (...keys: string[]): string => {
    for (const key of keys) {
      const value = raw[key];
      if (value !== null && value !== undefined && String(value).trim() !== "") {
        return String(value).trim();
      }
    }
    return "";
  };
  return {
    examNumber: pick("examNumber", "exam_number", "cardNo", "card_no", "studentKey", "student_key") || requested,
    name: pick("name", "studentName", "student_name"),
    school: pick("school", "schoolName", "school_name"),
    grade: pick("grade", "schoolLevel", "school_level"),
    parentPhone: pick("parentPhone", "parent_phone", "parentHp1", "parent_hp1", "phone"),
    className: pick("className", "class_name"),
    teacher: pick("teacher"),
    status: pick("status"),
  };
}

/**
 * 수험번호 여러 개를 한 번에 조회한다.
 * 연동이 설정되지 않았거나 상대 쪽이 응답하지 않아도 예외를 던지지 않는다 —
 * 성적표 생성은 이름을 직접 입력해서도 진행할 수 있어야 하기 때문이다.
 */
export async function lookupStudents(examNumbers: string[]): Promise<LookupResult> {
  const keys = [...new Set(examNumbers.map((n) => String(n ?? "").trim()).filter(Boolean))];
  const empty: LookupResult = { configured: directoryConfigured(), students: new Map(), missing: keys };
  if (!empty.configured || keys.length === 0) return empty;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const key = process.env.STUDENT_API_KEY;
  if (key) headers["x-api-key"] = key;

  try {
    const res = await fetch(`${base()}/api/students/lookup`, {
      method: "POST",
      headers,
      body: JSON.stringify({ examNumbers: keys }),
      // 성적표 생성 흐름을 오래 막지 않는다
      signal: AbortSignal.timeout(10_000),
    });

    if (res.status === 401 || res.status === 403) {
      return { ...empty, error: "학생 관리 프로그램이 인증을 거부했습니다. STUDENT_API_KEY가 상대 쪽 API_KEY와 같은지 확인해 주세요." };
    }
    if (res.status === 404) {
      return { ...empty, error: "학생 관리 프로그램에 조회 API(/api/students/lookup)가 아직 없습니다. docs/STUDENT_CARD_API.md 규약대로 추가해 주세요." };
    }
    if (!res.ok) {
      return { ...empty, error: `학생 정보를 불러오지 못했습니다(${res.status}).` };
    }

    const data = (await res.json()) as { students?: unknown };
    const list = Array.isArray(data.students) ? data.students : [];
    const students = new Map<string, DirectoryStudent>();
    for (const raw of list) {
      if (!raw || typeof raw !== "object") continue;
      const record = raw as Record<string, unknown>;
      // 요청한 수험번호 중 어느 것에 대한 답인지 찾는다
      const candidates = [
        record.examNumber, record.exam_number, record.cardNo, record.card_no,
        record.studentNo, record.student_no, record.studentKey, record.student_key,
      ].map((v) => String(v ?? "").trim());
      const matched = keys.find((k) => candidates.includes(k));
      if (!matched) continue;
      students.set(matched, normalize(record, matched));
    }
    return {
      configured: true,
      students,
      missing: keys.filter((k) => !students.has(k)),
    };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return {
      ...empty,
      error: timedOut
        ? "학생 관리 프로그램이 제때 응답하지 않았습니다(10초). 잠시 후 다시 시도해 주세요."
        : "학생 관리 프로그램에 연결하지 못했습니다. STUDENT_API_URL 주소를 확인해 주세요.",
    };
  }
}

/** 설정 화면의 연결 확인용 — 상대 쪽이 살아 있는지만 본다 */
export async function pingDirectory(): Promise<{ ok: boolean; message: string }> {
  if (!directoryConfigured()) {
    return { ok: false, message: "STUDENT_API_URL이 설정되어 있지 않습니다." };
  }
  const result = await lookupStudents(["__ping__"]);
  if (result.error) return { ok: false, message: result.error };
  return { ok: true, message: `연결됨 — ${base()}` };
}
