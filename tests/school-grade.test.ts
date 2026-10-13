/**
 * 학교·학년 글에서 학년 읽기와 응시 학년 범위 문장.
 *
 * 실행: npm test
 *
 * 여기서 틀리면 토요모의고사 성적표에 "고1부터 중1까지" 같은 거꾸로 된 문장이
 * 나가거나, 학교 이름 가운데의 '고'('고척중')를 고등학교로 읽는다.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { gradeOrder, gradeRange, gradeRangeSentence, parseSchoolGrade } from "../lib/school-grade";

test("학교 칸에서 학년을 읽는다 — 학교 이름 뒤의 학년, 학교급은 바로 앞 글자", () => {
  assert.deepEqual(parseSchoolGrade("은가람중 2"), { level: "중", grade: 2 });
  assert.deepEqual(parseSchoolGrade("양정고 1"), { level: "고", grade: 1 });
  assert.deepEqual(parseSchoolGrade("목운중학교 3"), { level: "중", grade: 3 });
  assert.deepEqual(parseSchoolGrade("서울고등학교 2학년"), { level: "고", grade: 2 });
  assert.deepEqual(parseSchoolGrade("중2"), { level: "중", grade: 2 });
  assert.deepEqual(parseSchoolGrade("목동초 6"), { level: "초", grade: 6 });
  assert.deepEqual(parseSchoolGrade("고척중 2"), { level: "중", grade: 2 }, "이름 가운데의 '고'에 속지 않는다");
});

test("학년을 못 읽는 글은 null — 숫자만, 학년 없음, 범위 밖", () => {
  assert.equal(parseSchoolGrade("2"), null, "학교급을 모르면 중2인지 고2인지 알 수 없다");
  assert.equal(parseSchoolGrade("은가람중"), null);
  assert.equal(parseSchoolGrade("중4"), null);
  assert.equal(parseSchoolGrade(""), null);
  assert.equal(parseSchoolGrade(null), null);
});

test("학년 순서 — 초6 < 중1 < 중3 < 고1", () => {
  const order = (t: string) => gradeOrder(parseSchoolGrade(t)!);
  assert.ok(order("초6") < order("중1"));
  assert.ok(order("중3") < order("고1"));
  assert.ok(order("중1") < order("중2"));
});

test("응시 학년 범위 — 가장 낮은 학년부터 가장 높은 학년까지, 못 읽은 학생은 빼고 센다", () => {
  const range = gradeRange(["은가람중 2", "양정고 1", "미강중 1", "", "2", "윤슬중 3"]);
  assert.deepEqual(range, { min: "중1", max: "고1", count: 4 });
  assert.equal(gradeRange(["", null, "3"]), null, "하나도 못 읽으면 범위가 없다");
});

test("문장 — 학년이 섞여 있을 때만 적는다", () => {
  assert.equal(
    gradeRangeSentence({ min: "중1", max: "고1" }),
    "중1부터 고1까지 응시한 시험으로 다소 평균이 낮을 수 있습니다.",
  );
  assert.equal(gradeRangeSentence({ min: "중2", max: "중2" }), "", "한 학년만 본 시험이면 평균이 낮은 까닭이 아니다");
  assert.equal(gradeRangeSentence(null), "");
});
