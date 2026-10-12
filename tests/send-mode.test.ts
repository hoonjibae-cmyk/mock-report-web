/**
 * 알림톡 받는 사람 고르기 — 학부모만 / 학부모 + 학생 / 학생만.
 *
 * 실행: npm test
 *
 * 발송은 되돌릴 수 없다. 여기서 틀리면 '학생만'을 골랐는데 학부모가 한 번 더
 * 받거나, 학생 번호가 없는 학생이 학부모 번호로 대신 나가거나, 이미 받은
 * 학부모가 '안 보낸 학생 전체'에 다시 들어간다.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { RecipientSlot, SendTarget } from "../lib/report-send";
import type { RecipientType, SendSummary } from "../lib/report-messages";
import {
  SEND_MODES,
  SEND_MODE_LABELS,
  channelsFor,
  hasUnsentChannel,
  includesRecipient,
  recipientCountText,
  recipientsOf,
} from "../lib/send-mode";

const SENT: SendSummary = { sent: true, lastAt: "2026-10-12T05:00:00.000Z", lastStatus: "sent", attempts: 1, lastError: null };

function slot(type: RecipientType, over: Partial<RecipientSlot> = {}): RecipientSlot {
  return { type, phoneMasked: "010-****-1234", blocked: null, history: null, ...over };
}

function target(over: Partial<SendTarget> = {}): SendTarget {
  return {
    reportId: "r1",
    token: "tok1",
    studentName: "김민준",
    studentKey: "1023",
    className: "중3A",
    parent: slot("parent"),
    student: slot("student"),
    ...over,
  };
}

test("세 가지 모드 — 화면 순서와 이름, 각각 누구에게 가는가", () => {
  assert.deepEqual([...SEND_MODES], ["parent", "both", "student"], "기본인 학부모만이 맨 앞");
  assert.equal(SEND_MODE_LABELS.student, "학생만");
  assert.deepEqual(recipientsOf("parent"), ["parent"]);
  assert.deepEqual(recipientsOf("both"), ["parent", "student"]);
  assert.deepEqual(recipientsOf("student"), ["student"]);
  assert.equal(includesRecipient("student", "parent"), false, "학생만에서는 학부모 열이 빠진다");
  assert.equal(includesRecipient("parent", "student"), false);
  assert.equal(includesRecipient("both", "student"), true);
});

test("학생만 — 학부모 번호가 있어도 학부모에게는 나가지 않는다", () => {
  // 학부모에게 먼저 보낸 뒤 학생에게 따로 보내는 자리다. 여기서 학부모가 섞이면
  // 같은 성적표를 두 번 받는다.
  const t = target();
  assert.deepEqual(channelsFor(t, "student"), ["student"]);
  assert.deepEqual(channelsFor(t, "parent"), ["parent"]);
  assert.deepEqual(channelsFor(t, "both"), ["parent", "student"]);
});

test("학생 번호가 없으면 학생만에서는 보낼 곳이 없다 — 학부모로 대신 보내지 않는다", () => {
  const t = target({ student: slot("student", { phoneMasked: null, blocked: "학생 본인 연락처가 등록되어 있지 않습니다." }) });
  assert.deepEqual(channelsFor(t, "student"), [], "고를 수 없는 줄이 된다");
  assert.deepEqual(channelsFor(t, "both"), ["parent"], "학부모 + 학생에서는 학부모에게만");
  assert.equal(hasUnsentChannel(t, "student"), false);
});

test("안 보낸 학생 — 모드에 있는 수신자의 기록만 본다", () => {
  // 학부모는 이미 받았고 학생은 아직인 학생: '학생만'·'학부모 + 학생'에서는
  // 안 보낸 학생이고, '학부모만'에서는 이미 보낸 학생이다.
  const t = target({ parent: slot("parent", { history: SENT }) });
  assert.equal(hasUnsentChannel(t, "student"), true);
  assert.equal(hasUnsentChannel(t, "both"), true);
  assert.equal(hasUnsentChannel(t, "parent"), false, "학부모만에서 다시 기본 선택되면 중복 발송이다");

  const bothSent = target({ parent: slot("parent", { history: SENT }), student: slot("student", { history: SENT }) });
  assert.equal(hasUnsentChannel(bothSent, "student"), false);
  assert.equal(hasUnsentChannel(bothSent, "both"), false);
});

test("건수 문구는 모드에 있는 쪽만 적는다", () => {
  assert.equal(recipientCountText("parent", 3, 2), "학부모 3명");
  assert.equal(recipientCountText("both", 3, 2), "학부모 3명 · 학생 2명");
  assert.equal(recipientCountText("student", 3, 2), "학생 2명", "학생만에서 학부모 수가 보이면 헷갈린다");
});
