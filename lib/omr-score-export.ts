// 채점 결과를 엑셀 한 장으로 — 학생명 · 총점수 · 영역별 점수
//
// 왜 성적표에서 뽑는가
// -------------------
// 답안지에서 읽히는 학생 정보는 수험번호 하나뿐이고, 이름은 성적표를 만들 때
// 사람이 넣는다. 그래서 이 표는 스캔이 아니라 **만들어진 성적표**에서 뽑는다.
// 덕분에 여기 적힌 점수는 학부모에게 나간 성적표의 점수와 언제나 같다.
//
// 왜 영역 열을 고정하지 않는가
// --------------------------
// 토요모의고사는 듣기·독해 둘로 나뉘지만, 어법을 따로 세는 시험도 있고 아직
// 영역을 안 적어 둔 시험도 있다. 열을 '듣기·독해'로 못 박으면 어법 점수는
// 조용히 사라지고 총점과 영역 합이 어긋난다 — 표를 받은 사람은 그걸
// 알아채지 못한다. 그래서 그 시험에 실제로 적혀 있는 영역을 그대로 열로
// 삼는다. 듣기·독해만 쓴 시험에서는 결과가 정확히 `학생명·총점수·듣기점수·
// 독해점수` 네 칸이 된다.

import type { GenericReportData } from "@/lib/omr-report-types";

/** 엑셀 셀 — 숫자·문자, 빈칸은 null */
export type ScoreCell = string | number | null;

/** 성적표 한 건 (엑셀로 옮길 재료) */
export interface ScoreSource {
  /** 수험번호 — 같은 학생의 재생성분을 걸러내는 기준 */
  studentKey: string;
  name: string;
  /** ISO 시각. 같은 학생이 여럿이면 이 값이 늦은 쪽만 남긴다 */
  createdAt: string;
  data: GenericReportData;
}

/**
 * 열로 쓸 영역을 문항 순서대로 뽑는다.
 *
 * 성적표 안의 `areas`는 **성취율이 낮은 순**으로 정렬돼 있다(약한 곳부터
 * 보여 주려고). 학생마다 순서가 다르므로 열 순서로 쓸 수 없다. 대신 각
 * 영역이 처음 나오는 문항 번호로 줄을 세운다 — 듣기(1번부터)가 앞, 독해가
 * 뒤로 와서 시험지를 넘기는 순서와 같아진다.
 */
export function orderedAreas(reports: readonly ScoreSource[]): string[] {
  const firstQuestion = new Map<string, number>();
  for (const report of reports) {
    for (const item of report.data.items ?? []) {
      const area = (item.area ?? "").trim();
      if (!area) continue;
      const seen = firstQuestion.get(area);
      if (seen === undefined || item.no < seen) firstQuestion.set(area, item.no);
    }
  }
  return [...firstQuestion.entries()]
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0], "ko"))
    .map(([area]) => area);
}

/**
 * 같은 학생의 성적표가 여럿이면 마지막에 만든 것만 남긴다.
 *
 * 성적표는 다시 만들 수 있고, 그때마다 행이 새로 쌓인다. 거르지 않으면 한
 * 학생이 표에 두 번 나오고 인원수부터 틀린다. 수험번호가 비어 있는 성적표는
 * 서로 구분할 방법이 없으므로 묶지 않고 각각 남긴다.
 */
export function latestPerStudent(reports: readonly ScoreSource[]): ScoreSource[] {
  const kept = new Map<string, ScoreSource>();
  const unkeyed: ScoreSource[] = [];
  for (const report of reports) {
    const key = report.studentKey.trim();
    if (!key) {
      unkeyed.push(report);
      continue;
    }
    const prev = kept.get(key);
    if (!prev || prev.createdAt <= report.createdAt) kept.set(key, report);
  }
  return [...kept.values(), ...unkeyed];
}

/** 이 성적표에서 해당 영역의 득점 (그 영역이 없으면 null — 0점과 구분한다) */
function areaScore(data: GenericReportData, area: string): number | null {
  const stat = (data.areas ?? []).find((entry) => entry.area === area);
  return stat ? stat.earned : null;
}

/**
 * 성적 엑셀의 내용을 만든다 — 첫 줄이 머리글, 나머지가 학생별 한 줄.
 *
 * 붙여 넣어 바로 쓰는 표라 안내 문구는 넣지 않는다. 이름 가나다순으로 정렬해
 * 명단에서 학생을 찾기 쉽게 한다(점수순이 필요하면 엑셀에서 정렬하면 된다).
 */
export function buildScoreSheet(reports: readonly ScoreSource[]): ScoreCell[][] {
  const students = latestPerStudent(reports).sort((a, b) =>
    a.name.localeCompare(b.name, "ko"),
  );
  const areas = orderedAreas(students);

  const header: ScoreCell[] = ["학생명", "총점수", ...areas.map((area) => `${area}점수`)];
  const rows: ScoreCell[][] = [header];

  for (const student of students) {
    rows.push([
      student.name,
      student.data.score.raw,
      ...areas.map((area) => areaScore(student.data, area)),
    ]);
  }

  return rows;
}
