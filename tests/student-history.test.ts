/**
 * 학생별 시험 이력 — 검색 결과 묶기와 유형별 이력.
 *
 * 실행: npm test
 *
 * 여기서 틀리면 동명이인이 한 사람으로 합쳐지거나, 다시 만든 성적표가 두 줄로
 * 나오거나, 담임에게 열지 않는 유형이 보인다.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  candidatesFrom,
  groupHistory,
  matchesQuery,
  studentHeader,
  studentIdentity,
  visibleExamType,
  type StudentReport,
} from "../lib/student-history";

function report(over: Partial<StudentReport> = {}): StudentReport {
  return {
    reportId: over.reportId ?? "r1", token: "t", examId: "e1", examType: "monthly", examTitle: "9월 월말평가",
    examDate: "2026-09-20", studentKey: "12345", studentName: "최유민", school: "미강고 1", className: "미강고1 화목",
    teacher: "하수정", raw: 80, max: 100, standardScore: 105, rank: 3, cohortCount: 12, cohortMean: 70,
    areas: [{ area: "독해", earned: 40, possible: 50, rate: 80, cohortRate: 70 }], wrongCount: 4, blankCount: 0,
    listeningAbsent: false, items: [], active: true, viewCount: 0, createdAt: "2026-09-21T00:00:00.000Z", ...over,
  } as StudentReport;
}

test("학생 열쇠 — 수험번호가 있으면 그것, 없으면 이름+학교", () => {
  assert.equal(studentIdentity(report()), "key:12345");
  assert.equal(studentIdentity(report({ studentKey: null, studentName: "최 유민" })), "name:최유민|미강고 1");
});

test("검색 — 공백·대소문자를 무시한 부분 일치, 숫자만이면 수험번호", () => {
  assert.ok(matchesQuery(report(), "유민"));
  assert.ok(matchesQuery(report({ studentName: "최 유민" }), "최유민"));
  assert.ok(!matchesQuery(report(), "유진"));
  assert.ok(matchesQuery(report(), "12345"));
  assert.ok(matchesQuery(report({ studentKey: "012345" }), "12345"), "앞의 0은 뗀다");
  assert.ok(!matchesQuery(report(), "123"), "수험번호는 전체가 같아야 한다");
  assert.ok(!matchesQuery(report(), "  "));
});

test("검색 결과는 학생 단위 — 동명이인은 학교로 갈리고, 최근 성적표의 반·담임을 쓴다", () => {
  const rows = [
    report({ reportId: "a", examId: "e1", createdAt: "2026-09-21T00:00:00.000Z", className: "미강고1 화목", teacher: "하수정" }),
    report({ reportId: "b", examId: "e2", examDate: "2026-10-20", createdAt: "2026-10-21T00:00:00.000Z", className: "미강고1 월수", teacher: "김선생" }),
    report({ reportId: "c", studentKey: "99999", school: "목동중 2", examDate: "2026-10-01", createdAt: "2026-10-02T00:00:00.000Z" }),
    report({ reportId: "d", studentName: "박유민", studentKey: "55555" }),
    report({ reportId: "e", active: false, studentKey: "77777" }),
  ];
  const out = candidatesFrom(rows, "유민");
  assert.deepEqual(
    out.map((c) => [c.studentName, c.school, c.className, c.teacher, c.reportCount, c.lastExamDate]),
    [
      ["박유민", "미강고 1", "미강고1 화목", "하수정", 1, "2026-09-20"],
      ["최유민", "미강고 1", "미강고1 월수", "김선생", 2, "2026-10-20"],
      ["최유민", "목동중 2", "미강고1 화목", "하수정", 1, "2026-10-01"],
    ],
  );
});

test("담임이 볼 수 있는 유형 — 반배치고사는 열람 권한이 있을 때만", () => {
  assert.ok(visibleExamType("monthly", false));
  assert.ok(visibleExamType("saturday", false));
  assert.ok(!visibleExamType("placement", false));
  assert.ok(visibleExamType("placement", true));
});

test("이력 — 같은 시험의 다시 만든 성적표는 마지막 것만, 유형별로, 최근이 위, 추이는 날짜순", () => {
  const rows = [
    report({ reportId: "old", examId: "e1", raw: 70, createdAt: "2026-09-21T00:00:00.000Z" }),
    report({ reportId: "new", examId: "e1", raw: 80, createdAt: "2026-09-22T00:00:00.000Z" }),
    report({ reportId: "oct", examId: "e2", examTitle: "10월 월말평가", examDate: "2026-10-20", raw: 90, createdAt: "2026-10-21T00:00:00.000Z" }),
    report({ reportId: "tomo", examId: "s1", examType: "saturday", examTitle: "10월 25일 토모", examDate: "2026-10-25", raw: 60, createdAt: "2026-10-26T00:00:00.000Z" }),
    report({ reportId: "dead", examId: "e3", active: false }),
  ];
  const groups = groupHistory(rows);
  assert.deepEqual(groups.map((g) => g.examType), ["monthly", "saturday"]);
  assert.deepEqual(groups[0].rows.map((r) => [r.reportId, r.raw]), [["oct", 90], ["new", 80]]);
  assert.deepEqual(groups[0].points.map((p) => [p.date, p.raw]), [["2026-09-20", 80], ["2026-10-20", 90]]);
  assert.deepEqual(groups[1].rows.map((r) => r.reportId), ["tomo"]);
});

test("머리글 — 가장 최근 성적표의 이름·반·담임, 성적표 수, 마지막 응시일", () => {
  const head = studentHeader([
    report({ reportId: "a", createdAt: "2026-09-21T00:00:00.000Z", className: "미강고1 화목", teacher: "하수정" }),
    report({ reportId: "b", examDate: "2026-10-20", createdAt: "2026-10-21T00:00:00.000Z", className: "미강고1 월수", teacher: "김선생" }),
  ]);
  assert.ok(head);
  assert.equal(head.className, "미강고1 월수");
  assert.equal(head.teacher, "김선생");
  assert.equal(head.reportCount, 2);
  assert.equal(head.lastExamDate, "2026-10-20");
  assert.equal(studentHeader([]), null);
});
