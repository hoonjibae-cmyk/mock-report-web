// 성적표 발송 대상 정리 — "누구에게 보낼 수 있고, 누구는 왜 못 보내는가".
//
// 발송은 되돌릴 수 없다. 잘못된 번호로 나간 성적표는 회수할 방법이 없고,
// 링크가 꺼진 성적표를 보내면 학부모는 열리지 않는 링크를 받는다. 그래서
// 보낼 수 있는 건과 못 보내는 건을 **보내기 전에** 갈라 두고, 못 보내는
// 건은 이유까지 화면에 적어 준다.
//
// 전화번호는 이 시스템에 저장되어 있지 않다(성적표에는 마스킹만 남긴다).
// 발송 시점에 학생 관리 프로그램에서 가져와 쓰고 버린다. 이 파일이 평문
// 번호를 다루는 유일한 지점이고, 밖으로 나가는 것은 마스킹된 값뿐이다.

import type { DirectoryStudent } from "@/lib/student-directory";
import { maskPhone, normalizePhone } from "@/lib/messaging/solapi";
import type { ReportMessage, RecipientType, SendSummary } from "@/lib/report-messages";
import { summarizeByReport } from "@/lib/report-messages";

/** 발송 대상이 될 수 있는 성적표 한 건(DB에서 읽은 그대로) */
export interface SendReportRow {
  id: string;
  token: string;
  studentName: string;
  studentKey: string | null;
  active: boolean;
  createdAt: string;
}

/** 한 수신자(학부모 또는 학생)에게 보낼 수 있는가 */
export interface RecipientSlot {
  type: RecipientType;
  /** 마스킹된 번호 — 화면·기록에 쓴다. 번호가 없으면 null */
  phoneMasked: string | null;
  /** 보낼 수 없으면 그 이유. 보낼 수 있으면 null */
  blocked: string | null;
  /** 지난 발송 요약(성공한 적이 있는가 등) */
  history: SendSummary | null;
}

export interface SendTarget {
  reportId: string;
  token: string;
  studentName: string;
  studentKey: string | null;
  className: string;
  parent: RecipientSlot;
  student: RecipientSlot;
}

export interface BuildTargetsInput {
  reports: SendReportRow[];
  /** 수험번호 → 학생 관리 프로그램에서 가져온 정보 */
  directory: Map<string, DirectoryStudent>;
  /** 학생 관리 프로그램 연동이 설정되어 있는가 */
  directoryConfigured: boolean;
  messages: ReportMessage[];
}

const NO_DIRECTORY = "학생 관리 프로그램 연동이 설정되어 있지 않아 연락처를 가져올 수 없습니다.";
const NO_KEY = "수험번호가 없는 성적표라 연락처를 찾을 수 없습니다.";
const NOT_FOUND = "학생 관리 프로그램에서 이 수험번호를 찾지 못했습니다.";
const INACTIVE = "링크가 중지된 성적표입니다. 먼저 링크를 다시 켜 주세요.";
const NO_PARENT_PHONE = "학부모 연락처가 등록되어 있지 않습니다.";
const NO_STUDENT_PHONE = "학생 본인 연락처가 등록되어 있지 않습니다.";
const BAD_PHONE = "휴대전화 번호가 아니어서 알림톡을 보낼 수 없습니다(유선번호 등).";

/**
 * 성적표 목록을 발송 대상 표로 바꾼다.
 *
 * 못 보내는 이유는 하나만 남긴다. 여러 이유가 겹칠 때는 **먼저 고쳐야 하는
 * 것**을 보여 준다 — 번호가 없다고 알려 준들, 연동이 꺼져 있으면 손쓸 수
 * 없기 때문이다.
 */
export function buildSendTargets(input: BuildTargetsInput): SendTarget[] {
  const history = summarizeByReport(input.messages);

  return input.reports.map((report) => {
    const student = report.studentKey ? input.directory.get(report.studentKey) : undefined;

    // 개별 번호와 무관하게 전체를 막는 이유
    const common = !input.directoryConfigured
      ? NO_DIRECTORY
      : !report.active
        ? INACTIVE
        : !report.studentKey
          ? NO_KEY
          : !student
            ? NOT_FOUND
            : null;

    const slot = (type: RecipientType, raw: string, missing: string): RecipientSlot => {
      const digits = normalizePhone(raw);
      const hasSomething = String(raw ?? "").replace(/\D/g, "").length > 0;
      const blocked =
        common ?? (digits ? null : hasSomething ? BAD_PHONE : missing);
      return {
        type,
        phoneMasked: digits ? maskPhone(digits) : null,
        blocked,
        history: history.get(`${report.id}:${type}`) ?? null,
      };
    };

    return {
      reportId: report.id,
      token: report.token,
      studentName: report.studentName,
      studentKey: report.studentKey,
      className: student?.className ?? "",
      parent: slot("parent", student?.parentPhone ?? "", NO_PARENT_PHONE),
      student: slot("student", student?.studentPhone ?? "", NO_STUDENT_PHONE),
    };
  });
}

export interface TargetCounts {
  /** 보낼 수 있는 건 수 */
  ready: number;
  /** 이미 성공적으로 보낸 적이 있는 건 수 */
  alreadySent: number;
  /** 막힌 건 수 */
  blocked: number;
}

