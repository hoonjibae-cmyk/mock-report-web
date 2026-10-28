/**
 * 담임 의견에서 학생을 부르는 법 — '김도영은' → '김도영 학생은'.
 *
 * 실행: npm test
 */
import assert from "node:assert/strict";
import test from "node:test";

import { withStudentTitle } from "../lib/student-honorific";

test("이름 뒤 조사 앞에 '학생'을 끼운다", () => {
  assert.equal(withStudentTitle("김도영은 이번 시험에서 82점을 받았습니다.", "김도영"), "김도영 학생은 이번 시험에서 82점을 받았습니다.");
  assert.equal(withStudentTitle("김도영이 맞힌 문항", "김도영"), "김도영 학생이 맞힌 문항");
  assert.equal(withStudentTitle("김도영의 강점은", "김도영"), "김도영 학생의 강점은");
  assert.equal(withStudentTitle("김도영에게 권합니다", "김도영"), "김도영 학생에게 권합니다");
  assert.equal(withStudentTitle("김도영도 잘했습니다", "김도영"), "김도영 학생도 잘했습니다");
});

test("받침 없는 이름은 '학생'에 맞춰 조사를 바꾼다", () => {
  assert.equal(withStudentTitle("이수는 듣기에서", "이수"), "이수 학생은 듣기에서");
  assert.equal(withStudentTitle("이수가 맞힌", "이수"), "이수 학생이 맞힌");
  assert.equal(withStudentTitle("이수를 보면", "이수"), "이수 학생을 보면");
  assert.equal(withStudentTitle("이수와 함께", "이수"), "이수 학생과 함께");
  assert.equal(withStudentTitle("이수로 인해", "이수"), "이수 학생으로 인해");
});

test("이미 '학생'이 붙어 있으면 그대로, 본문 전체에서 여러 번 바꾼다", () => {
  assert.equal(withStudentTitle("김도영 학생은 잘했습니다.", "김도영"), "김도영 학생은 잘했습니다.");
  assert.equal(
    withStudentTitle("김도영은 잘했고, 김도영의 독해는 좋았습니다. 김도영 학생이 다음에는", "김도영"),
    "김도영 학생은 잘했고, 김도영 학생의 독해는 좋았습니다. 김도영 학생이 다음에는",
  );
});

test("다른 이름의 일부이거나 조사가 다음 낱말의 첫 글자면 손대지 않는다", () => {
  assert.equal(withStudentTitle("박김도영은 다른 학생입니다", "김도영"), "박김도영은 다른 학생입니다");
  assert.equal(withStudentTitle("김도영이네 반", "김도영"), "김도영이네 반");
  assert.equal(withStudentTitle("김도영", "김도영"), "김도영");
});

test("이름이 없거나 한 글자면 아무것도 바꾸지 않는다", () => {
  assert.equal(withStudentTitle("김은 좋은 학생", "김"), "김은 좋은 학생");
  assert.equal(withStudentTitle("김도영은", ""), "김도영은");
  assert.equal(withStudentTitle("", "김도영"), "");
});
