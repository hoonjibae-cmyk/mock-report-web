/**
 * 성적표 알림톡 발송 대상 판정 테스트.
 *
 * 실행: npm test
 *
 * 발송은 되돌릴 수 없다. 여기서 틀리면 꺼진 링크가 나가거나, 엉뚱한 번호로
 * 성적표가 가거나, 이미 받은 학부모가 또 받는다. 그래서 "보낼 수 있는가"보다
 * **"막아야 할 것을 막는가"** 를 더 촘촘히 본다.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSendTargets,
  countTargets,
  examSendBlocker,
  formatExamDate,
  resolveSelections,
  templateVariables,
  type SendReportRow,
} from "../lib/report-send";
import type { DirectoryStudent } from "../lib/student-directory";
import type { ReportMessage } from "../lib/report-messages";
import { maskPhone, normalizePhone } from "../lib/messaging/solapi";

function report(over: Partial<SendReportRow> = {}): SendReportRow {
  return {
    id: over.id ?? "r1",
    token: over.token ?? "tok1",
    studentName: over.studentName ?? "김민준",
    studentKey: over.studentKey !== undefined ? over.studentKey : "1023",
    active: over.active ?? true,
    createdAt: over.createdAt ?? "2026-08-29T00:00:00.000Z",
  };
}

function student(over: Partial<DirectoryStudent> = {}): DirectoryStudent {
  return {
    examNumber: "1023",
    name: "김민준",
    school: "목운중",
    grade: "3",
    parentPhone: "010-1111-2222",
    studentPhone: "010-3333-4444",
    className: "중3A",
    teacher: "김선생",
    status: "재원",
    ...over,
  };
}

function directory(...students: DirectoryStudent[]): Map<string, DirectoryStudent> {
  return new Map(students.map((s) => [s.examNumber, s]));
}

function message(over: Partial<ReportMessage> = {}): ReportMessage {
  return {
    id: over.id ?? "m1",
    reportId: over.reportId ?? "r1",
    examId: "e1",
    recipientType: over.recipientType ?? "parent",
    phoneMasked: "010-****-2222",
    status: over.status ?? "sent",
    channel: "alimtalk",
    providerMessageId: null,
    error: null,
    sentBy: "관리자",
    createdAt: over.createdAt ?? "2026-08-29T01:00:00.000Z",
    ...over,
  };
}

const base = {
  reports: [report()],
  directory: directory(student()),
  directoryConfigured: true,
  messages: [] as ReportMessage[],
};

test("연락처가 있으면 학부모·학생 모두 보낼 수 있다", () => {
  const [target] = buildSendTargets(base);
  assert.equal(target.parent.blocked, null);
  assert.equal(target.student.blocked, null);
  // 평문 번호는 절대 나가지 않는다 — 마스킹된 값만 화면으로 간다
  assert.equal(target.parent.phoneMasked, "010-****-2222");
  assert.equal(target.student.phoneMasked, "010-****-4444");
  assert.equal(target.className, "중3A");
  assert.ok(
    !JSON.stringify(target).includes("01011112222"),
    "발송 대상 표에 평문 번호가 섞여 나가면 안 된다",
  );
});

test("링크가 꺼진 성적표는 보낼 수 없다", () => {
  // 꺼진 링크를 보내면 학부모는 열리지 않는 주소를 받는다.
  const [target] = buildSendTargets({ ...base, reports: [report({ active: false })] });
  assert.match(target.parent.blocked ?? "", /중지/);
  assert.match(target.student.blocked ?? "", /중지/);
});

test("학생 본인 번호가 없어도 학부모에게는 보낼 수 있다", () => {
  // 학생 번호가 없는 학생이 많다. 한쪽이 없다고 다른 쪽까지 막으면 안 된다.
  const [target] = buildSendTargets({
    ...base,
    directory: directory(student({ studentPhone: "" })),
  });
  assert.equal(target.parent.blocked, null);
  assert.match(target.student.blocked ?? "", /학생 본인 연락처/);
  assert.equal(target.student.phoneMasked, null);
});

test("유선번호는 알림톡 대상이 아니라고 이유를 밝힌다", () => {
  // "번호 없음"과 "번호가 있지만 못 보냄"은 손쓸 방법이 다르다.
  const [target] = buildSendTargets({
    ...base,
    directory: directory(student({ parentPhone: "02-123-4567" })),
  });
  assert.match(target.parent.blocked ?? "", /휴대전화 번호가 아니어서/);
});

test("연동이 꺼져 있으면 번호 문제보다 그것을 먼저 알린다", () => {
  // 번호가 없다고 알려 준들 연동이 꺼져 있으면 손쓸 수 없다.
  const [target] = buildSendTargets({
    ...base,
    directory: new Map(),
    directoryConfigured: false,
  });
  assert.match(target.parent.blocked ?? "", /학생 관리 프로그램 연동/);
});

test("수험번호가 없거나 명부에 없으면 각각 다른 이유를 남긴다", () => {
  const [noKey] = buildSendTargets({
    ...base,
    reports: [report({ studentKey: null })],
  });
  assert.match(noKey.parent.blocked ?? "", /수험번호가 없는/);

  const [notFound] = buildSendTargets({ ...base, directory: new Map() });
  assert.match(notFound.parent.blocked ?? "", /찾지 못했/);
});

test("성공한 발송만 '보냄'으로 본다 — 실패만 쌓인 건은 다시 보낼 수 있어야 한다", () => {
  const sent = buildSendTargets({ ...base, messages: [message({ status: "sent" })] })[0];
  assert.equal(sent.parent.history?.sent, true);

  const failedOnly = buildSendTargets({
    ...base,
    messages: [message({ id: "m2", status: "failed" }), message({ id: "m3", status: "failed" })],
  })[0];
  assert.equal(failedOnly.parent.history?.sent, false, "실패만 쌓였으면 아직 안 보낸 것");
  assert.equal(failedOnly.parent.history?.attempts, 2);
  // 학생 쪽에는 기록이 없으므로 학부모 기록이 새어 들어가면 안 된다
  assert.equal(failedOnly.student.history, null);
});

test("같은 학생의 성적표가 여러 번이어도 집계는 수신자별로 따로 센다", () => {
  const targets = buildSendTargets({
    ...base,
    reports: [
      report({ id: "r1", studentKey: "1023" }),
      report({ id: "r2", token: "tok2", studentName: "이서연", studentKey: "1024" }),
      report({ id: "r3", token: "tok3", studentName: "박지호", studentKey: "9999" }),
    ],
    directory: directory(student(), student({ examNumber: "1024", studentPhone: "" })),
    messages: [message({ reportId: "r1" })],
  });

  const parent = countTargets(targets, "parent");
  assert.deepEqual(parent, { ready: 2, alreadySent: 1, blocked: 1 });

  // 학생 쪽은 1024가 번호 없음으로 하나 더 막힌다
  const studentCount = countTargets(targets, "student");
  assert.deepEqual(studentCount, { ready: 1, alreadySent: 0, blocked: 2 });
});

test("화면이 고른 것을 서버가 다시 검증한다", () => {
  // 화면을 그린 뒤 링크가 꺼졌을 수 있다. 화면의 판단을 그대로 믿으면 안 된다.
  const reports = [report({ id: "r1" }), report({ id: "r2", token: "t2", active: false })];
  const dir = directory(student());
  const targets = buildSendTargets({ ...base, reports, directory: dir });

  const { send, rejected } = resolveSelections(
    [
      { reportId: "r1", recipientType: "parent" },
      { reportId: "r2", recipientType: "parent" }, // 꺼진 링크
      { reportId: "없음", recipientType: "parent" }, // 다른 시험의 성적표
    ],
    targets,
    dir,
  );

  assert.equal(send.length, 1);
  assert.equal(send[0].reportId, "r1");
  assert.equal(send[0].phone, "01011112222", "발송에는 평문 번호를 쓴다");
  assert.equal(send[0].phoneMasked, "010-****-2222", "기록에는 마스킹만 남긴다");
  assert.equal(rejected.length, 2);
  assert.match(rejected[0].reason, /중지/);
  assert.match(rejected[1].reason, /이 시험의 성적표가 아닙니다/);
});

test("같은 대상을 두 번 골라도 한 번만 보낸다", () => {
  // 화면에서 중복이 생겨도 학부모가 같은 메시지를 두 번 받으면 안 된다.
  const targets = buildSendTargets(base);
  const { send } = resolveSelections(
    [
      { reportId: "r1", recipientType: "parent" },
      { reportId: "r1", recipientType: "parent" },
      { reportId: "r1", recipientType: "student" },
    ],
    targets,
    base.directory,
  );
  assert.equal(send.length, 2);
  assert.deepEqual(
    send.map((s) => s.recipientType),
    ["parent", "student"],
  );
});

test("템플릿 변수 이름은 심사받은 템플릿과 글자까지 같아야 한다", () => {
  // 이름이 하나라도 다르면 치환되지 않은 채 '#{학생명}' 그대로 나가거나
  // 발송이 거부된다. 이름을 코드에 흩지 않고 여기서 고정한다.
  const variables = templateVariables({
    studentName: "김민준",
    examTitle: "8월 월말평가",
    examDate: "2026-08-29",
    token: "abc123",
  });
  assert.deepEqual(Object.keys(variables).sort(), [
    "#{시험명}",
    "#{응시일}",
    "#{토큰}",
    "#{학생명}",
  ]);
  assert.equal(variables["#{학생명}"], "김민준");
  assert.equal(variables["#{시험명}"], "8월 월말평가");
  assert.equal(variables["#{응시일}"], "2026년 8월 29일");
  assert.equal(variables["#{토큰}"], "abc123");
  assert.equal(Object.keys(variables).length, 4, "심사받은 템플릿의 변수는 4개뿐이다");
});

test("응시일은 학부모가 읽을 우리말 표기로 나간다", () => {
  // 2026-08-29를 그대로 보내면 전산 화면에서 퍼온 것처럼 보인다.
  assert.equal(formatExamDate("2026-08-29"), "2026년 8월 29일");
  // 앞의 0은 떼고, 시각이 붙어 있어도 날짜만 본다
  assert.equal(formatExamDate("2026-01-05"), "2026년 1월 5일");
  assert.equal(formatExamDate("2026-12-31T00:00:00.000Z"), "2026년 12월 31일");
});

test("응시일이 없으면 시험 전체를 막는다", () => {
  // 빈 변수는 대행사에서 거부될 수 있고, 통과하더라도 '응시일 :' 뒤가 빈
  // 메시지가 60명에게 나간다. 시험 정보에서 한 칸만 채우면 되는 일이다.
  assert.equal(formatExamDate(null), "");
  assert.equal(formatExamDate(""), "");
  assert.equal(formatExamDate("미정"), "");

  assert.equal(examSendBlocker("2026-08-29"), null, "응시일이 있으면 막지 않는다");
  for (const empty of [null, undefined, "", "미정"]) {
    assert.match(examSendBlocker(empty) ?? "", /응시일/, `${String(empty)} 는 막아야 한다`);
  }
});

test("번호 정규화는 휴대전화만 통과시킨다", () => {
  assert.equal(normalizePhone("010-1234-5678"), "01012345678");
  assert.equal(normalizePhone(" 010 1234 5678 "), "01012345678");
  assert.equal(normalizePhone("02-123-4567"), null, "유선번호로는 알림톡이 가지 않는다");
  assert.equal(normalizePhone(""), null);
  assert.equal(normalizePhone(null), null);
  assert.equal(maskPhone("01012345678"), "010-****-5678");
});
