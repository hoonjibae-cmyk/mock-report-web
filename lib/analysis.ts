import { EXAM_DATA, getSubjectDefinition, SUBJECT_KEYS } from "@/lib/exams";
import type {
  AIReview,
  CategoryStat,
  ItemResult,
  RawStudentSubject,
  StudentBundle,
  StudentReportData,
  SubjectKey,
  SubjectReport,
} from "@/lib/types";
import { buildSummerRoadmapHint, parentFriendlyLabel } from "@/lib/learning-roadmap";
import {
  clamp,
  maskPhone,
  normalizeHeader,
  normalizePhone,
  round,
  studentMergeKey,
} from "@/lib/utils";

function bundleKey(raw: RawStudentSubject): string {
  return studentMergeKey(raw.studentName, raw.school, raw.parentPhone);
}

export function mergeStudents(rows: RawStudentSubject[]): StudentBundle[] {
  const bundles: StudentBundle[] = [];

  for (const raw of rows) {
    const exactKey = bundleKey(raw);
    let bundle = bundles.find((candidate) => candidate.key === exactKey);

    if (!bundle) {
      const sameName = bundles.filter(
        (candidate) => normalizeHeader(candidate.name) === normalizeHeader(raw.studentName),
      );
      if (sameName.length === 1) {
        const candidate = sameName[0];
        const samePhone =
          !candidate.parentPhone ||
          !raw.parentPhone ||
          normalizePhone(candidate.parentPhone).slice(-4) === normalizePhone(raw.parentPhone).slice(-4);
        const sameSchool =
          !candidate.school ||
          !raw.school ||
          normalizeHeader(candidate.school) === normalizeHeader(raw.school);
        if (samePhone && sameSchool) bundle = candidate;
      }
    }

    if (!bundle) {
      bundle = {
        key: exactKey,
        name: raw.studentName,
        school: raw.school,
        grade: raw.grade || "3",
        parentPhone: raw.parentPhone,
        subjects: {},
      };
      bundles.push(bundle);
    }

    bundle.name = bundle.name || raw.studentName;
    bundle.school = bundle.school || raw.school;
    bundle.grade = bundle.grade || raw.grade;
    bundle.parentPhone = bundle.parentPhone || raw.parentPhone;

    const existing = bundle.subjects[raw.subject];
    if (!existing) {
      bundle.subjects[raw.subject] = raw;
    } else {
      const existingAnswers = existing.itemCorrectness.filter((value) => value !== null).length;
      const incomingAnswers = raw.itemCorrectness.filter((value) => value !== null).length;
      if (incomingAnswers >= existingAnswers) bundle.subjects[raw.subject] = raw;
    }
  }

  return bundles.sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

export function getGrade(subject: SubjectKey, score: number): number {
  const cuts = [...getSubjectDefinition(subject).gradeCuts].sort((a, b) => b.minScore - a.minScore);
  return cuts.find((cut) => score >= cut.minScore)?.grade ?? 9;
}

export function estimateNationalTopPercent(subject: SubjectKey, score: number): number {
  const anchors = [...getSubjectDefinition(subject).percentileAnchors].sort((a, b) => b.score - a.score);
  const bounded = clamp(score, 0, 100);

  for (let index = 0; index < anchors.length - 1; index += 1) {
    const upper = anchors[index];
    const lower = anchors[index + 1];
    if (bounded <= upper.score && bounded >= lower.score) {
      if (upper.score === lower.score) return round(upper.topPercent, 1);
      const ratio = (upper.score - bounded) / (upper.score - lower.score);
      return round(upper.topPercent + ratio * (lower.topPercent - upper.topPercent), 1);
    }
  }

  return bounded >= 100 ? 0.1 : 100;
}

function categoryStats(items: ItemResult[], key: keyof Pick<ItemResult, "behavior" | "area" | "content" | "difficulty" | "gradeLevel">): CategoryStat[] {
  const groups = new Map<string, ItemResult[]>();
  for (const item of items) {
    const name = String(item[key]);
    groups.set(name, [...(groups.get(name) ?? []), item]);
  }

  return [...groups.entries()]
    .map(([name, groupItems]) => {
      const possible = groupItems.reduce((sum, item) => sum + item.points, 0);
      const earned = groupItems.reduce((sum, item) => sum + item.earnedPoints, 0);
      const correctCount = groupItems.filter((item) => item.isCorrect === true).length;
      return {
        name,
        earned,
        possible,
        rate: possible > 0 ? round((earned / possible) * 100, 1) : 0,
        correctCount,
        itemCount: groupItems.length,
      };
    })
    .sort((a, b) => b.possible - a.possible || a.name.localeCompare(b.name, "ko"));
}

function buildBaseSubjectReport(raw: RawStudentSubject): SubjectReport {
  const definition = getSubjectDefinition(raw.subject);
  const items: ItemResult[] = definition.items.map((item, index) => {
    const isCorrect = raw.itemCorrectness[index] ?? null;
    return {
      ...item,
      isCorrect,
      studentAnswer: raw.rawAnswers[index] ?? null,
      earnedPoints: isCorrect === true ? item.points : 0,
    };
  });

  const answeredCount = items.filter((item) => item.isCorrect !== null).length;
  const computedScore = items.reduce((sum, item) => sum + item.earnedPoints, 0);
  const score = answeredCount > 0 ? computedScore : round(raw.providedScore ?? 0, 0);
  const correctCount = items.filter((item) => item.isCorrect === true).length;

  return {
    key: raw.subject,
    name: definition.name,
    examName: definition.examName,
    testDate: raw.testDate || definition.testDate,
    score,
    maxScore: definition.maxScore,
    correctCount,
    answeredCount,
    questionCount: definition.questionCount,
    grade: getGrade(raw.subject, score),
    nationalTopPercent: estimateNationalTopPercent(raw.subject, score),
    nationalAverage: definition.nationalAverage,
    academyAverage: 0,
    academyRank: 0,
    academyCount: 0,
    academyTopPercent: 0,
    behaviorStats: categoryStats(items, "behavior"),
    contentStats: categoryStats(items, "content"),
    areaStats: categoryStats(items, "area"),
    difficultyStats: categoryStats(items, "difficulty"),
    gradeLevelStats: categoryStats(items, "gradeLevel"),
    items,
    nationalDataLabel: definition.nationalDataLabel,
    nationalDataNote: definition.nationalDataNote,
  };
}

function strongestCategory(report: SubjectReport): CategoryStat | undefined {
  return [...report.contentStats]
    .filter((stat) => stat.possible >= 4)
    .sort((a, b) => b.rate - a.rate || b.possible - a.possible)[0];
}

function weakestCategory(report: SubjectReport): CategoryStat | undefined {
  return [...report.contentStats]
    .filter((stat) => stat.possible >= 4)
    .sort((a, b) => a.rate - b.rate || b.possible - a.possible)[0];
}

export function buildRuleReview(report: StudentReportData): AIReview {
  const subjects = SUBJECT_KEYS.map((key) => report.subjects[key]).filter(Boolean) as SubjectReport[];
  const best = [...subjects].sort((a, b) => a.nationalTopPercent - b.nationalTopPercent)[0];
  const focus = [...subjects].sort((a, b) => b.nationalTopPercent - a.nationalTopPercent)[0];
  const nationalSnapshot = subjects
    .map((subject) => `${subject.name} 전국 상위 약 ${round(subject.nationalTopPercent, 1)}%(${subject.grade}등급)`)
    .join(", ");
  const strengths: string[] = [];
  const priorities: string[] = [];

  for (const subject of subjects) {
    const strong = strongestCategory(subject);
    const weak = weakestCategory(subject);
    if (strong && strong.rate >= 70) {
      strengths.push(`${subject.name} ‘${parentFriendlyLabel(subject.key, strong.name)}’ ${strong.rate}%`);
    }
    if (weak && weak.rate < 70) {
      priorities.push(`${subject.name} ‘${parentFriendlyLabel(subject.key, weak.name)}’ ${weak.rate}%`);
    }
  }

  const actionPlan = subjects.map((subject) => buildSummerRoadmapHint(subject)).slice(0, 3);

  return {
    headline: best
      ? `전국 기준으로 ${best.name}이 상대적으로 안정적이며, ${focus?.name ?? best.name}의 기반을 보완하면 좋겠습니다.`
      : "전국 기준의 문항별 응답 데이터를 바탕으로 학습 방향을 점검해 주세요.",
    overview: subjects.length
      ? `전국 상위 추정치는 ${nationalSnapshot}입니다. 이는 공개된 전국 점수 분포를 활용한 참고값이며, 이번 여름방학에는 전국 시험에서 확인된 과목별 강점은 유지하고 취약한 기본 개념과 정확한 문제 이해를 보완하는 것이 좋습니다.`
      : "분석 가능한 과목 데이터가 없습니다.",
    strengths: strengths.slice(0, 3).length ? strengths.slice(0, 3) : ["응시 데이터를 바탕으로 안정적인 영역을 계속 확인해 나가겠습니다."],
    priorities: priorities.slice(0, 3).length ? priorities.slice(0, 3) : ["큰 취약 영역보다 문항별 실수 원인과 개념의 빈틈을 점검하는 단계입니다."],
    actionPlan: actionPlan.length ? actionPlan : ["여름방학 동안 중3 핵심 개념을 점검한 뒤 고등 과정으로 연결하는 순서가 필요합니다.", "문제 수를 늘리기보다 틀린 이유와 풀이 근거를 설명할 수 있는 수준의 이해를 목표로 합니다."],
    parentNote: "과도한 선행보다 현재 학년의 핵심 개념을 정확히 완성하고, 그 기반 위에서 고등 과정으로 연결하겠습니다.",
    source: "rule",
    generatedAt: new Date().toISOString(),
  };
}

export function analyzeCohort(bundles: StudentBundle[], reportTitle: string, examLabel: string): StudentReportData[] {
  const drafts = bundles.map((bundle) => {
    const subjects: StudentReportData["subjects"] = {};
    for (const key of SUBJECT_KEYS) {
      const raw = bundle.subjects[key];
      if (raw) subjects[key] = buildBaseSubjectReport(raw);
    }

    const subjectReports = SUBJECT_KEYS.map((key) => subjects[key]).filter(Boolean) as SubjectReport[];
    const averageScore = subjectReports.length
      ? round(subjectReports.reduce((sum, subject) => sum + subject.score, 0) / subjectReports.length, 1)
      : 0;
    const sorted = [...subjectReports].sort((a, b) => b.score - a.score);

    const initial: StudentReportData = {
      schemaVersion: 1,
      student: {
        name: bundle.name,
        school: bundle.school,
        grade: bundle.grade || "3",
        phoneMasked: maskPhone(bundle.parentPhone),
      },
      reportTitle,
      examLabel,
      generatedAt: new Date().toISOString(),
      subjects,
      overall: {
        averageScore,
        completedSubjects: subjectReports.length,
        bestSubject: sorted[0]?.name,
        focusSubject: sorted.at(-1)?.name,
      },
      aiReview: {
        headline: "분석 중입니다.", overview: "", strengths: [], priorities: [], actionPlan: [], parentNote: "", source: "rule", generatedAt: new Date().toISOString(),
      },
      notices: [
        EXAM_DATA.classificationNote,
        ...Array.from(new Set(Object.values(bundle.subjects).flatMap((subject) => subject?.warnings ?? []))),
      ],
    };
    initial.aiReview = buildRuleReview(initial);
    return initial;
  });

  for (const subjectKey of SUBJECT_KEYS) {
    const participants = drafts
      .map((draft) => draft.subjects[subjectKey])
      .filter(Boolean) as SubjectReport[];
    if (participants.length === 0) continue;

    const academyAverage = round(
      participants.reduce((sum, participant) => sum + participant.score, 0) / participants.length,
      1,
    );
    const itemRates = getSubjectDefinition(subjectKey).items.map((item) => {
      const results = participants
        .map((participant) => participant.items[item.number - 1]?.isCorrect)
        .filter((value) => value !== null && value !== undefined) as boolean[];
      return results.length ? round((results.filter(Boolean).length / results.length) * 100, 1) : 0;
    });

    for (const participant of participants) {
      participant.academyAverage = academyAverage;
      participant.academyCount = participants.length;
      participant.academyRank = 1 + participants.filter((other) => other.score > participant.score).length;
      participant.academyTopPercent = round((participant.academyRank / participants.length) * 100, 1);
      participant.items = participant.items.map((item) => ({
        ...item,
        cohortCorrectRate: itemRates[item.number - 1],
      }));
    }
  }

  return drafts;
}
