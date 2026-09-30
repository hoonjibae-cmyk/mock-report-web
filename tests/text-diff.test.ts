/**
 * 고친 내역 표시 — 바뀐 글자만 보여 주는가.
 *
 * 실행: npm test
 *
 * 여기서 틀리면 담임이 검토 화면과 슬랙 DM에서 "뭐가 바뀐 거지?"를 알 수 없다.
 * 500자 총평에 띄어쓰기 하나 고친 것을 사람이 찾게 하면 이 기능은 없는 것과 같다.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { describeChange, diffChars } from "../lib/text-diff";

const join = (ops: ReturnType<typeof diffChars>, type: "same" | "del" | "ins") =>
  ops.filter((o) => o.type === type).map((o) => o.text).join("");

test("띄어쓰기 하나 지운 것은 그 한 글자만 지움으로 나온다", () => {
  const ops = diffChars("어휘 학습이 꾸준 합니다.", "어휘 학습이 꾸준합니다.");
  assert.deepEqual(ops, [
    { type: "same", text: "어휘 학습이 꾸준" },
    { type: "del", text: " " },
    { type: "same", text: "합니다." },
  ]);
});

test("글자를 바꾼 것은 지움과 넣음이 나란히", () => {
  const ops = diffChars("이번달 시험은", "이번 달 시험은");
  assert.equal(join(ops, "del"), "");
  assert.equal(join(ops, "ins"), " ");
  assert.equal(join(ops, "same"), "이번달 시험은");
});

test("앞에서부터 읽으면 두 글이 모두 복원된다 — 긴 총평 가운데 오타", () => {
  const before = "◆9월 월말평가 총평◆ ".repeat(3) + "to부정사와 동명사에서는 두 문법의 쓰임을 구분하는 데 어려움을 보인 학생들이 많았습니다." + " 복습해 주기 바랍니다.".repeat(5);
  const after = before.replace("어려움을", "어려움를").replace("많았습니다", "많았 습니다");
  const ops = diffChars(before, after);
  assert.equal(join(ops, "same") + "", ops.filter((o) => o.type !== "ins").map((o) => o.text).join("") === before ? join(ops, "same") : "복원 실패");
  assert.equal(ops.filter((o) => o.type !== "ins").map((o) => o.text).join(""), before);
  assert.equal(ops.filter((o) => o.type !== "del").map((o) => o.text).join(""), after);
  // 바뀌지 않은 글자가 지움/넣음으로 표시되지 않는다 — 지운 글자·넣은 글자가 몇 자뿐이다
  assert.ok(Array.from(join(ops, "del")).length <= 3, `지운 글자: ${JSON.stringify(join(ops, "del"))}`);
  assert.ok(Array.from(join(ops, "ins")).length <= 3, `넣은 글자: ${JSON.stringify(join(ops, "ins"))}`);
});

test("같은 글이면 지움도 넣음도 없다", () => {
  assert.deepEqual(diffChars("같다", "같다"), [{ type: "same", text: "같다" }]);
  assert.deepEqual(diffChars("", ""), []);
});

test("통째로 바뀐 글은 통째로 지움·넣음", () => {
  const ops = diffChars("가나다", "라마바");
  assert.deepEqual(ops, [
    { type: "del", text: "가나다" },
    { type: "ins", text: "라마바" },
  ]);
});

test("이모지·조합 글자도 깨지지 않는다", () => {
  const ops = diffChars("잘했어요 👍", "잘했어요 👍👍");
  assert.equal(join(ops, "ins"), "👍");
  assert.equal(join(ops, "del"), "");
});

test("슬랙 한 줄 — 바뀐 자리 앞뒤만, 긴 글은 …으로", () => {
  const before = "가".repeat(100) + "꾸준 합니다" + "나".repeat(100);
  const after = "가".repeat(100) + "꾸준합니다" + "나".repeat(100);
  const line = describeChange(before, after);
  // 문맥 12자: 앞은 '가'×10 + '꾸준', 뒤는 '합니다' + '나'×9
  assert.equal(line, "“…가가가가가가가가가가꾸준 합니다나나나나나나나나나…” → “…가가가가가가가가가가꾸준합니다나나나나나나나나나…”");
});

test("슬랙 한 줄 — 짧은 글은 통째로, 앞뒤 … 없이", () => {
  assert.equal(describeChange("꾸준 합니다", "꾸준합니다"), "“꾸준 합니다” → “꾸준합니다”");
  assert.equal(describeChange("이번달", "이번 달"), "“이번달” → “이번 달”");
});

test("슬랙 한 줄 — 흩어진 수정은 첫 자리만 보이고 외 n곳", () => {
  const before = "가".repeat(60) + "A" + "나".repeat(60) + "B" + "다".repeat(60) + "C" + "라".repeat(60);
  const after = before.replace("A", "a").replace("B", "b").replace("C", "c");
  const line = describeChange(before, after);
  assert.match(line, /외 2곳$/);
  assert.ok(line.includes("A"), "첫 자리의 지운 글자");
  assert.ok(line.includes("a"), "첫 자리의 넣은 글자");
  assert.ok(!line.includes("B"), "둘째 자리는 싣지 않는다");
});

test("슬랙 한 줄 — 바뀐 곳이 없으면 그냥 두 글", () => {
  assert.equal(describeChange("같다", "같다"), "“같다” → “같다”");
});
