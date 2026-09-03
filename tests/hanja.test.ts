/**
 * AI가 만든 글에서 한자를 걷어내는지 확인한다.
 *
 * 실행: npm test
 *
 * 학부모가 읽는 글은 한글로만 나가야 한다. 프롬프트로 "한자를 쓰지 말라"고
 * 해도 모델은 가끔 섞어 내므로, 받은 뒤에 한 번 더 거르는 쪽이 실제 방어선이다.
 * 여기서 지키는 것은 그 방어선이다.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { containsHanja, stripHanja } from "../lib/review-sanitizer";

test("실제로 나갔던 문장에서 한자가 사라지고 뜻이 남는다", () => {
  // 화면에 그대로 떴던 문장이다.
  const before =
    "점수 폭이 넓어, 학습 내용을 안정적으로 적용한 학생과 보완이 필요한 학생之間의 차이가 확인되었습니다.";
  assert.equal(
    stripHanja(before),
    "점수 폭이 넓어, 학습 내용을 안정적으로 적용한 학생과 보완이 필요한 학생의 차이가 확인되었습니다.",
  );
});

test("한자를 지운 자리에 어색한 공백이나 빈 괄호가 남지 않는다", () => {
  assert.equal(stripHanja("약 30문항 中 5문항"), "약 30문항 5문항");
  assert.equal(stripHanja("정답률이 낮았습니다 等."), "정답률이 낮았습니다.");
  // 한자만 들어 있던 괄호는 통째로 없앤다 — '듣기() 영역'이 남으면 더 어색하다
  assert.equal(stripHanja("듣기(聽解) 영역"), "듣기 영역");
});

test("한글·숫자·영어·기호는 건드리지 않는다", () => {
  const text = "30문항, 평균 70.4점 (최고 96점 / 최저 36점) — reading·listening 영역 50%";
  assert.equal(stripHanja(text), text, "멀쩡한 글자를 지우면 안 된다");
});

test("한자가 섞였는지 알아낸다", () => {
  assert.equal(containsHanja("학생之間의 차이"), true);
  assert.equal(containsHanja("학생 사이의 차이"), false);
  assert.equal(containsHanja(""), false);
  assert.equal(containsHanja(null as unknown as string), false);
});
