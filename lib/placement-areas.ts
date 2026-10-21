// 반배치고사 영역의 표시 순서 — 성적표 화면과 슬랙 성적 요약이 같은 순서를 쓴다.
//
// 반배치고사의 영역은 '독해-하', '문법 중', '서술형'처럼 과목과 난이도(하·중·상)로
// 나뉜다. 성취율 순으로 늘어놓으면 독해-하 다음에 문법-상이 오는 식으로 뒤섞여
// 읽기 어렵다. 과목별로 모으고 그 안에서 하 → 중 → 상으로 올라가게 둔다.
// 서버 전용 모듈(그림 그리기)과 떨어뜨려 두어 화면 묶음에도 들어갈 수 있다.

import type { GenericReportData } from "@/lib/omr-report-types";

export type PlacementArea = GenericReportData["areas"][number];

/** 과목 순서 — 여기 없는 과목(듣기 등)은 뒤에 원래 순서대로 */
export const PLACEMENT_SUBJECTS = ["독해", "문법", "서술형", "어휘"];
/** 난이도 순서 — 쉬운 것부터 */
export const PLACEMENT_TIERS = ["하", "중", "상"];

/** '독해-하' · '문법 중' · '독해(상)' 같은 이름을 과목과 난이도로 가른다 */
export function areaParts(name: string): { subject: string; tier: string } {
  const match = name
    .normalize("NFKC")
    .trim()
    .match(/^(독해|문법|서술형|어휘)(?:\s*[-·ㆍ–—:/_(]?\s*([상중하])\s*[)]?)?$/);
  return { subject: match?.[1] ?? name.trim(), tier: match?.[2] ?? "" };
}

/** 과목별로 모아 하 → 중 → 상 순서로 — 원본 배열은 건드리지 않는다 */
export function orderedPlacementAreas<T extends { area: string }>(areas: T[]): T[] {
  const rank = (value: string, list: string[]) => {
    const i = list.indexOf(value);
    return i < 0 ? list.length : i;
  };
  return [...areas].sort((a, b) => {
    const x = areaParts(a.area);
    const y = areaParts(b.area);
    return (
      rank(x.subject, PLACEMENT_SUBJECTS) - rank(y.subject, PLACEMENT_SUBJECTS) ||
      (x.subject === y.subject ? rank(x.tier, PLACEMENT_TIERS) - rank(y.tier, PLACEMENT_TIERS) : 0)
    );
  });
}
