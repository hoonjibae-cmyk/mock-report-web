/**
 * 성적표 잠금 화면에 띄우는 번호 테스트.
 *
 * 실행: npm test
 *
 * 여기서 틀리면 **열쇠가 화면에 인쇄된다.** 잠금 열쇠는 학부모 휴대전화
 * 뒤 4자리이므로, 화면에 뜨는 번호에 그 네 자리가 섞이는 순간 링크만 받은
 * 사람도 성적표를 그대로 열 수 있다. 실제로 한 번 그랬던 자리다.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { gatePhoneHint, maskPhoneForGate, phoneLast4 } from "../lib/utils";

test("잠금 화면용 마스킹은 뒤 4자리를 가린다", () => {
  assert.equal(maskPhoneForGate("010-1234-5678"), "010-1234-****");
  assert.equal(maskPhoneForGate("01012345678"), "010-1234-****");
  // 10자리 번호도 뒤 4자리만 가린다
  assert.equal(maskPhoneForGate("011-123-4567"), "011-123-****");
});

test("마스킹 결과에 열쇠가 섞여 있지 않다", () => {
  // 이 테스트가 이 파일의 존재 이유다.
  for (const phone of ["010-1234-5678", "01087654321", "011-123-4567"]) {
    const masked = maskPhoneForGate(phone);
    const key = phoneLast4(phone);
    assert.ok(key.length === 4, `${phone} 의 열쇠를 못 구했다`);
    assert.ok(
      !masked.includes(key),
      `${phone} → ${masked} 에 열쇠 ${key} 가 들어 있다`,
    );
  }
});

test("번호가 없거나 짧으면 아무것도 만들지 않는다", () => {
  assert.equal(maskPhoneForGate(""), "");
  assert.equal(maskPhoneForGate(null), "");
  assert.equal(maskPhoneForGate("1234"), "***");
});

test("예전 형식은 화면에 내보내지 않는다", () => {
  // 예전 성적표는 가운데를 가리고 뒷자리를 드러낸 채 저장돼 있다.
  // 그 네 자리가 곧 열쇠라, 형식이 맞지 않는 값은 통째로 버린다.
  assert.equal(gatePhoneHint("010-****-4316"), "", "예전 형식은 막아야 한다");
  assert.equal(gatePhoneHint("010-1234-****"), "010-1234-****", "새 형식은 통과");
  assert.equal(gatePhoneHint("011-123-****"), "011-123-****", "10자리도 통과");
});

test("이상한 값은 조용히 버린다", () => {
  // 잠금 화면은 학부모가 보는 곳이라, 깨진 값을 띄우느니 아무것도 안 띄우는 편이 낫다.
  for (const bad of [null, undefined, "", "***", "010-1234-5678", "몰라요", "010****"]) {
    assert.equal(gatePhoneHint(bad), "", `${String(bad)} 는 버려야 한다`);
  }
});
