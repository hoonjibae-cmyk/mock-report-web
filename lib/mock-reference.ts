// 국영수 모의고사 '시험 기반 정보' — 성적표 산출 전에 올리는 엑셀의 두 탭을 읽는다.
//
//   문항분류표 : 과목 · 문항 · 정답 · 배점 · 행동영역 · 대영역 · 내용영역 ·
//                세부 유형·내용 · 난이도 · 학년 수준     (헤더 4행, 자료 5행부터)
//   전국비교기준 : 과목 · 등급 · 최소 원점수 · 전국 상위 누적 · 전국 평균
//
// 학원 OMR 채점만으로는 나오지 않는 값(전국 등급·상위 추정, 문항 분류)을 여기서
// 얻는다. 한 파일에 국어·수학·영어가 함께 들어 있으므로, 그 시험의 과목 행만 걸러
// 저장한다(과목마다 시험이 따로다).

import { MOCK_SUBJECTS, type MockSubject } from "@/lib/omr-types";

export interface MockReferenceItem {
  number: number;
  answer: number | null;
  points: number | null;
  behavior: string;
  area: string;
  content: string;
  detail: string;
  difficulty: string;
  gradeLevel: string;
}

export interface MockGradeCut {
  grade: number;
  minScore: number;
  /** 전국 상위 누적 % (0~100) */
  topPercent: number;
}

export interface MockReference {
  subject: MockSubject;
  subjectLabel: string;
  items: MockReferenceItem[];
  gradeCuts: MockGradeCut[];
  nationalAverage: number | null;
  filename: string;
  uploadedAt: string;
  uploadedBy?: string;
}

const ITEM_SHEET = "문항분류표";
const CUT_SHEET = "전국비교기준";

type Cell = string | number | boolean | Date | null | undefined;
type Sheet = { sheet: string; data: Cell[][] };

function text(value: Cell): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function num(value: Cell): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

/** 엑셀의 과목 표기('국어'/'korean' 등)를 내부 과목 키로 */
function subjectKey(value: Cell): MockSubject | null {
  const raw = text(value).toLowerCase();
  if (!raw) return null;
  const matched = MOCK_SUBJECTS.find(
    (s) => s.value === raw || s.label === text(value) || raw.startsWith(s.value),
  );
  return matched?.value ?? null;
}

/** 헤더 행(과목 · 문항 …)을 찾아 그 다음 행부터 자료로 본다 */
function findHeaderRow(rows: Cell[][], secondColumn: string): number {
  for (let i = 0; i < Math.min(rows.length, 12); i += 1) {
    const row = rows[i] ?? [];
    if (text(row[0]) === "과목" && text(row[1]) === secondColumn) return i;
  }
  return -1;
}

export interface ParseOptions {
  subject: MockSubject;
  filename: string;
  uploadedBy?: string;
}

/**
 * 워크북(시트 배열)에서 해당 과목의 기준 자료를 뽑는다.
 * 형식이 어긋나면 사람이 고칠 수 있는 문장으로 예외를 던진다.
 */
