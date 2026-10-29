/**
 * 설정 화면의 AI 모델 선택지와 저장값 해석.
 *
 * 실행: npm test
 *
 * 5.6 세대에서 저장해 둔 값은 같은 등급의 6 세대로 읽혀야 한다 — 설정을 다시
 * 고르지 않아도 되고, Terra 를 골랐던 학원이 갑자기 Luna 로 떨어지면 안 된다.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  AI_MODEL_OPTIONS,
  AI_REASONING_EFFORT,
  DEFAULT_AI_MODEL,
  aiModelLabel,
  aiModelParams,
  resolveAiModel,
} from "../lib/ai-models";
import { AI_EFFORT_LABELS, FIXED_AI_USES, SETTING_DRIVEN_AI_USES } from "../lib/ai-uses";

test("선택지는 모두 GPT-6 세대이고 기본값은 가장 싼 Luna", () => {
  assert.deepEqual(
    AI_MODEL_OPTIONS.map((o) => o.value),
    ["gpt-6-luna", "gpt-6.1-terra", "gpt-6.1-sol"],
  );
  assert.equal(DEFAULT_AI_MODEL, "gpt-6-luna");
});

test("지금 선택지는 그대로, 5.6 세대 저장값은 같은 등급으로, 모르는 값은 기본값으로", () => {
  assert.equal(resolveAiModel("gpt-6.1-sol"), "gpt-6.1-sol");
  assert.equal(resolveAiModel("gpt-5.6-luna"), "gpt-6-luna");
  assert.equal(resolveAiModel("gpt-5.6-terra"), "gpt-6.1-terra");
  assert.equal(resolveAiModel("gpt-5.6-sol"), "gpt-6.1-sol");
  assert.equal(resolveAiModel("  gpt-5.6-terra  "), "gpt-6.1-terra");
  assert.equal(resolveAiModel("gpt-4o"), DEFAULT_AI_MODEL);
  assert.equal(resolveAiModel(undefined), DEFAULT_AI_MODEL);
  assert.equal(resolveAiModel(null), DEFAULT_AI_MODEL);
});

test("설정 모델로 부를 때는 추론 강도를 낮게 고정한다", () => {
  assert.equal(AI_REASONING_EFFORT, "low");
  assert.deepEqual(aiModelParams("gpt-6.1-terra"), { model: "gpt-6.1-terra", reasoning: { effort: "low" } });
});

test("화면 이름은 선택지에 있으면 이름으로, 없으면 ID 그대로", () => {
  assert.equal(aiModelLabel("gpt-6.1-sol"), "GPT-6.1 Sol");
  assert.equal(aiModelLabel("gpt-7-nova"), "gpt-7-nova");
});

test("고정 기능 목록은 모델·추론 강도·이유가 빠짐없고 이름이 겹치지 않는다", () => {
  const names = [...SETTING_DRIVEN_AI_USES, ...FIXED_AI_USES].map((u) => u.feature);
  assert.equal(new Set(names).size, names.length);
  for (const use of FIXED_AI_USES) {
    assert.ok(use.model.startsWith("gpt-"), `${use.feature}: 모델 ID`);
    assert.ok(use.effort in AI_EFFORT_LABELS, `${use.feature}: 추론 강도 이름`);
    assert.ok(use.reason.length > 0 && use.where.length > 0, `${use.feature}: 설명`);
  }
  // 상담 기능의 고정 모델은 실제 상수에서 읽는다 — 코드가 바뀌면 화면도 따라간다
  assert.equal(FIXED_AI_USES.find((u) => u.feature === "공통 문항 분석")?.model, "gpt-6.1-sol");
  assert.equal(FIXED_AI_USES.find((u) => u.feature === "학생별 상담 분석")?.model, "gpt-6-luna");
});
