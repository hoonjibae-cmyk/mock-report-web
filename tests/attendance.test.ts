/**
 * 반 인원 대 응시 인원을 맞춰 보는 규칙.
 *
 * 실행: npm test
 *
 * 여기서 틀리면 교수부장이 "이 반은 전원 응시" 라고 믿고 컨펌하는데 실제로는
 * 시험을 안 본 학생이 있거나, 반대로 멀쩡히 시험 본 학생이 미응시로 적힌다.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  attendanceSummary,
  classNamesOf,
  reviewClassNames,
  type ExamTaker,
  type RosterStudent,
} from "../lib/attendance";

const taker = (studentName: string, className: string, studentKey: string | null = null): ExamTaker => ({
  studentName,
  className,
  studentKey,
});

const rosters = (entries: Record<string, RosterStudent[]>) =>
  new Map<string, RosterStudent[]>(Object.entries(entries));

test("카드번호로 맞춘다 — 성적표 없는 재원생이 미응시", () => {
  const out = attendanceSummary(
    [taker("김하늘", "M4 화목 R", "10231"), taker("강여울", "M4 화목 R", "10232")],
    rosters({
      "M4 화목 R": [
        { examNumber: "10231", name: "김하늘" },
        { examNumber: "10232", name: "강여울" },
        { examNumber: "10233", name: "박서준" },
      ],
    }),
  );
  assert.equal(out.classes.length, 1);
  assert.equal(out.classes[0].className, "M4 화목 R");
  assert.equal(out.classes[0].total, 3);
  assert.equal(out.classes[0].present, 2);
  assert.deepEqual(out.classes[0].absent, [{ examNumber: "10233", name: "박서준" }]);
  assert.deepEqual(out.unlisted, []);
});

test("담임이 고른 반이 기준이다 — 성적표에 적힌 반 이름이 달라도 카드번호로 맞는다", () => {
  const out = attendanceSummary(
    [taker("김하늘", "M4화목R", "10231")],
    rosters({ "M4 화목 R": [{ examNumber: "10231", name: "김하늘" }, { examNumber: "10232", name: "강여울" }] }),
    ["M4 화목 R"],
  );
  assert.equal(out.classes[0].present, 1);
  assert.deepEqual(out.classes[0].absent.map((s) => s.name), ["강여울"]);
  assert.deepEqual(out.unlisted, []);
});

test("카드번호가 없으면 이름으로 물러난다 — 띄어쓰기는 무시", () => {
  const out = attendanceSummary(
    [taker("김 하늘", "중2A", null)],
    rosters({ 중2A: [{ examNumber: "", name: "김하늘" }, { examNumber: "", name: "이서연" }] }),
  );
  assert.equal(out.classes[0].present, 1);
  assert.deepEqual(out.classes[0].absent.map((s) => s.name), ["이서연"]);
});

test("명단에는 번호가 있고 성적표에는 없어도 이름으로 맞는다", () => {
  const out = attendanceSummary(
    [taker("김하늘", "중2A", null)],
    rosters({ 중2A: [{ examNumber: "10231", name: "김하늘" }] }),
  );
  assert.equal(out.classes[0].present, 1);
  assert.deepEqual(out.unlisted, []);
});

test("동명이인은 카드번호로 갈린다 — 이름이 같아도 번호가 다르면 미응시", () => {
  const out = attendanceSummary(
    [taker("김민수", "중2A", "10001")],
    rosters({ 중2A: [{ examNumber: "10001", name: "김민수" }, { examNumber: "10002", name: "김민수" }] }),
  );
  assert.equal(out.classes[0].present, 1);
  assert.deepEqual(out.classes[0].absent, [{ examNumber: "10002", name: "김민수" }]);
});

test("성적표는 있는데 어느 명단에도 없는 학생은 따로 알린다 — 전반·퇴원·이름 불일치", () => {
  const out = attendanceSummary(
    [taker("김하늘", "중2A", "10231"), taker("전반생", "중2A", "10999")],
    rosters({ 중2A: [{ examNumber: "10231", name: "김하늘" }] }),
  );
  assert.equal(out.classes[0].total, 1);
  assert.equal(out.classes[0].present, 1);
  assert.deepEqual(out.unlisted, ["전반생"]);
});

test("두 반을 고른 시험 — 한 반에서 맞은 학생은 다른 반의 '명단 밖'이 아니다", () => {
  const out = attendanceSummary(
    [taker("가", "A", "1"), taker("나", "B", "2")],
    rosters({ A: [{ examNumber: "1", name: "가" }], B: [{ examNumber: "2", name: "나" }, { examNumber: "3", name: "다" }] }),
    ["A", "B"],
  );
  assert.deepEqual(out.classes.map((c) => `${c.className}:${c.present}/${c.total}`), ["A:1/1", "B:1/2"]);
  assert.deepEqual(out.unlisted, []);
});

test("명단을 못 가져온 반은 결과에서 빠진다 — 모르는 것을 전원 응시로 보이지 않게", () => {
  const out = attendanceSummary(
    [taker("김하늘", "중2A", "10231"), taker("박서준", "중2B", "10300")],
    rosters({ 중2A: [{ examNumber: "10231", name: "김하늘" }] }),
    ["중2A", "중2B"],
  );
  assert.deepEqual(out.classes.map((c) => c.className), ["중2A"]);
  // 중2B 명단이 없으니 박서준이 '명단 밖'인지도 알 수 없다 — 그래도 적는다(검수자가 볼 수 있게)
  assert.deepEqual(out.unlisted, ["박서준"]);
});

test("명단을 하나도 못 가져오면 반 줄도, 명단 밖 목록도 비어 있다", () => {
  const out = attendanceSummary([taker("가", "A", "1")], rosters({}), ["A"]);
  assert.deepEqual(out.classes, []);
  assert.deepEqual(out.unlisted, []);
});

test("검수할 반 — 담임이 고른 반이 있으면 그것, 없으면 성적표에 적힌 반", () => {
  const takers = [taker("가", "중2A"), taker("나", "  "), taker("다", "중2A"), taker("라", "중2B")];
  assert.deepEqual(classNamesOf(takers), ["중2A", "중2B"]);
  assert.deepEqual(reviewClassNames(["M4 화목 R", " M4 화목 R ", ""], takers), ["M4 화목 R"]);
  assert.deepEqual(reviewClassNames([], takers), ["중2A", "중2B"]);
});

test("미응시·명단 밖 이름은 이름순", () => {
  const out = attendanceSummary(
    [taker("하늘", "중2A", "3"), taker("최민준", "중2A", "9"), taker("강서연", "중2A", "8")],
    rosters({
      중2A: [
        { examNumber: "1", name: "최지우" },
        { examNumber: "2", name: "강여울" },
        { examNumber: "3", name: "하늘" },
      ],
    }),
  );
  assert.deepEqual(out.classes[0].absent.map((s) => s.name), ["강여울", "최지우"]);
  assert.deepEqual(out.unlisted, ["강서연", "최민준"]);
});