export function parseMockReference(sheets: Sheet[], options: ParseOptions): MockReference {
  const bySheet = new Map(sheets.map((s) => [s.sheet.trim(), s.data ?? []]));
  const itemRows = bySheet.get(ITEM_SHEET);
  const cutRows = bySheet.get(CUT_SHEET);

  if (!itemRows || !cutRows) {
    const missing = [!itemRows ? ITEM_SHEET : null, !cutRows ? CUT_SHEET : null].filter(Boolean);
    throw new Error(
      `엑셀에서 '${missing.join("', '")}' 탭을 찾지 못했습니다. 성적 입력 템플릿(.xlsx)을 그대로 사용해 주세요.`,
    );
  }

  const itemHeader = findHeaderRow(itemRows, "문항");
  if (itemHeader < 0) {
    throw new Error(`'${ITEM_SHEET}' 탭에서 '과목 · 문항 …' 머리글 행을 찾지 못했습니다.`);
  }
  const cutHeader = findHeaderRow(cutRows, "등급");
  if (cutHeader < 0) {
    throw new Error(`'${CUT_SHEET}' 탭에서 '과목 · 등급 …' 머리글 행을 찾지 못했습니다.`);
  }

  const items: MockReferenceItem[] = [];
  for (const row of itemRows.slice(itemHeader + 1)) {
    if (subjectKey(row[0]) !== options.subject) continue;
    const number = num(row[1]);
    if (number === null || number < 1) continue;
    items.push({
      number: Math.floor(number),
      answer: num(row[2]),
      points: num(row[3]),
      behavior: text(row[4]),
      area: text(row[5]),
      content: text(row[6]),
      detail: text(row[7]),
      difficulty: text(row[8]),
      gradeLevel: text(row[9]),
    });
  }
  items.sort((a, b) => a.number - b.number);

  const cuts: MockGradeCut[] = [];
  let nationalAverage: number | null = null;
  for (const row of cutRows.slice(cutHeader + 1)) {
    if (subjectKey(row[0]) !== options.subject) continue;
    const grade = num(row[1]);
    const minScore = num(row[2]);
    const cumulative = num(row[3]);
    if (grade === null || minScore === null) continue;
    cuts.push({
      grade: Math.floor(grade),
      minScore,
      // 0.0415처럼 비율로 적힌 경우와 4.15처럼 %로 적힌 경우를 모두 받는다
      topPercent: cumulative === null ? 0 : cumulative <= 1 ? cumulative * 100 : cumulative,
    });
    if (nationalAverage === null) nationalAverage = num(row[4]);
  }
  cuts.sort((a, b) => a.grade - b.grade);

  const label = MOCK_SUBJECTS.find((s) => s.value === options.subject)?.label ?? options.subject;
  if (items.length === 0) {
    throw new Error(
      `'${ITEM_SHEET}' 탭에 '${label}' 과목 행이 없습니다. 이 시험의 과목과 같은 파일인지 확인해 주세요.`,
    );
  }
  if (cuts.length === 0) {
    throw new Error(`'${CUT_SHEET}' 탭에 '${label}' 과목의 등급 기준이 없습니다.`);
  }

  return {
    subject: options.subject,
    subjectLabel: label,
    items,
    gradeCuts: cuts,
    nationalAverage,
    filename: options.filename,
    uploadedAt: new Date().toISOString(),
    uploadedBy: options.uploadedBy,
  };
}

/** 원점수 → 전국 등급 (등급컷 미달이면 마지막 등급 + 1, 최대 9) */
export function nationalGrade(reference: MockReference, raw: number): number {
  const sorted = [...reference.gradeCuts].sort((a, b) => b.minScore - a.minScore);
  const hit = sorted.find((cut) => raw >= cut.minScore);
  if (hit) return hit.grade;
  const last = sorted[sorted.length - 1];
  return Math.min(9, (last?.grade ?? 8) + 1);
}

/**
 * 원점수 → 전국 상위 추정 %.
 * 공개된 등급컷 구간 사이를 선형 보간한 참고값이며 공식 개인 백분위가 아니다.
 */
export function nationalTopPercent(reference: MockReference, raw: number): number {
  // 점수 내림차순 앵커 (만점 0.1% ~ 최하위 100%)
  const anchors = [...reference.gradeCuts]
    .map((cut) => ({ score: cut.minScore, topPercent: cut.topPercent }))
    .sort((a, b) => b.score - a.score);
  if (anchors.length === 0) return 50;

  const top = anchors[0];
  const bottom = anchors[anchors.length - 1];
  if (raw >= top.score) return Math.max(0.1, top.topPercent);
  if (raw <= bottom.score) return Math.min(100, bottom.topPercent);

  for (let i = 0; i < anchors.length - 1; i += 1) {
    const high = anchors[i];
    const low = anchors[i + 1];
    if (raw <= high.score && raw >= low.score) {
      const span = high.score - low.score;
      if (span <= 0) return high.topPercent;
      const ratio = (high.score - raw) / span;
      return Math.round((high.topPercent + (low.topPercent - high.topPercent) * ratio) * 10) / 10;
    }
  }
  return bottom.topPercent;
}