/** 한 수신자 유형에 대한 집계 — 화면 상단 요약용 */
export function countTargets(targets: SendTarget[], type: RecipientType): TargetCounts {
  let ready = 0;
  let alreadySent = 0;
  let blocked = 0;
  for (const target of targets) {
    const slot = type === "parent" ? target.parent : target.student;
    if (slot.blocked) blocked += 1;
    else {
      ready += 1;
      if (slot.history?.sent) alreadySent += 1;
    }
  }
  return { ready, alreadySent, blocked };
}

/**
 * 시험 응시일을 학부모가 읽을 모양으로 바꾼다.
 *
 * `2026-08-29`를 그대로 보내면 전산 화면에서 퍼온 것처럼 보인다. 알림톡은
 * 학부모가 읽는 글이므로 우리말 표기로 바꾼다. 날짜로 읽히지 않으면 빈
 * 문자열을 돌려주고, 그 판단은 부르는 쪽에 맡긴다.
 */
export function formatExamDate(raw: string | null | undefined): string {
  const text = String(raw ?? "").trim();
  const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return "";
  const [, year, month, day] = match;
  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}

/**
 * 알림톡 템플릿의 `#{변수}` 자리에 채울 값.
 *
 * 심사받은 템플릿의 변수 이름과 **글자 하나까지 같아야** 한다. 이름이 다르면
 * 치환되지 않은 채 `#{학생명}` 그대로 발송되거나 발송 자체가 거부된다.
 * 그래서 이름을 코드 여기저기에 흩지 않고 이 함수 하나에 모아 둔다.
 *
 * 값이 빈 변수도 마찬가지로 위험하다. 그래서 응시일이 비어 있으면 여기서
 * 조용히 빈 칸을 채우지 않고, 발송을 시작하기 전에 막는다(canSendExam).
 */
export function templateVariables(args: {
  studentName: string;
  examTitle: string;
  examDate: string | null | undefined;
  token: string;
}): Record<string, string> {
  return {
    "#{학생명}": args.studentName,
    "#{시험명}": args.examTitle,
    "#{응시일}": formatExamDate(args.examDate),
    "#{토큰}": args.token,
  };
}

/**
 * 시험 자체가 발송 가능한 상태인가 — 학생별 사정과 무관하게 전체를 막는 것.
 *
 * 응시일이 비어 있으면 `#{응시일}`이 빈 칸으로 나간다. 빈 변수는 대행사에서
 * 거부될 수 있고, 통과하더라도 "응시일 :" 뒤가 비어 있는 메시지가 60명에게
 * 나간다. 시험 정보에서 한 칸만 채우면 되는 일이므로 보내기 전에 막는다.
 */
export function examSendBlocker(examDate: string | null | undefined): string | null {
  if (!formatExamDate(examDate)) {
    return "시험 응시일이 비어 있습니다. 알림톡에 응시일이 들어가므로, 시험 정보에서 응시일을 먼저 입력해 주세요.";
  }
  return null;
}

/** 화면에서 고른 대상 하나 */
export interface SendSelection {
  reportId: string;
  recipientType: RecipientType;
}

export interface ResolvedSend {
  reportId: string;
  recipientType: RecipientType;
  /** 평문 번호 — 발송에만 쓰고 저장하지 않는다 */
  phone: string;
  phoneMasked: string;
  studentName: string;
  token: string;
}

export interface ResolveResult {
  send: ResolvedSend[];
  /** 고른 대상 중 보낼 수 없던 건과 그 이유 */
  rejected: Array<{ reportId: string; recipientType: RecipientType; reason: string }>;
}

/**
 * 화면에서 고른 대상을 실제 발송 목록으로 바꾼다.
 *
 * 화면이 보낸 것을 그대로 믿지 않는다. 화면을 그린 뒤 링크가 꺼졌거나
 * 연락처가 지워졌을 수 있고, 그 사이 다른 선생님이 이미 보냈을 수도 있다.
 * 서버가 지금 시점의 사실로 다시 판단한다.
 */
export function resolveSelections(
  selections: SendSelection[],
  targets: SendTarget[],
  directory: Map<string, DirectoryStudent>,
): ResolveResult {
  const byId = new Map(targets.map((t) => [t.reportId, t]));
  const send: ResolvedSend[] = [];
  const rejected: ResolveResult["rejected"] = [];
  // 같은 성적표·수신자를 두 번 고른 경우 한 번만 보낸다
  const seen = new Set<string>();

  for (const selection of selections) {
    const key = `${selection.reportId}:${selection.recipientType}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const target = byId.get(selection.reportId);
    if (!target) {
      rejected.push({ ...selection, reason: "이 시험의 성적표가 아닙니다." });
      continue;
    }
    const slot = selection.recipientType === "parent" ? target.parent : target.student;
    if (slot.blocked) {
      rejected.push({ ...selection, reason: slot.blocked });
      continue;
    }
    const student = target.studentKey ? directory.get(target.studentKey) : undefined;
    const phone = normalizePhone(
      selection.recipientType === "parent" ? student?.parentPhone : student?.studentPhone,
    );
    if (!phone) {
      rejected.push({ ...selection, reason: "연락처를 확인하지 못했습니다." });
      continue;
    }
    send.push({
      reportId: target.reportId,
      recipientType: selection.recipientType,
      phone,
      phoneMasked: maskPhone(phone),
      studentName: target.studentName,
      token: target.token,
    });
  }
  return { send, rejected };
}
