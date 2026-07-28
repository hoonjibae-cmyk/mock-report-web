import readXlsxFile from "read-excel-file/node";
import { getSubjectDefinition, matchSubjectBySheetName, SUBJECT_KEYS } from "@/lib/exams";
import type {
  ExamItemDefinition,
  ParsedWorkbookResult,
  RawStudentSubject,
  SubjectKey,
} from "@/lib/types";
import {
  normalizeHeader,
  normalizePhone,
  normalizeGradeValue,
  normalizeText,
  safeDateText,
} from "@/lib/utils";

const EXPLICIT_CORRECT = new Set(["○", "◯", "⭕", "O", "TRUE", "Y", "YES", "맞음", "정답", "정", "V"]);
const EXPLICIT_WRONG = new Set(["X", "Ｘ", "×", "✕", "✖", "❌", "FALSE", "N", "NO", "틀림", "오답", "오"]);

type CellValue = string | number | boolean | Date | null | undefined;
type QuestionMode = "correctness" | "answer";

interface SheetLayout {
  headerRow: number;
  nameCol: number;
  phoneCol: number | null;
  schoolCol: number | null;
  gradeCol: number | null;
  testDateCol: number | null;
  scoreCol: number | null;
  questionColumns: Map<number, number>;
}

function valueAt(row: CellValue[] | undefined, column: number | null): CellValue {
  if (!row || column === null || column < 0) return null;
  return row[column] ?? null;
}

function findHeaderColumn(
  rows: CellValue[][],
  aliases: string[],
  maxHeaderRows: number,
): number | null {
  const normalizedAliases = aliases.map(normalizeHeader);
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, maxHeaderRows); rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    for (let column = 0; column < row.length; column += 1) {
      const header = normalizeHeader(row[column]);
      if (normalizedAliases.includes(header)) return column;
    }
  }
  return null;
}

function detectLayout(rows: CellValue[][], definition: ReturnType<typeof getSubjectDefinition>): SheetLayout {
  let headerRow = -1;
  let nameCol = -1;

  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 15); rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    for (let column = 0; column < row.length; column += 1) {
      const header = normalizeHeader(row[column]);
      if (["학생명", "성명", "이름"].includes(header)) {
        headerRow = rowIndex;
        nameCol = column;
        break;
      }
    }
    if (headerRow >= 0) break;
  }

  if (headerRow < 0 || nameCol < 0) {
    throw new Error(`${definition.name} 시트에서 ‘학생명’ 열을 찾지 못했습니다.`);
  }

  const headerSearchRows = Math.min(rows.length, Math.max(headerRow + 3, 8));
  const questionColumns = new Map<number, number>();
  const maxColumns = Math.max(...rows.slice(0, headerSearchRows).map((row) => row.length), 0);

  for (let column = 0; column < maxColumns; column += 1) {
    for (let rowIndex = 0; rowIndex < headerSearchRows; rowIndex += 1) {
      const raw = normalizeText(rows[rowIndex]?.[column]);
      const compact = raw.replace(/\s+/g, "");
      const match = compact.match(/^(?:문항)?(\d+)(?:번(?:문항)?)?$/i);
      const qMatch = compact.match(/^Q(\d+)$/i);
      const number = Number(match?.[1] ?? qMatch?.[1] ?? 0);
      const hasQuestionMarker = /번|문항|^Q/i.test(compact);
      if (number >= 1 && number <= definition.questionCount && hasQuestionMarker) {
        questionColumns.set(number, column);
        break;
      }
    }
  }

  if (questionColumns.size === 0) {
    throw new Error(
      `${definition.name} 시트에서 문항 열(예: ‘1번문항’, ‘2번문항’)을 찾지 못했습니다.`,
    );
  }

  return {
    headerRow,
    nameCol,
    phoneCol: findHeaderColumn(rows, ["학부모HP", "학부모휴대폰", "학부모연락처", "보호자연락처", "휴대폰"], headerSearchRows),
    schoolCol: findHeaderColumn(rows, ["학교", "학교명"], headerSearchRows),
    gradeCol: findHeaderColumn(rows, ["학년"], headerSearchRows),
    testDateCol: findHeaderColumn(rows, ["평가일", "응시일", "시험일"], headerSearchRows),
    scoreCol: findHeaderColumn(rows, ["점수", "점수(선택)", "원점수", "총점"], headerSearchRows),
    questionColumns,
  };
}

function normalizedCell(value: CellValue): string {
  return normalizeText(value).toUpperCase().replace(/\s+/g, "");
}

function determineRowMode(values: CellValue[]): QuestionMode {
  const tokens = values.map(normalizedCell).filter(Boolean);
  if (tokens.length === 0) return "answer";

  if (tokens.some((token) => EXPLICIT_CORRECT.has(token) || EXPLICIT_WRONG.has(token))) {
    return "correctness";
  }

  if (tokens.some((token) => /^\d+(?:\.0+)?\/\d+(?:\.0+)?$/.test(token))) {
    return "correctness";
  }

  const numeric = tokens
    .map((token) => Number(token.replace(/번$/, "")))
    .filter((value) => Number.isFinite(value));
  if (
    numeric.length === tokens.length &&
    numeric.some((value) => value === 0) &&
    numeric.every((value) => value === 0 || value === 1)
  ) {
    return "correctness";
  }

  return "answer";
}

