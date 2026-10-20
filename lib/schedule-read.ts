// 반배치고사 — 답안지의 선호 요일 칸을 판독기가 어떻게 읽었는지.
//
// 판독기는 확실한 단독 표기만 값(omr_scans.preferred_schedule)으로 저장하고,
// 흐리거나 겹치거나 비어 있으면 값은 비운 채 review_flags에
//   {type:"preferred_schedule", status, certain, candidate, selected}
// 를 남긴다. 화면은 이것으로 "왜 비었는지"와 "무엇으로 보이는지"를 말해 준다.
// 값도 플래그도 없으면 판독 당시 선호 요일 칸을 읽지 않은 답안지다 — 칸이
// 생기기 전에 올렸거나, 판독 서버가 갱신되기 전에 올린 경우.

import {
  enrollmentOf,
  preferredSchedule,
  type Enrollment,
  type PreferredSchedule,
} from "@/lib/placement-policy";

/** 보기 하나를 고르는 칸(선호 요일·재원 구분)을 판독기가 어떻게 읽었는지 */
export type FieldRead<T> =
  /** 확실한 단독 표기 — 판독기가 값으로 확정했다 */
  | { kind: "read"; value: T }
  /** 흐리거나 겹쳐 확정하지 못함 — candidate는 가장 진한 칸(없을 수도 있다) */
  | { kind: "uncertain"; status: "faint" | "multiple"; candidate: T | null; selected: T[] }
  /** 아무것도 칠하지 않은 것이 확실하다 */
  | { kind: "blank" }
  /** 판독 당시 그 칸을 읽지 않았다(값도 플래그도 없다) */
  | { kind: "unread" };

export type ScheduleRead = FieldRead<PreferredSchedule>;
export type EnrollmentRead = FieldRead<Enrollment>;

export interface ScheduleReadable {
  preferredSchedule?: string | null;
  reviewFlags?: Array<Record<string, unknown>> | null;
}

export interface EnrollmentReadable {
  enrollment?: string | null;
  reviewFlags?: Array<Record<string, unknown>> | null;
}

/** 판독기가 남긴 플래그의 type — 반배치고사 칸들 */
export const PLACEMENT_FLAG_TYPES = new Set(["preferred_schedule", "enrollment"]);

export function flagOfType(
  flags: Array<Record<string, unknown>> | null | undefined,
  type: string,
): Record<string, unknown> | null {
  return (flags ?? []).find((flag) => flag && flag.type === type) ?? null;
}

export function scheduleFlagOf(
  flags: Array<Record<string, unknown>> | null | undefined,
): Record<string, unknown> | null {
  return flagOfType(flags, "preferred_schedule");
}

function readChoiceField<T>(
  value: unknown,
  flags: Array<Record<string, unknown>> | null | undefined,
  flagType: string,
  parse: (raw: unknown) => T | null,
): FieldRead<T> {
  const read = parse(value);
  if (read !== null) return { kind: "read", value: read };

  const flag = flagOfType(flags, flagType);
  if (!flag) return { kind: "unread" };

  const candidate = parse(flag.candidate);
  const selected = (Array.isArray(flag.selected) ? flag.selected : [])
    .map((entry) => parse(entry))
    .filter((entry): entry is T => entry !== null);

  if (flag.status === "multiple") {
    return { kind: "uncertain", status: "multiple", candidate, selected };
  }
  // 확실한 빈칸은 제안할 것이 없다. 예전 판독기의 플래그는 certain이 늘 false라
  // 빈칸과 흐린 표기를 가르지 못하므로 '확인 필요'로 둔다.
  if (flag.status === "blank" && flag.certain === true) return { kind: "blank" };
  return { kind: "uncertain", status: "faint", candidate, selected };
}

export function scheduleRead(scan: ScheduleReadable): ScheduleRead {
  return readChoiceField(scan.preferredSchedule, scan.reviewFlags, "preferred_schedule", preferredSchedule);
}

export function enrollmentRead(scan: EnrollmentReadable): EnrollmentRead {
  return readChoiceField(scan.enrollment, scan.reviewFlags, "enrollment", enrollmentOf);
}

/** 재원 구분 칸 아래에 붙는 한 줄 안내 — 확정값이 아닐 때만 쓴다(확정값은 토글이 보여 준다) */
export function enrollmentReadLabel(read: EnrollmentRead): string {
  switch (read.kind) {
    case "read":
      return `답안지 표기 ‘${read.value}’`;
    case "blank":
      return "재원 구분 표기 없음 — 재원생으로 봅니다";
    case "unread":
      return "판독 때 재원 구분 칸을 읽지 않은 답안지 — 재원생으로 봅니다";
    case "uncertain":
      if (read.status === "multiple") return "재원생·신규생 둘 다 표기 — 하나를 고르세요";
      return read.candidate
        ? `표기가 흐려 ‘${read.candidate}’으로 보임 — 맞으면 눌러 주세요`
        : "재원 구분을 읽지 못함(비었거나 흐림) — 재원생으로 봅니다";
  }
}

/** 선호 요일 드롭다운에 미리 넣을 값 — 확정값, 없으면 가장 진한 칸, 그것도 없으면 빈칸 */
export function suggestedSchedule(scan: ScheduleReadable): string {
  const read = scheduleRead(scan);
  if (read.kind === "read") return read.value;
  if (read.kind === "uncertain") return read.candidate ?? "";
  return "";
}

