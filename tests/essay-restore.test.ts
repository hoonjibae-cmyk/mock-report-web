/**
 * 보관된 원본으로 손글씨 칸 이미지를 다시 만들 때의 규칙.
 *
 * 실행: npm test
 *
 * 여기서 틀리면 다른 학생의 손글씨 이미지가 이 학생에게 붙는다. 예전 버전에서는
 * 같은 이름의 파일이 보관함에서 서로를 덮어썼기 때문에, 원본이 정말 이 답안지의
 * 것인지 수험번호 마킹과 답안으로 맞춰 본다.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { missingEssayKeys, sameSheet } from "../lib/essay-restore-rules";
import { baseFilename, batchUploadName, rereadGroups, splitBatchName } from "../lib/schedule-read";

const KEYS = ["26", "27"];

function answers(marks: Array<number | number[] | null>): Record<string, number | number[] | null> {
  return Object.fromEntries(marks.map((mark, i) => [String(i + 1), mark]));
}

test("다시 만들 칸 — 아직 읽지 않았는데 칸 이미지도 없는 문항만", () => {
  assert.deepEqual(missingEssayKeys({ essayAnswers: {}, essayCrops: {} }, KEYS), ["26", "27"]);
  assert.deepEqual(missingEssayKeys({ essayAnswers: {}, essayCrops: { "26": "p" } }, KEYS), ["27"]);
  // 이미 읽은 칸(선생님이 고친 글 포함)은 이미지가 없어도 다시 만들 필요가 없다
  assert.deepEqual(missingEssayKeys({ essayAnswers: { "27": "" }, essayCrops: {} }, KEYS), ["26"]);
  assert.deepEqual(missingEssayKeys({}, KEYS), ["26", "27"]);
});

test("같은 종이 — 수험번호 마킹과 답안이 맞으면 쓴다", () => {
  const stored = { studentIdBubbles: "5678", answers: answers([1, 2, 3, 4, 5, 1, 2, [2, 4], null, 3]) };
  const reread = {
    student_id_bubbles: "5678",
    answers: { "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 1, "7": 2, "8": null, "9": null, "10": 3 },
    selections: { "8": [4, 2] },
  };
  assert.deepEqual(sameSheet(stored, reread, 10), { same: true });
});

test("수험번호 마킹이 다르면 다른 종이다 — 답이 비슷해도 쓰지 않는다", () => {
  const marks = answers([1, 2, 3, 4, 5, 1]);
  const check = sameSheet(
    { studentIdBubbles: "5678", answers: marks },
    { student_id_bubbles: "1234", answers: { "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 1 } },
    6,
  );
  assert.equal(check.same, false);
  assert.match(check.reason ?? "", /수험번호/);
});

test("답이 많이 다르면 다른 종이다 — 검수 때 고친 몇 문항은 봐준다", () => {
  const stored = { studentIdBubbles: "2651?", answers: answers([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]) };
  // 10문항 중 8문항 일치(80%) — 같은 종이로 본다(수험번호는 끝자리가 흐려 비교하지 않는다)
  const close = { student_id_bubbles: "2651", answers: { ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => [String(i + 1), 1])), "9": 2, "10": 3 } };
  assert.equal(sameSheet(stored, close, 10).same, true);
  // 10문항 중 5문항 일치 — 다른 종이
  const far = { student_id_bubbles: "2651", answers: { ...Object.fromEntries(Array.from({ length: 5 }, (_, i) => [String(i + 1), 1])), "6": 2, "7": 2, "8": 2, "9": 2, "10": 2 } };
  const check = sameSheet(stored, far, 10);
  assert.equal(check.same, false);
  assert.match(check.reason ?? "", /5\/10/);
});

test("수험번호도 맞출 수 없고 비교할 답도 적으면 쓰지 않는다", () => {
  const check = sameSheet(
    { studentIdBubbles: null, answers: answers([1, null, null]) },
    { student_id_bubbles: null, answers: { "1": 1 } },
    3,
  );
  assert.equal(check.same, false);
  // 수험번호가 맞으면 답이 적어도 쓴다(거의 빈 답안지)
  assert.equal(
    sameSheet({ studentIdBubbles: "5678", answers: answers([1]) }, { student_id_bubbles: "5678", answers: { "1": 1 } }, 1).same,
    true,
  );
});

test("원본 단위 묶음 — PDF 여러 쪽은 원본 하나, 원본이 없는 답안지는 따로", () => {
  const { groups, missing } = rereadGroups([
    { filename: "권세빈.jpg", scanPath: null },
    { filename: "Scan0001.pdf#p1", scanPath: "e1/aaaa_Scan0001.pdf" },
    { filename: "Scan0001.pdf#p2", scanPath: "e1/aaaa_Scan0001.pdf" },
    // 다른 사람이 올린 같은 이름의 파일 — 보관 경로가 달라 다른 묶음이다
    { filename: "Scan0001.pdf#p1", scanPath: "e1/bbbb_Scan0001.pdf" },
  ]);
  assert.deepEqual(missing, ["권세빈.jpg"]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].filenames, ["Scan0001.pdf#p1", "Scan0001.pdf#p2"]);
  assert.equal(groups[0].uploadName, "Scan0001.pdf");
  assert.equal(baseFilename("Scan0001.pdf#p12"), "Scan0001.pdf");
});

test("한 요청에 넣는 이름 — 같은 이름의 원본도 겹치지 않고, 결과는 원래 이름으로 되돌린다", () => {
  const a = batchUploadName(0, "Scan0001.pdf");
  const b = batchUploadName(1, "Scan0001.pdf");
  assert.notEqual(a, b);
  assert.ok(a.endsWith(".pdf"), "PDF 확장자는 그대로 — 엔진이 쪽으로 나눈다");
  assert.deepEqual(splitBatchName(`${b}#p3`), { index: 1, filename: "Scan0001.pdf#p3" });
  assert.deepEqual(splitBatchName(batchUploadName(12, "권세빈.jpg")), { index: 12, filename: "권세빈.jpg" });
  assert.equal(splitBatchName("Scan0001.pdf#p1"), null);
});
