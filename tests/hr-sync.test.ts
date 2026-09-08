/**
 * 인사 명부 ↔ 계정 맞추기 테스트.
 *
 * 실행: npm test
 *
 * 여기서 틀리면 **사람이 일을 못 한다.** 재직 중인 선생님이 잠기거나, 퇴사자가
 * 계속 열려 있거나, 경영지원이 아닌 사람이 총괄 권한을 받는다. 그래서
 * "맞게 만드는가"보다 **"잘못 끄지 않는가"** 를 더 촘촘히 본다.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  planSync,
  usernameFromEmail,
  type ExistingAccount,
  type HrStaff,
} from "../lib/hr-sync";

function staff(over: Partial<HrStaff> = {}): HrStaff {
  return {
    empNo: "E100",
    name: "김유진",
    department: "교수부",
    email: "yujin.kim@yussam.com",
    role: "user",
    slackLinked: true,
    ...over,
  };
}

function account(over: Partial<ExistingAccount> = {}): ExistingAccount {
  return {
    id: "a1",
    username: "yujin.kim",
    displayName: "김유진",
    email: "yujin.kim@yussam.com",
    role: "user",
    isActive: true,
    hrEmpNo: "E100",
    hrDepartment: "교수부",
    managedByHr: true,
    slackNotifiedAt: "2026-09-01T00:00:00.000Z",
    ...over,
  };
}

test("명부에만 있는 사람은 계정을 만든다", () => {
  const plan = planSync([staff()], []);
  assert.equal(plan.create.length, 1);
  assert.equal(plan.create[0].username, "yujin.kim");
  assert.deepEqual(plan.update, []);
  assert.deepEqual(plan.deactivate, []);
  assert.equal(plan.notify.length, 1, "새로 만든 사람에게는 안내를 보낸다");
});

test("경영지원은 총괄, 교수부·교육운영팀은 일반", () => {
  // 자리 자체는 인사 프로그램이 정해 보내지만, 그 값이 그대로 반영되는지는 봐야 한다.
  const plan = planSync(
    [
      staff({ empNo: "E1", department: "경영지원", role: "admin", email: "a@y.com" }),
      staff({ empNo: "E2", department: "교육운영팀", role: "user", email: "b@y.com" }),
    ],
    [],
  );
  assert.deepEqual(
    plan.create.map((c) => c.staff.role),
    ["admin", "user"],
  );
});

test("부서가 바뀌면 권한을 다시 맞춘다", () => {
  // 교수부 선생님이 경영지원으로 옮기면 총괄이 되어야 한다.
  const plan = planSync(
    [staff({ department: "경영지원", role: "admin" })],
    [account({ role: "user", hrDepartment: "교수부" })],
  );
  assert.equal(plan.update.length, 1);
  assert.match(plan.update[0].changes.join(" "), /권한/);
  assert.match(plan.update[0].changes.join(" "), /부서/);
});

test("바뀐 것이 없으면 아무것도 하지 않는다", () => {
  const plan = planSync([staff()], [account()]);
  assert.deepEqual(plan.create, []);
  assert.deepEqual(plan.update, [], "매번 갱신하면 기록이 의미 없는 변경으로 채워진다");
  assert.deepEqual(plan.deactivate, []);
  assert.deepEqual(plan.notify, [], "이미 안내를 보낸 사람에게 또 보내지 않는다");
});

test("명부에서 사라지면 끈다 — 지우지는 않는다", () => {
  const plan = planSync([staff({ empNo: "E200", email: "other@y.com" })], [account()]);
  assert.equal(plan.deactivate.length, 1);
  assert.equal(plan.deactivate[0].id, "a1");
  assert.match(plan.deactivate[0].reason, /퇴사 또는 부서 이동/);
});

test("명부가 비면 아무도 끄지 않는다", () => {
  // 인사 프로그램이 잠깐 멈췄거나 키가 틀리면 빈 명단이 온다. 그것을
  // '전원 퇴사'로 읽으면 그 순간 학원 전체가 잠긴다. 실제로 위험한 자리다.
  const plan = planSync([], [account({ id: "a1" }), account({ id: "a2", username: "b" })]);
  assert.deepEqual(plan.deactivate, [], "빈 명단으로는 절대 끄지 않는다");
});

test("손으로 만든 계정은 연동이 건드리지 않는다", () => {
  // 연동을 켠 날, 관리자가 직접 만들어 둔 계정까지 함께 잠기면 안 된다.
  const plan = planSync([staff()], [account(), account({ id: "manual", username: "operation", hrEmpNo: null, email: null, managedByHr: false })]);
  assert.deepEqual(plan.deactivate, []);
});

test("이미 꺼진 계정을 또 끄지 않는다", () => {
  const plan = planSync([staff({ empNo: "E999", email: "z@y.com" })], [account({ isActive: false })]);
  assert.deepEqual(plan.deactivate, []);
});

test("돌아온 사람은 다시 켠다", () => {
  const plan = planSync([staff()], [account({ isActive: false })]);
  assert.equal(plan.update.length, 1);
  assert.match(plan.update[0].changes.join(" "), /다시 사용 가능/);
});

test("이메일이 없으면 만들지 않고 이유를 남긴다", () => {
  // 조용히 건너뛰면 그 선생님만 영영 못 들어오고 아무도 이유를 모른다.
  const plan = planSync([staff({ email: "" })], []);
  assert.deepEqual(plan.create, []);
  assert.equal(plan.skipped.length, 1);
  assert.match(plan.skipped[0].reason, /이메일/);
  assert.match(plan.skipped[0].reason, /김유진/, "누구인지 밝혀야 한다");
});

test("이메일이 바뀌어도 사번으로 같은 사람을 찾는다", () => {
  const plan = planSync([staff({ email: "new.address@y.com" })], [account()]);
  assert.deepEqual(plan.create, [], "계정이 둘로 갈라지면 안 된다");
  assert.equal(plan.update.length, 1);
  assert.match(plan.update[0].changes.join(" "), /이메일/);
});

test("사번이 없던 옛 계정은 이메일로 이어 붙인다", () => {
  // 연동 전에 손으로 만들어 둔 계정에 사번을 채워 넣는 경로다.
  const plan = planSync([staff()], [account({ hrEmpNo: null })]);
  assert.deepEqual(plan.create, []);
  assert.match(plan.update[0].changes.join(" "), /사번/);
});

test("슬랙에 없는 사람은 계정만 만들고 안내는 미룬다", () => {
  // 신규 입사자가 아직 슬랙에 가입하지 않은 경우다.
  const plan = planSync([staff({ slackLinked: false })], []);
  assert.equal(plan.create.length, 1, "계정은 미리 만들어 둔다");
  assert.deepEqual(plan.notify, [], "보낼 수 없는 사람에게 보내려 하지 않는다");
});

test("슬랙에 가입하면 그때 안내가 나간다", () => {
  // 지난번에 못 보낸 사람(slackNotifiedAt 이 빈 계정)이 이번에 연결되면 대상이 된다.
  const notYet = account({ slackNotifiedAt: null });
  assert.deepEqual(planSync([staff({ slackLinked: false })], [notYet]).notify, [], "아직은 못 보낸다");

  const now = planSync([staff({ slackLinked: true })], [notYet]);
  assert.equal(now.notify.length, 1, "슬랙이 연결된 순간 대상이 되어야 한다");
  assert.equal(now.notify[0].empNo, "E100");
});

test("아이디가 겹치면 뒤에 숫자를 붙인다", () => {
  const taken = new Set<string>();
  assert.equal(usernameFromEmail("jin@y.com", "E1", taken), "jin");
  assert.equal(usernameFromEmail("jin@other.com", "E2", taken), "jin2");
  assert.equal(usernameFromEmail("jin@third.com", "E3", taken), "jin3");
});

test("아이디로 쓸 수 없는 이메일은 사번으로 만든다", () => {
  // 규칙(소문자·숫자·. _ -, 3자 이상)을 못 맞추면 계정 생성 자체가 실패한다.
  const taken = new Set<string>();
  for (const [email, empNo] of [
    ["김유진@y.com", "E10"],
    ["a@y.com", "E11"],
    ["@y.com", "E12"],
  ] as const) {
    const name = usernameFromEmail(email, empNo, taken);
    assert.match(name, /^[a-z0-9._-]{3,40}$/, `${email} → ${name} 이 규칙을 어겼다`);
  }
});

test("한 번에 여러 명을 만들어도 아이디가 겹치지 않는다", () => {
  const plan = planSync(
    [
      staff({ empNo: "E1", email: "kim@a.com" }),
      staff({ empNo: "E2", email: "kim@b.com" }),
      staff({ empNo: "E3", email: "kim@c.com" }),
    ],
    [],
  );
  const names = plan.create.map((c) => c.username);
  assert.equal(new Set(names).size, 3, `아이디가 겹쳤다: ${names.join(", ")}`);
});

test("기존 계정의 아이디와도 겹치지 않는다", () => {
  const plan = planSync([staff({ empNo: "E9", email: "operation@y.com" })], [
    account({ id: "m", username: "operation", hrEmpNo: null, email: null, managedByHr: false }),
  ]);
  assert.notEqual(plan.create[0].username, "operation");
});
