import rawExamData from "@/data/exams.json";
import type { ExamData, SubjectDefinition, SubjectKey } from "@/lib/types";

export const EXAM_DATA = rawExamData as unknown as ExamData;
export const SUBJECT_KEYS: SubjectKey[] = ["korean", "math", "english"];

export function getSubjectDefinition(key: SubjectKey): SubjectDefinition {
  return EXAM_DATA.subjects[key];
}

export function matchSubjectBySheetName(sheetName: string): SubjectKey | null {
  const normalized = sheetName.replace(/\s+/g, "").toLowerCase();
  for (const key of SUBJECT_KEYS) {
    const definition = getSubjectDefinition(key);
    if (
      definition.sheetNames.some(
        (candidate) => candidate.replace(/\s+/g, "").toLowerCase() === normalized,
      )
    ) {
      return key;
    }
  }
  return null;
}