/** 선호 요일 칸 아래에 붙는 한 줄 안내 */
export function scheduleReadLabel(read: ScheduleRead): string {
  switch (read.kind) {
    case "read":
      return `답안지 표기 ‘${read.value}’`;
    case "blank":
      return "답안지에 표기 없음 — 직접 고르세요";
    case "unread":
      return "판독 때 선호 요일 칸을 읽지 않은 답안지 — ‘답안지에서 재원 구분·선호 요일 다시 읽기’";
    case "uncertain":
      if (read.status === "multiple") {
        const marks = read.selected.length > 0 ? `(${read.selected.join(" · ")})` : "";
        return `둘 이상 표기${marks} — 하나를 고르세요`;
      }
      return read.candidate
        ? `표기가 흐려 ‘${read.candidate}’로 보임 — 확인해 주세요`
        : "표기를 읽지 못함(비었거나 흐림) — 직접 고르세요";
  }
}

/** PDF 페이지 결과("스캔.pdf#p3")를 업로드 원본 파일명("스캔.pdf")으로 되돌린다 */
export function baseFilename(name: string): string {
  return name.replace(/#p\d+$/, "");
}

export interface RereadGroup {
  /** Storage 경로 — PDF의 여러 쪽은 한 경로를 나눠 쓴다 */
  path: string;
  /** 판독 서버에 보낼 파일명 — 결과 파일명이 저장된 filename과 맞아떨어지게 */
  uploadName: string;
  filenames: string[];
}

/**
 * 다시 읽을 스캔을 원본 파일 단위로 묶는다.
 *
 * 저장된 판독 결과는 한 쪽에 한 행이지만 원본은 파일 하나다(PDF 한 권에 여러
 * 쪽). 파일을 한 번만 내려받아 한 번만 보내고, 돌아온 쪽별 결과를 filename
 * 으로 다시 행에 맞춘다. 원본이 보관돼 있지 않은 행은 다시 읽을 수 없다.
 */
export function rereadGroups(
  scans: Array<{ filename: string; scanPath: string | null }>,
): { groups: RereadGroup[]; missing: string[] } {
  const byPath = new Map<string, RereadGroup>();
  const missing: string[] = [];
  for (const scan of scans) {
    if (!scan.scanPath) {
      missing.push(scan.filename);
      continue;
    }
    const group = byPath.get(scan.scanPath) ?? {
      path: scan.scanPath,
      uploadName: baseFilename(scan.filename),
      filenames: [],
    };
    group.filenames.push(scan.filename);
    byPath.set(scan.scanPath, group);
  }
  return { groups: [...byPath.values()], missing };
}

/** 기존 플래그에서 반배치고사 칸(선호 요일·재원 구분) 것만 새 판독 결과로 갈아 끼운다(문항·수험번호 플래그는 그대로) */
export function mergeScheduleFlags(
  existing: Array<Record<string, unknown>> | null | undefined,
  fresh: Array<Record<string, unknown>> | null | undefined,
): Array<Record<string, unknown>> {
  const placement = (flag: Record<string, unknown>) => Boolean(flag) && PLACEMENT_FLAG_TYPES.has(String(flag.type));
  return [
    ...(existing ?? []).filter((flag) => !placement(flag)),
    ...(fresh ?? []).filter((flag) => placement(flag)),
  ];
}

export interface RereadSummary {
  /** 선호 요일을 다시 저장한 답안지 수 */
  updated: number;
  read: number;
  uncertain: number;
  blank: number;
  /** 판독 서버가 선호 요일 칸을 읽지 않은 수 — 서버가 옛 버전일 때만 생긴다 */
  unread: number;
  /** 선호 요일 칸이 없는(다른 배치로 출력된) 답안지 — 건너뛴다 */
  mismatched: number;
}

export const EMPTY_REREAD_SUMMARY: RereadSummary = {
  updated: 0,
  read: 0,
  uncertain: 0,
  blank: 0,
  unread: 0,
  mismatched: 0,
};

function nameList(names: string[]): string {
  return `${names.slice(0, 5).join(", ")}${names.length > 5 ? " 외" : ""}`;
}

/** '다시 읽기' 결과를 한 문장으로 */
export function rereadMessage(
  summary: Partial<RereadSummary>,
  unavailable: string[] = [],
  problems: string[] = [],
): string {
  const s = { ...EMPTY_REREAD_SUMMARY, ...summary };
  const parts: string[] = [];
  if (s.updated > 0) {
    parts.push(
      `답안지 ${s.updated}장의 선호 요일을 다시 읽었습니다 — 확실히 읽음 ${s.read} · 확인 필요 ${s.uncertain} · 표기 없음 ${s.blank}`,
    );
  } else {
    parts.push("다시 읽은 답안지가 없습니다");
  }
  if (s.unread > 0) {
    parts.push(`판독 서버가 선호 요일 칸을 읽지 않은 답안지 ${s.unread}장 — 판독 서버 갱신을 확인해 주세요`);
  }
  if (s.mismatched > 0) {
    parts.push(`선호 요일 칸이 없는(다른 배치로 출력된) 답안지 ${s.mismatched}장은 건너뛰었습니다`);
  }
  if (unavailable.length > 0) {
    parts.push(`원본이 보관돼 있지 않은 ${unavailable.length}장은 스캔을 다시 올려야 합니다(${nameList(unavailable)})`);
  }
  if (problems.length > 0) {
    parts.push(`읽기 실패 ${problems.length}장(${nameList(problems)})`);
  }
  return `${parts.join(" · ")}.`;
}
