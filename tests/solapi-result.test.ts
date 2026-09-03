/**
 * 대행사 응답을 발송 결과로 되짚는 테스트.
 *
 * 실행: npm test
 *
 * 여기서 틀리면 **멀쩡히 나간 알림톡이 '실패'로 남는다.** 그러면 선생님이
 * 다시 보내고 학부모는 같은 메시지를 두 번 받는다. 실제로 그랬던 자리다.
 *
 * 이 파일은 fetch를 가짜로 바꿔 응답 모양만 바꿔 가며 확인한다. 대행사에
 * 실제로 보내지 않는다.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { sendAlimtalk } from "../lib/messaging/solapi";

const ENV = {
  SOLAPI_API_KEY: "k",
  SOLAPI_API_SECRET: "s",
  SOLAPI_PFID: "KA01PF000",
  SOLAPI_TEMPLATE_ID: "KA01TP000",
  SOLAPI_SENDER: "0317943306",
};

function recipients() {
  return [
    { phone: "01011112222", key: "r1:parent", variables: {} },
    { phone: "01033334444", key: "r2:parent", variables: {} },
  ];
}

/** 응답 본문을 정해 두고 sendAlimtalk을 돌린다 */
async function withResponse(body: unknown, run: () => Promise<void>) {
  const realFetch = globalThis.fetch;
  const realEnv: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(ENV)) {
    realEnv[key] = process.env[key];
    process.env[key] = value;
  }
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), { status: 200 })) as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = realFetch;
    for (const [key, value] of Object.entries(realEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("응답 모양을 모르더라도 접수된 건을 실패로 적지 않는다", async () => {
  // 이것이 실제로 났던 사고다. 대행사가 요청을 받아들였는데(HTTP 200) 응답에
  // messageList가 없거나 우리 예상과 달라, 나간 알림톡이 전부 '실패'로 남았다.
  await withResponse({ groupInfo: { count: { total: 2 } } }, async () => {
    const results = await sendAlimtalk(recipients());
    assert.equal(results.length, 2);
    assert.ok(
      results.every((r) => r.ok),
      `접수된 건이 실패로 기록됐다: ${JSON.stringify(results)}`,
    );
    assert.ok(results.every((r) => r.error === null));
  });
});

test("번호를 다른 모양으로 돌려줘도 되짚는다", async () => {
  // 하이픈이나 국가번호(82)가 붙어 오면 예전 코드는 되짚기가 통째로 빗나갔다.
  await withResponse(
    {
      messageList: [
        { to: "010-1111-2222", type: "ATA", messageId: "M1" },
        { to: "+821033334444", type: "SMS", messageId: "M2" },
      ],
    },
    async () => {
      const results = await sendAlimtalk(recipients());
      const byKey = new Map(results.map((r) => [r.key, r]));
      assert.equal(byKey.get("r1:parent")?.channel, "alimtalk");
      assert.equal(byKey.get("r1:parent")?.messageId, "M1");
      // 알림톡이 안 닿아 문자로 대체된 것도 구분해야 한다
      assert.equal(byKey.get("r2:parent")?.channel, "sms");
      assert.ok(results.every((r) => r.ok));
    },
  );
});

test("대행사가 실패라고 말한 건만 실패로 적는다", async () => {
  await withResponse(
    {
      messageList: [{ to: "01011112222", type: "ATA", messageId: "M1" }],
      failedMessageList: [
        { to: "01033334444", statusMessage: "수신자가 채널을 차단했습니다." },
      ],
    },
    async () => {
      const byKey = new Map((await sendAlimtalk(recipients())).map((r) => [r.key, r]));
      assert.equal(byKey.get("r1:parent")?.ok, true);
      assert.equal(byKey.get("r2:parent")?.ok, false);
      assert.match(byKey.get("r2:parent")?.error ?? "", /차단/);
    },
  );
});

test("실패가 있는데 누구인지 못 짚으면 성공으로 넘기지 않는다", async () => {
  // 실패를 알렸는데 번호를 맞출 수 없다면, 어딘가에 실패가 섞여 있다는 뜻이다.
  // 그때까지 '다 나갔다'고 적으면 못 받은 학부모를 영영 모른다.
  await withResponse(
    { failedMessageList: [{ statusMessage: "알 수 없는 오류" }] },
    async () => {
      const results = await sendAlimtalk(recipients());
      assert.ok(results.every((r) => !r.ok));
      assert.ok(results.every((r) => /확인/.test(r.error ?? "")));
    },
  );
});

test("요청 자체가 거부되면 전원 실패다", async () => {
  const realFetch = globalThis.fetch;
  for (const [key, value] of Object.entries(ENV)) process.env[key] = value;
  globalThis.fetch = (async () =>
    new Response("잔액이 부족합니다", { status: 402 })) as typeof fetch;
  try {
    const results = await sendAlimtalk(recipients());
    assert.ok(results.every((r) => !r.ok));
    assert.match(results[0].error ?? "", /거부/);
  } finally {
    globalThis.fetch = realFetch;
    for (const key of Object.keys(ENV)) delete process.env[key];
  }
});
