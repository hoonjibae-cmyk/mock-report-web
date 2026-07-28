import type { CategoryStat, ItemResult, SubjectKey, SubjectReport } from "@/lib/types";
import { round } from "@/lib/utils";

interface LabelRule {
  pattern: RegExp;
  label: string;
}

const LABEL_RULES: Record<SubjectKey, LabelRule[]> = {
  korean: [
    { pattern: /문법|중세 국어|발음|관형어|부정 표현|어휘/, label: "국어 문법의 기본 개념" },
    { pattern: /독서|과학|예술|인문|사회|문화론|휴리스틱|정보|비문학/, label: "비문학 독해와 정보 구조 파악" },
    { pattern: /문학|시가|소설|희곡|감상|시어|인물|사건/, label: "문학 작품 이해와 근거 중심 감상" },
    { pattern: /화법|발표|토론|말하기/, label: "말하기·듣기와 논리적 의사소통" },
    { pattern: /작문|글쓰기|기사문|고쳐쓰기|자료 활용/, label: "글쓰기와 자료 활용" },
  ],
  math: [
    { pattern: /닮음|내심|외심|원주각|삼각비|피타고라스|정다각형|정육각형|평행사변형|접선|호의 길이|회전체|종이접기|도형|기하/, label: "삼각형·도형의 성질과 공간 추론" },
    { pattern: /이차함수/, label: "이차함수의 개념과 그래프 해석" },
    { pattern: /일차함수|정비례|반비례|직선|함수/, label: "함수와 그래프 해석" },
    { pattern: /방정식|부등식|인수분해|다항식|문자와 식/, label: "식의 계산과 방정식·부등식 활용" },
    { pattern: /확률|분산|중앙값|산점도|상대도수|자료/, label: "자료 해석과 확률·통계" },
    { pattern: /제곱근|유리수|지수|수와 연산/, label: "수와 연산의 기초" },
  ],
  english: [
    { pattern: /어법|문법|언어 형식|문장 구조/, label: "문장 구조와 정확한 해석" },
    { pattern: /어휘|낱말|문맥상 어휘/, label: "핵심 어휘와 문맥 이해" },
    { pattern: /빈칸|함축|추론/, label: "문맥 추론과 논리적 독해" },
    { pattern: /순서|삽입|흐름|요약|구조/, label: "글의 구조와 논리 전개 파악" },
    { pattern: /목적|주장|주제|제목|요지|대의/, label: "글의 중심 내용 파악" },
    { pattern: /듣기|대화|담화|수치 정보|응답/, label: "듣기 핵심 정보 파악" },
    { pattern: /도표|안내문|세부 정보|내용 일치/, label: "세부 정보 확인과 정확한 독해" },
  ],
};

export function parentFriendlyLabel(subject: SubjectKey, value: string): string {
  const text = String(value ?? "").trim();
  if (!text) return "기초 개념과 문제 해결";
  const matched = LABEL_RULES[subject].find((rule) => rule.pattern.test(text));
  return matched?.label ?? text;
}

export function parentFriendlyStat(subject: SubjectKey, stat: CategoryStat): CategoryStat {
  return { ...stat, name: parentFriendlyLabel(subject, stat.name) };
}


export function aggregateFriendlyStats(subject: SubjectKey, stats: CategoryStat[]): CategoryStat[] {
  const groups = new Map<string, CategoryStat>();
  for (const stat of stats) {
    const name = parentFriendlyLabel(subject, stat.name);
    const current = groups.get(name) ?? { name, earned: 0, possible: 0, rate: 0, correctCount: 0, itemCount: 0 };
    current.earned += stat.earned;
    current.possible += stat.possible;
    current.correctCount += stat.correctCount;
    current.itemCount += stat.itemCount;
    groups.set(name, current);
  }
  return [...groups.values()].map((stat) => ({
    ...stat,
    rate: stat.possible > 0 ? round((stat.earned / stat.possible) * 100, 1) : 0,
  }));
}

export function parentFriendlyWrongItem(subject: SubjectKey, item: ItemResult) {
  return {
    number: item.number,
    topic: parentFriendlyLabel(subject, `${item.content} ${item.detail}`),
    difficulty: item.difficulty,
    gradeLevel: item.gradeLevel,
  };
}

