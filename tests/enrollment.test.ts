/**
 * 반배치고사 신규생 — 답안지 '재원 구분' 칸과 전화번호 뒤 4자리 맞추기.
 *
 * 실행: npm test
 *
 * 신규생은 수험번호(출결번호)가 없어 수험번호 칸에 전화번호 뒤 4자리를 쓴다. 그 숫자를
 * 수험번호로 오해하면 엉뚱한 학생에게 성적표가 간다. 여기서 틀리면 그 사고가 조용히 난다.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { enrollmentOf, isNewStudentScan } from "../lib/placement-policy";
import { reviewVerdict, type ReviewContext } from "../lib/omr-review";
import { scanKey, type OmrScan } from "../lib/omr-scans";
import { enrollmentRead, enrollmentReadLabel, mergeScheduleFlags } from "../lib/schedule-read";
import { parsePhoneMatches } from "../lib/student-directory";

function scan(over: Partial<OmrScan> = {}): OmrScan {
  return {
    id: over.id ?? "s1",
    examId: "e1",
    filename: "scan.jpg",
    scanPath: null,
    previewPath: null,
    studentId: "1234",
    studentIdQr: null,
    studentIdBubbles: "1234",
    answers: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i + 1), 3])),
    essayScores: {},
    essayScoreSources: {},
    essayAnswers: {},
    essayCrops: {},
    reviewFlags: [],
    readConfidence: { uncertain: [], multiMarked: [], idUncertain: false, idConflict: false },
    status: "pending",
    reviewedBy: null,
    listeningMode: null,
    readError: null,
    createdAt: "",
    updatedAt: "",
    ...over,
  };
}

const flag = (over: Record<string, unknown>) => ({ type: "enrollment", ...over });

test("재원 구분은 답안지 보기 그대로만 받고, 확정된 '신규생'만 신규생이다", () => {
  assert.equal(enrollmentOf("신규생"), "신규생");
  assert.equal(enrollmentOf("재원생"), "재원생");
  assert.equal(enrollmentOf("신입"), null);
  assert.ok(isNewStudentScan({ enrollment: "신규생" }));
  // 비었거나 못 읽은 답안지는 재원생이다 — 수험번호로 찾는다
  assert.ok(!isNewStudentScan({ enrollment: null }));
  assert.ok(!isNewStudentScan({}));
});

test("학생 열쇠 — 맞춘 열쇠가 있으면 그것, 없으면 수험번호 칸 그대로", () => {
  assert.equal(scanKey({ studentId: "1234", studentKey: null }), "1234");
  assert.equal(scanKey({ studentId: "1234", studentKey: "sc55" }), "sc55");
  assert.equal(scanKey({ studentId: "1234", studentKey: "10231" }), "10231");
  assert.equal(scanKey({ studentId: "1234", studentKey: "  " }), "1234");
  assert.equal(scanKey({ studentId: null }), null);
});

test("재원 구분 판독 상태 — 확정·흐림·겹침·빈칸·안 읽음", () => {
  assert.deepEqual(enrollmentRead({ enrollment: "신규생", reviewFlags: [] }), { kind: "read", value: "신규생" });

  const faint = enrollmentRead({
    enrollment: null,
    reviewFlags: [flag({ status: "ok", certain: false, candidate: "신규생", selected: ["신규생"] })],
  });
  assert.equal(faint.kind, "uncertain");
  assert.match(enrollmentReadLabel(faint), /흐려 ‘신규생’/);
  assert.match(enrollmentReadLabel(faint), /눌러 주세요/);

  const doubled = enrollmentRead({
    enrollment: null,
    reviewFlags: [flag({ status: "multiple", certain: true, candidate: "재원생", selected: ["재원생", "신규생"] })],
  });
  assert.match(enrollmentReadLabel(doubled), /둘 다 표기/);

  const blank = enrollmentRead({ enrollment: null, reviewFlags: [flag({ status: "blank", certain: true, candidate: null })] });
  assert.deepEqual(blank, { kind: "blank" });
  assert.match(enrollmentReadLabel(blank), /재원생으로 봅니다/);

  const unread = enrollmentRead({ enrollment: null, reviewFlags: [{ type: "preferred_schedule", status: "blank" }] });
  assert.deepEqual(unread, { kind: "unread" });
});

test("다시 읽기는 선호 요일·재원 구분 플래그를 함께 갈아 끼운다", () => {
  const merged = mergeScheduleFlags(
    [{ type: "question", no: 2 }, { type: "preferred_schedule", status: "blank" }, flag({ status: "blank" })],
    [flag({ status: "ok", certain: false, candidate: "신규생" })],
  );
  assert.deepEqual(merged, [{ type: "question", no: 2 }, flag({ status: "ok", certain: false, candidate: "신규생" })]);
});

test("전화번호 뒤 4자리 응답 — 물어본 번호마다 후보 목록, 열쇠는 reportKey", () => {
  const matches = parsePhoneMatches(
    [
      {
        suffix: "7788",
        students: [
          { reportKey: "sc7", examNumber: "", name: "응시신규", school: "목운중", grade: "1", schoolLevel: "중등", parentPhone: "010-5555-7788", studentPhone: "", className: "응시반", teacher: "", status: "재원", regularEnrolled: false },
          { reportKey: "10231", examNumber: "10231", name: "카드있음", school: "목운중", grade: "3", parentPhone: "010-1111-7788", studentPhone: "", className: "응시반", teacher: "", status: "재원" },
        ],
      },
      { suffix: "9999", students: "이상한 값" },
      { suffix: "0001", students: [] },
    ],
    ["7788", "0001", "4455"],
  );
  assert.deepEqual([...matches.keys()], ["7788", "0001", "4455"], "물어본 번호만, 전부");
  const list = matches.get("7788")!;
  assert.deepEqual(list.map((s) => s.reportKey), ["sc7", "10231"]);
  assert.equal(list[0].examNumber, "", "카드번호가 없으면 빈 값 그대로");
  assert.equal(list[0].name, "응시신규");
  assert.equal(list[0].parentPhone, "010-5555-7788");
  assert.equal(list[0].regularEnrolled, false);
  assert.deepEqual(matches.get("4455"), [], "응답에 없던 번호는 빈 목록");
});

test("명부 대조 — 신규생의 수험번호 칸은 전화번호라 명부에 없어도 붙잡지 않는다", () => {
  const ctx: ReviewContext = { numQuestions: 10, idDigits: 5, knownIds: new Set(["20001"]) };
  const codes = (s: OmrScan) => reviewVerdict(s, ctx).reasons.map((r) => String(r.code));
  // 재원생 답안지의 모르는 수험번호는 여전히 붙잡는다
  assert.ok(codes(scan({ enrollment: "재원생" })).includes("unknownId"));
  assert.ok(codes(scan({ enrollment: null })).includes("unknownId"));
  // 신규생은 아니다 — 성적표 화면에서 전화번호로 찾는다
  assert.equal(reviewVerdict(scan({ enrollment: "신규생" }), ctx).auto, true);
});

test("재원 구분에 둘 다 표기된 답안지는 사람이 본다", () => {
  const s = scan({ reviewFlags: [flag({ status: "multiple", certain: true, candidate: "재원생", selected: ["재원생", "신규생"] })] });
  const v = reviewVerdict(s, { numQuestions: 10, idDigits: 5 });
  assert.equal(v.auto, false);
  assert.ok(v.reasons.some((r) => r.code === "enrollmentUnclear"));
  // 흐리기만 한 표기는 붙잡지 않는다 — 기본(재원생)으로 두고 성적표 화면에서 고친다
  const faint = scan({ reviewFlags: [flag({ status: "ok", certain: false, candidate: "신규생" })] });
  assert.equal(reviewVerdict(faint, { numQuestions: 10, idDigits: 5 }).auto, true);
});
