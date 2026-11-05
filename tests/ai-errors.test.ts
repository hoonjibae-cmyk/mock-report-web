/**
 * AI 실패를 사람이 읽을 문장으로 — 왜 실패했는지에 따라 선생님이 할 일이 다르다.
 *
 * 실행: npm test
 */
import assert from "node:assert/strict";
import test from "node:test";

import { AiDraftError, classifyAiError, describeAiError, isTransient } from "../lib/ai-errors";
import { needsDraft } from "../lib/omr-comments";

test("SDK 오류 모양으로 종류를 가른다", () => {
  assert.equal(classifyAiError({ name: "RateLimitError", status: 429, message: "Rate limit reached" }), "rate_limit");
  assert.equal(classifyAiError({ name: "APIConnectionTimeoutError", message: "Request timed out." }), "timeout");
  assert.equal(classifyAiError({ name: "InternalServerError", status: 502, message: "Bad gateway" }), "service");
  assert.equal(classifyAiError({ name: "APIConnectionError", message: "Connection error." }), "service");
  assert.equal(classifyAiError({ name: "AuthenticationError", status: 401, message: "Incorrect API key" }), "config");
  assert.equal(classifyAiError({ status: 404, code: "model_not_found", message: "The model `x` does not exist" }), "config");
  assert.equal(classifyAiError({ status: 400, message: "max_output_tokens too small" }), "incomplete");
  assert.equal(classifyAiError(new Error("뭔가 이상"), ), "unknown");
  assert.equal(classifyAiError(new AiDraftError("empty", "빈 글")), "empty");
});

test("문장 — 다시 누를지, 기다릴지, 관리자에게 말할지가 보인다", () => {
  assert.match(describeAiError({ name: "RateLimitError", status: 429 }), /몰려|다시 눌러/);
  assert.match(describeAiError({ name: "APIConnectionTimeoutError", message: "timed out" }), /오래 걸려/);
  assert.match(describeAiError({ status: 401 }), /관리자/);
  // 우리가 직접 쓴 설명(키 없음 등)은 그대로
  assert.equal(describeAiError(new Error("OPENAI_API_KEY가 설정되어 있지 않습니다.")), "OPENAI_API_KEY가 설정되어 있지 않습니다.");
  assert.equal(describeAiError(new AiDraftError("incomplete", "AI가 글을 끝맺지 못했습니다.")), "AI가 글을 끝맺지 못했습니다.");
  // 모양을 알 수 없는 값도 문장은 나온다
  assert.ok(describeAiError(undefined).length > 0);
});

test("한 번 더 시도할 만한 실패와 아닌 실패", () => {
  for (const kind of ["rate_limit", "timeout", "service", "incomplete", "empty"] as const) assert.ok(isTransient(kind), kind);
  assert.ok(!isTransient("config"));
  assert.ok(!isTransient("unknown"));
});

test("'초안 없는 학생 모두 생성'은 초안도 최종 글도 없는 학생만 고른다", () => {
  assert.ok(needsDraft({ aiDraft: null, personalFinal: null }));
  assert.ok(needsDraft({ aiDraft: "  ", personalFinal: "" }));
  assert.ok(!needsDraft({ aiDraft: "초안", personalFinal: null }), "받아 둔 초안은 덮어쓰지 않는다");
  assert.ok(!needsDraft({ aiDraft: null, personalFinal: "선생님이 쓴 글" }), "선생님 글은 덮어쓰지 않는다");
});