function combinedRate(stats: CategoryStat[], names: string[]): number | null {
  const selected = stats.filter((stat) => names.some((name) => stat.name.includes(name)));
  const possible = selected.reduce((sum, stat) => sum + stat.possible, 0);
  if (!possible) return null;
  const earned = selected.reduce((sum, stat) => sum + stat.earned, 0);
  return round((earned / possible) * 100, 1);
}

function weakestFriendlyTopic(subject: SubjectReport): string {
  const weakest = [...subject.contentStats]
    .filter((stat) => stat.possible >= 4)
    .sort((a, b) => a.rate - b.rate || b.possible - a.possible)[0];
  return weakest ? parentFriendlyLabel(subject.key, weakest.name) : "핵심 개념";
}

export function buildSummerRoadmapHint(subject: SubjectReport): string {
  const weak = weakestFriendlyTopic(subject);
  const middleRate = combinedRate(subject.gradeLevelStats, ["중3", "중3~고1"]);

  if (subject.key === "math") {
    if (subject.score < 70 || (middleRate !== null && middleRate < 70)) {
      return `수학은 과도한 고등 선행보다 중3 핵심 개념을 먼저 안정시키는 것이 우선입니다. 이번 여름방학에는 특히 ${weak}을 개념 이해→대표 예제 확인→오답 원인 정리의 순서로 다시 점검하고, 그 기반이 확인된 뒤 고등 수학 개념으로 넘어가는 흐름이 적절합니다.`;
    }
    if (subject.score < 85) {
      return `수학은 중3 기본 개념을 유지하면서 ${weak}의 빈틈을 여름방학에 보완해야 합니다. 취약 영역을 정리한 뒤 고1 다항식과 함수 개념으로 연결하면 선행의 속도보다 이해의 완성도를 높일 수 있습니다.`;
    }
    return `수학은 중3 핵심 개념이 비교적 안정적입니다. 여름방학에는 ${weak}을 보완하면서 고1 과정의 식과 함수로 자연스럽게 연결하되, 빠른 진도보다 풀이 근거를 설명할 수 있는 수준의 이해를 목표로 하는 것이 좋습니다.`;
  }

  if (subject.key === "english") {
    if (subject.score < 70) {
      return `영어는 문제풀이 양을 늘리기보다 기본 어휘와 문장 구조를 다시 세우는 것이 우선입니다. 이번 여름방학에는 중등 필수 어휘와 중3~고1 수준 어휘를 빈틈없이 정리하고, 짧은 문장부터 정확하게 해석하는 연습을 충분히 한 뒤 독해 문제풀이로 넘어가는 것이 좋습니다. 특히 ${weak}을 중심으로 기본기를 보완해야 합니다.`;
    }
    if (subject.score < 85) {
      return `영어는 단순 문제풀이보다 어휘·구문·정확한 해석을 함께 다지는 단계입니다. 여름방학에는 중3~고1 필수 어휘를 재점검하고 문장 구조를 근거로 해석하는 연습을 강화한 뒤, ${weak} 유형의 독해로 확장하는 흐름이 적절합니다.`;
    }
    return `영어는 기본 독해력이 비교적 안정적입니다. 여름방학에는 어휘와 정확한 해석을 유지하면서 ${weak}처럼 논리적 판단이 필요한 유형을 중심으로 고1 독해로 확장하는 것이 좋습니다.`;
  }

  if (subject.score < 70) {
    return `국어는 많은 문제를 빠르게 푸는 것보다 지문에서 핵심 내용과 근거를 찾는 습관을 먼저 세우는 것이 중요합니다. 여름방학에는 ${weak}을 중심으로 문단별 핵심 정리와 선택지 근거 확인을 반복해 독해의 기본 틀을 안정시키는 것이 좋습니다.`;
  }
  if (subject.score < 85) {
    return `국어는 기본 독해력을 유지하면서 ${weak}의 빈틈을 여름방학에 보완해야 합니다. 지문 구조를 정리하고 정답과 오답의 근거를 설명하는 연습을 통해 고등 국어식 독해로 연결하는 것이 적절합니다.`;
  }
  return `국어는 전반적인 기반이 비교적 안정적입니다. 여름방학에는 ${weak}을 보완하면서 비문학의 정보 구조와 문학의 근거 중심 감상을 고등 수준으로 확장하는 것이 좋습니다.`;
}