function parseCorrectness(value: CellValue, item: ExamItemDefinition, mode: QuestionMode): boolean | null {
  const token = normalizedCell(value);
  if (!token) return null;

  if (EXPLICIT_CORRECT.has(token)) return true;
  if (EXPLICIT_WRONG.has(token)) return false;

  const fraction = token.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  if (fraction) return Number(fraction[1]) >= Number(fraction[2]) && Number(fraction[2]) > 0;

  if (mode === "correctness") {
    if (token === "1") return true;
    if (token === "0") return false;
  }

  const cleaned = token.replace(/[①②③④⑤]/g, (character) => {
    const map: Record<string, string> = { "①": "1", "②": "2", "③": "3", "④": "4", "⑤": "5" };
    return map[character] ?? character;
  }).replace(/번$/, "");
  const answer = Number(cleaned);
  if (!Number.isFinite(answer)) return null;
  return answer === Number(item.answer);
}

function parseScore(value: CellValue): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = normalizeText(value).replace(/,/g, "");
  if (!text) return undefined;
  const numeric = Number(text.replace(/점$/, ""));
  return Number.isFinite(numeric) ? numeric : undefined;
}

function isStudentRowName(value: CellValue): boolean {
  const name = normalizeText(value);
  if (!name) return false;
  if (["학생명", "성명", "이름", "37", "합계", "평균"].includes(name)) return false;
  return true;
}

function parseSubjectSheet(rows: CellValue[][], subject: SubjectKey): RawStudentSubject[] {
  const definition = getSubjectDefinition(subject);
  const layout = detectLayout(rows, definition);

  const candidateRows = rows
    .slice(layout.headerRow + 1)
    .filter((row) => isStudentRowName(valueAt(row, layout.nameCol)));

  const students: RawStudentSubject[] = [];
  for (const row of candidateRows) {
    const rowMode = determineRowMode(
      definition.items.map((item) => {
        const column = layout.questionColumns.get(item.number);
        return column === undefined ? null : valueAt(row, column);
      }),
    );
    const studentName = normalizeText(valueAt(row, layout.nameCol));
    const school = normalizeText(valueAt(row, layout.schoolCol));
    const grade = normalizeGradeValue(valueAt(row, layout.gradeCol));
    const parentPhone = normalizePhone(valueAt(row, layout.phoneCol));
    const rawAnswers: Array<string | number | null> = [];
    const itemCorrectness: Array<boolean | null> = [];
    const warnings: string[] = [];

    for (const item of definition.items) {
      const column = layout.questionColumns.get(item.number);
      const rawValue = column === undefined ? null : valueAt(row, column);
      rawAnswers.push(
        rawValue === null || rawValue === undefined || rawValue === ""
          ? null
          : rawValue instanceof Date
            ? rawValue.toISOString()
            : typeof rawValue === "boolean"
              ? rawValue ? 1 : 0
              : rawValue,
      );
      itemCorrectness.push(
        column === undefined
          ? null
          : parseCorrectness(rawValue, item, rowMode),
      );
    }

    if (!parentPhone) warnings.push("학부모 휴대전화가 비어 있어 PIN 보호가 자동 해제됩니다.");
    const answeredCount = itemCorrectness.filter((value) => value !== null).length;
    if (answeredCount < definition.questionCount) {
      warnings.push(`${definition.questionCount - answeredCount}개 문항의 응답이 비어 있거나 해석되지 않았습니다.`);
    }

    students.push({
      subject,
      studentName,
      school,
      grade,
      parentPhone,
      testDate: safeDateText(valueAt(row, layout.testDateCol), definition.testDate),
      providedScore: parseScore(valueAt(row, layout.scoreCol)),
      itemCorrectness,
      rawAnswers,
      warnings,
    });
  }

  return students;
}

export async function parseWorkbookBuffer(buffer: ArrayBuffer | Buffer, filename = "업로드 파일"): Promise<ParsedWorkbookResult> {
  const input = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const workbookSheets = await readXlsxFile(input, { trim: false });
  const students: RawStudentSubject[] = [];
  const warnings: string[] = [];
  const foundSubjects = new Set<SubjectKey>();

  for (const workbookSheet of workbookSheets) {
    const sheetName = workbookSheet.sheet;
    const subject = matchSubjectBySheetName(sheetName);
    if (!subject) continue;
    const rows = workbookSheet.data as unknown as CellValue[][];

    try {
      const parsed = parseSubjectSheet(rows, subject);
      students.push(...parsed);
      foundSubjects.add(subject);
      if (parsed.length === 0) warnings.push(`${filename}의 ${sheetName} 시트에 학생 데이터가 없습니다.`);
    } catch (error) {
      warnings.push(
        `${filename} / ${sheetName}: ${error instanceof Error ? error.message : "시트 분석에 실패했습니다."}`,
      );
    }
  }

  if (foundSubjects.size === 0) {
    warnings.push(
      `${filename}에서 국어·수학·영어 시트를 찾지 못했습니다. 시트명을 ‘국어’, ‘수학’, ‘영어’로 맞춰 주세요.`,
    );
  }

  return { students, foundSubjects: SUBJECT_KEYS.filter((key) => foundSubjects.has(key)), warnings };
}

export function mergeParsedResults(results: ParsedWorkbookResult[]): ParsedWorkbookResult {
  const students = results.flatMap((result) => result.students);
  const warnings = results.flatMap((result) => result.warnings);
  const found = new Set(results.flatMap((result) => result.foundSubjects));
  return {
    students,
    warnings,
    foundSubjects: SUBJECT_KEYS.filter((key) => found.has(key)),
  };
}
