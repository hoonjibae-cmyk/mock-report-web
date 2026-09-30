/**
 * 반 인원 대 응시 인원 — 월말평가 검수용.
 *
 * 성적표는 시험을 본 학생에게만 있다. 그래서 "이 반에서 아예 안 본 학생이
 * 있나"는 성적표만 봐서는 알 수 없고, 학생 관리 프로그램의 반 명단과 맞춰
 * 봐야 한다. 이 파일은 그 맞춰 보는 규칙만 있다 — 명단을 어디서 가져오는지는
 * student-directory 가, 화면에 어떻게 보이는지는 ReviewPanel 이 안다.
 *
 * 어느 반을 볼지는 담임이 시험을 만들 때 고른 반이 정한다(exam.classNames).
 * 그 전에 만든 시험은 성적표에 적힌 반으로 물러난다.
 *
 * 맞추는 열쇠는 카드번호(= OMR 수험번호)다. 이름은 동명이인(김민수·김민수B)과
 * 띄어쓰기 차이가 있어, 어느 한쪽에 카드번호가 없을 때만 이름으로 물러난다.
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
}

export interface AttendanceSummary {
  /** 반마다 한 줄 — 명단을 못 가져온 반은 빠진다 */
  classes: ClassAttendance[];
  /** 성적표는 있는데 어느 반 명단에도 없는 학생(전반·퇴원·이름 불일치) — 이름순 */
  unlisted: string[];
}

function nameKey(name: string | null | undefined): string {
  return String(name ?? "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

/** 응시자들이 속한 반 이름(빈 값 제외, 중복 제거) */
export function classNamesOf(takers: readonly ExamTaker[]): string[] {
  return [...new Set(takers.map((t) => t.className.trim()).filter(Boolean))];
}

/**
 * 검수에서 명단을 맞춰 볼 반.
 *
 * 담임이 시험을 만들 때 고른 반이 있으면 그것이 기준이다 — 그 반에서 누가 안
 * 봤는지가 질문이므로. 고른 반이 없는 예전 시험은 성적표에 적힌 반으로 본다.
 */
export function reviewClassNames(examClassNames: readonly string[], takers: readonly ExamTaker[]): string[] {
  const chosen = [...new Set(examClassNames.map((n) => n.trim()).filter(Boolean))];
  return chosen.length > 0 ? chosen : classNamesOf(takers);
}

/**
 * 반마다 명단과 응시자를 맞춰 본다.
 *
 * 응시자는 반 구분 없이 한 묶음으로 본다 — 성적표에 적힌 반이 명단의 반 이름과
 * 조금 달라도(띄어쓰기, 반 이동) 카드번호가 같으면 같은 사람이다.
 *
 * `rosters` 에 없는 반(명단을 못 가져온 반)은 결과에서 빠진다 — 모르는 것을
 * '전원 응시'로 보이게 하면 안 되므로, 부르는 쪽이 따로 안내한다.
 */
export function attendanceSummary(
  takers: readonly ExamTaker[],
  rosters: ReadonlyMap<string, readonly RosterStudent[]>,
  classNames: readonly string[] = classNamesOf(takers),
): AttendanceSummary {
  const byKey = new Map<string, number[]>();
  const byName = new Map<string, number[]>();
  const byNameNoKey = new Map<string, number[]>();
  takers.forEach((t, i) => {
    const key = (t.studentKey ?? "").trim();
    const name = nameKey(t.studentName);
    if (key) byKey.set(key, [...(byKey.get(key) ?? []), i]);
    else byNameNoKey.set(name, [...(byNameNoKey.get(name) ?? []), i]);
    byName.set(name, [...(byName.get(name) ?? []), i]);
  });

  const matched = new Set<number>();
  const classes: ClassAttendance[] = [];
  for (const className of [...new Set(classNames.map((n) => n.trim()).filter(Boolean))]) {
    const roster = rosters.get(className);
    if (!roster) continue;

    const absent: RosterStudent[] = [];
    for (const s of roster) {
      const key = s.examNumber.trim();
      const name = nameKey(s.name);
      // 카드번호가 있으면 카드번호로만. 어느 한쪽에 번호가 없을 때만 이름으로.
      const hits = key ? (byKey.get(key) ?? byNameNoKey.get(name) ?? []) : (byName.get(name) ?? []);
      if (hits.length > 0) {
        for (const i of hits) matched.add(i);
        continue;
      }
      absent.push({ examNumber: key, name: s.name });
    }
    absent.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    classes.push({ className, total: roster.length, present: roster.length - absent.length, absent });
  }

  const unlisted =
    classes.length === 0
      ? []
      : takers
          .map((t, i) => (matched.has(i) ? null : t.studentName))
          .filter((n): n is string => n !== null)
          .sort((a, b) => a.localeCompare(b, "ko"));

  classes.sort((a, b) => a.className.localeCompare(b.className, "ko"));
  return { classes, unlisted };
}
