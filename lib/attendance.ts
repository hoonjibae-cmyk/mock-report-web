/**
 * 반 인원 대 응시 인원 — 월말평가 검수용.
 *
 * 성적표는 시험을 본 학생에게만 있다. 그래서 "이 반에서 아예 안 본 학생이
 * 있나"는 성적표만 봐서는 알 수 없고, 학생 관리 프로그램의 반 명단과 맞춰
 * 봐야 한다. 이 파일은 그 맞춰 보는 규칙만 있다 — 명단을 어디서 가져오는지는
 * student-directory 가, 화면에 어떻게 보이는지는 ReviewPanel 이 안다.
 *
 * 맞추는 열쇠는 카드번호(= OMR 수험번호)다. 이름은 동명이인(김민수·김민수B)과
 * 띄어쓰기 차이가 있어 카드번호가 없을 때만 이름으로 물러난다.
 */

export interface RosterStudent {
  /** 카드번호 = OMR 수험번호. 없을 수 있다 */
  examNumber: string;
  name: string;
}

export interface ExamTaker {
  studentKey: string | null;
  studentName: string;
  className: string;
}

export interface ClassAttendance {
  className: string;
  /** 학생 관리 프로그램 기준 재원생 수 */
  total: number;
  /** 그중 이 시험 성적표가 있는 학생 수 */
  present: number;
  /** 성적표가 없는 재원생 — 이름순 */
  absent: RosterStudent[];
  /** 성적표는 있는데 반 명단에 없는 학생(전반·퇴원·이름 불일치) — 이름순 */
  unlisted: string[];
}

function nameKey(name: string | null | undefined): string {
  return String(name ?? "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

/**
 * 반마다 명단과 응시자를 맞춰 본다.
 *
 * `rosters` 에 없는 반(명단을 못 가져온 반)은 결과에서 빠진다 — 모르는 것을
 * '전원 응시'로 보이게 하면 안 되므로, 부르는 쪽이 따로 안내한다.
 */
export function attendanceByClass(
  takers: readonly ExamTaker[],
  rosters: ReadonlyMap<string, readonly RosterStudent[]>,
): ClassAttendance[] {
  const byClass = new Map<string, ExamTaker[]>();
  for (const t of takers) {
    const cls = t.className.trim();
    if (!cls) continue;
    const list = byClass.get(cls) ?? [];
    list.push(t);
    byClass.set(cls, list);
  }

  const out: ClassAttendance[] = [];
  for (const [className, list] of byClass) {
    const roster = rosters.get(className);
    if (!roster) continue;

    const takerKeys = new Set(list.map((t) => (t.studentKey ?? "").trim()).filter(Boolean));
    const takerNames = new Set(list.map((t) => nameKey(t.studentName)));

    const absent: RosterStudent[] = [];
    const matchedKeys = new Set<string>();
    const matchedNames = new Set<string>();
    for (const s of roster) {
      const key = s.examNumber.trim();
      if (key && takerKeys.has(key)) {
        matchedKeys.add(key);
        matchedNames.add(nameKey(s.name));
        continue;
      }
      if (!key && takerNames.has(nameKey(s.name))) {
        matchedNames.add(nameKey(s.name));
        continue;
      }
      absent.push({ examNumber: key, name: s.name });
    }

    const unlisted = list
      .filter((t) => {
        const key = (t.studentKey ?? "").trim();
        if (key && matchedKeys.has(key)) return false;
        return !matchedNames.has(nameKey(t.studentName));
      })
      .map((t) => t.studentName);

    absent.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    unlisted.sort((a, b) => a.localeCompare(b, "ko"));
    out.push({
      className,
      total: roster.length,
      present: roster.length - absent.length,
      absent,
      unlisted,
    });
  }
  return out.sort((a, b) => a.className.localeCompare(b.className, "ko"));
}

/** 응시자들이 속한 반 이름(빈 값 제외, 중복 제거) */
export function classNamesOf(takers: readonly ExamTaker[]): string[] {
  return [...new Set(takers.map((t) => t.className.trim()).filter(Boolean))];
}
