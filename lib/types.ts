export type SubjectKey = "korean" | "math" | "english";

export type AnswerType = "choice" | "number";

export interface ExamItemDefinition {
  number: number;
  answer: number;
  points: number;
  answerType: AnswerType;
  behavior: string;
  area: string;
  content: string;
  detail: string;
  difficulty: "기본" | "보통" | "응용" | "고난도";
  gradeLevel: "중3" | "중3~고1" | "고1" | "고1 심화";
}

export interface GradeCut {
  grade: number;
  minScore: number;
  topPercent: number;
}

export interface PercentileAnchor {
  score: number;
  topPercent: number;
}

export interface SubjectDefinition {
  key: SubjectKey;
  name: string;
  sheetNames: string[];
  examName: string;
  testDate: string;
  organizer: string;
  questionCount: number;
  maxScore: number;
  nationalAverage: number;
  nationalDataLabel: string;
  nationalDataNote: string;
  gradeCuts: GradeCut[];
  percentileAnchors: PercentileAnchor[];
  items: ExamItemDefinition[];
}

export interface ExamData {
  version: string;
  classificationNote: string;
  subjects: Record<SubjectKey, SubjectDefinition>;
}

export interface RawStudentSubject {
  subject: SubjectKey;
  studentName: string;
  school: string;
  grade: string;
  parentPhone: string;
  testDate: string;
  providedScore?: number;
  itemCorrectness: Array<boolean | null>;
  rawAnswers: Array<string | number | null>;
  warnings: string[];
}

export interface ParsedWorkbookResult {
  students: RawStudentSubject[];
  foundSubjects: SubjectKey[];
  warnings: string[];
}

export interface ItemResult extends ExamItemDefinition {
  isCorrect: boolean | null;
  studentAnswer: string | number | null;
  earnedPoints: number;
  cohortCorrectRate?: number;
}

export interface CategoryStat {
  name: string;
  earned: number;
  possible: number;
  rate: number;
  correctCount: number;
  itemCount: number;
}

export interface SubjectReport {
  key: SubjectKey;
  name: string;
  examName: string;
  testDate: string;
  score: number;
  maxScore: number;
  correctCount: number;
  answeredCount: number;
  questionCount: number;
  grade: number;
  nationalTopPercent: number;
  nationalAverage: number;
  academyAverage: number;
  academyRank: number;
  academyCount: number;
  academyTopPercent: number;
  behaviorStats: CategoryStat[];
  contentStats: CategoryStat[];
  areaStats: CategoryStat[];
  difficultyStats: CategoryStat[];
  gradeLevelStats: CategoryStat[];
  items: ItemResult[];
  nationalDataLabel: string;
  nationalDataNote: string;
}

export interface AIReview {
  headline: string;
  overview: string;
  strengths: string[];
  priorities: string[];
  actionPlan: string[];
  parentNote: string;
  source: "ai" | "rule";
  model?: string;
  generatedAt: string;
}

export interface StudentReportData {
  schemaVersion: 1;
  student: {
    name: string;
    school: string;
    grade: string;
    phoneMasked: string;
  };
  reportTitle: string;
  examLabel: string;
  generatedAt: string;
  subjects: Partial<Record<SubjectKey, SubjectReport>>;
  overall: {
    averageScore: number;
    completedSubjects: number;
    bestSubject?: string;
    focusSubject?: string;
  };
  aiReview: AIReview;
  notices: string[];
}

export interface GeneratedReportLink {
  id: string;
  studentName: string;
  school: string;
  token: string;
  url: string;
  active: boolean;
  pinRequired: boolean;
  createdAt: string;
}

export interface StudentIdentity {
  key: string;
  name: string;
  school: string;
  grade: string;
  parentPhone: string;
}

export interface StudentBundle extends StudentIdentity {
  subjects: Partial<Record<SubjectKey, RawStudentSubject>>;
}

export interface ReportDbRow {
  id: string;
  batch_id: string;
  public_token: string;
  student_name: string;
  school: string | null;
  grade: string | null;
  parent_phone_masked: string | null;
  access_pin_hash: string | null;
  pin_required: boolean;
  is_active: boolean;
  report_data: StudentReportData;
  ai_summary: AIReview | null;
  view_count: number;
  last_viewed_at: string | null;
  created_at: string;
  updated_at: string;
}
