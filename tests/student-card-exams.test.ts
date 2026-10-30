// 학생 카드로 시험 기록 보내기 (v1.58.0) — 성적표 한 줄이 어떤 기록이 되는지, 어떻게 보내고 거두는지.
import test from "node:test";
import assert from "node:assert/strict";
import { EXAM_SYNC_CHUNK, examRecordFromReport, examSyncConfigured, pushExamRecords, removeExamRecords } from "../lib/student-card-exams";

const generic = (over: Record<string, unknown> = {}) => ({
  schemaVersion: 2, family: "C_generic", examId: "exam-1", examType: "monthly", examTypeLabel: "월말평가", examTitle: "10월 월말평가",
  examDate: "2026-10-28", academy: "목동유쌤영어학원", student: { key: "72111", name: "김도영", school: "미강중 1" },
  score: { raw: 88.4, objectiveRaw: 80, essayRaw: 8.4, max: 100, correctCount: 22, wrongCount: 3, blankCount: 0, totalQuestions: 25 },
  cohort: { count: 21, mean: 70.2, stdev: 10, max: 95, min: 40 }, standardScore: 118, rank: 3, topPercent: 14, grade: null,
  items: [], areas: [], weakItems: [], growth: [], essayCount: 2, listeningAbsent: null, cohortGrades: "", national: null,
  teacherComment: null, appVersion: "1.58.0", generatedAt: "2026-10-28T10:00:00.000Z", ...over,
});
const row = (over: Record<string, unknown> = {}) => ({
  id: "11111111-1111-4111-8111-111111111111", student_key: "72111", exam_id: "exam-1", public_token: "tok123",
  report_data: generic(), created_at: "2026-10-28T12:00:00.000Z", is_active: true, ...over,
});

test("성적표 한 줄 → 학생 카드 기록: 열쇠 · 성적표 id · 시험 이름 · 종류 · 날짜 · 점수 · 등수 · 성적표 주소", () => {
  const record = examRecordFromReport(row(), "https://report.yussam.com/");
  assert.deepEqual(record, {
    studentKey: "72111", reportId: "11111111-1111-4111-8111-111111111111", examId: "exam-1", examTitle: "10월 월말평가", examKind: "월말평가",
    examDate: "2026-10-28", score: 88.4, max: 100, rank: 3, rankTotal: 21, reportUrl: "https://report.yussam.com/r/tok123",
  });
  // 반배치고사 — 종류 이름은 짧은 것(반배치고사), 신규생 열쇠(sc…) 그대로
  const placement = examRecordFromReport(row({ student_key: "sc123", report_data: generic({ examType: "placement", examTitle: "11월 반배치고사" }) }), "https://r.test");
  assert.deepEqual([placement?.studentKey, placement?.examKind, placement?.examTitle], ["sc123", "반배치고사", "11월 반배치고사"]);
  // 응시일이 비면 만든 날 · 점수가 배점을 넘으면 배점은 뺀다(학생 카드가 거절하지 않도록) · 등수가 없으면 뺀다
  const odd = examRecordFromReport(row({ report_data: generic({ examDate: null, score: { raw: 104, max: 100 }, rank: 0, cohort: { count: 0 } }) }), "https://r.test");
  assert.deepEqual([odd?.examDate, odd?.score, "max" in (odd ?? {}), "rank" in (odd ?? {}), "rankTotal" in (odd ?? {})], ["2026-10-28", 104, false, false, false]);
  // 시험용 시험은 표시해 보낸다 — 학생 카드가 저장하지 않는다
  assert.equal(examRecordFromReport(row({ report_data: generic({ examTitle: "부원장 테스트 월말평가" }) }), "https://r.test")?.isTest, true);
  // 열쇠가 없는 성적표(옛 모의고사 엑셀)는 보낼 수 없다
  assert.equal(examRecordFromReport(row({ student_key: null }), "https://r.test"), null);
  assert.equal(examRecordFromReport(row({ student_key: "" }), "https://r.test"), null);
  // 옛 모양(엑셀 모의고사)이라도 열쇠가 있으면 제목·날짜·평균 점수로
  const legacy = examRecordFromReport(row({ report_data: { schemaVersion: 1, reportTitle: "3월 모의고사", examLabel: "2026-03", overall: { averageScore: 77.25 } } }), "https://r.test");
  assert.deepEqual([legacy?.examTitle, legacy?.examKind, legacy?.examDate, legacy?.score, legacy?.max], ["3월 모의고사", "국영수 모의고사", "2026-10-28", 77.3, 100]);
});

test("200건씩 보내고 결과를 세며, 실패해도 던지지 않는다 · 거두기는 404 를 무시한다", async () => {
  const original = globalThis.fetch;
  const savedUrl = process.env.STUDENT_API_URL;
  const savedKey = process.env.STUDENT_API_KEY;
  process.env.STUDENT_API_URL = "https://card.test/";
  process.env.STUDENT_API_KEY = "shared-key";
  const calls: Array<{ url: string; method: string; key: string; count: number }> = [];
  try {
    assert.equal(examSyncConfigured(), true);
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body ? (JSON.parse(String(init.body)) as { exams: unknown[] }) : { exams: [] };
      calls.push({ url: String(input), method: String(init?.method), key: (init?.headers as Record<string, string>)["x-api-key"], count: body.exams.length });
      const results = body.exams.map((_, i) => ({ reportId: String(i), matched: i % 50 !== 1, saved: i % 50 !== 1 }));
      return new Response(JSON.stringify({ ok: true, results }), { status: 200 });
    }) as typeof fetch;
    const records = Array.from({ length: EXAM_SYNC_CHUNK + 1 }, (_, i) => examRecordFromReport(row({ id: `id-${i}`, student_key: `7${i}` }), "https://r.test")!);
    const result = await pushExamRecords(records);
    assert.deepEqual(calls.map((c) => [c.url, c.method, c.key, c.count]), [
      ["https://card.test/api/exams", "POST", "shared-key", 200], ["https://card.test/api/exams", "POST", "shared-key", 1],
    ]);
    assert.deepEqual([result.sent, result.saved, result.unmatched, result.error], [201, 197, 4, undefined]);

    // 상대가 거절하면 거기서 멈추고 까닭만 — 던지지 않는다
    globalThis.fetch = (async () => new Response("{}", { status: 401 })) as typeof fetch;
    const denied = await pushExamRecords(records.slice(0, 2));
    assert.match(denied.error ?? "", /인증을 거부/);
    globalThis.fetch = (async () => new Response("{}", { status: 404 })) as typeof fetch;
    assert.match((await pushExamRecords(records.slice(0, 1))).error ?? "", /v1\.107\.0/);

    // 거두기 — 없다는 답(404)은 그대로, 다른 실패는 까닭
    const deleted: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      deleted.push(`${init?.method} ${String(input)}`);
      return new Response("{}", { status: String(input).endsWith("/gone") ? 404 : 200 });
    }) as typeof fetch;
    const removed = await removeExamRecords(["a b", "gone", "a b"]);
    assert.deepEqual(deleted, ["DELETE https://card.test/api/exams/a%20b", "DELETE https://card.test/api/exams/gone"]);
    assert.deepEqual([removed.removed, removed.error], [1, undefined]);

    // 연동이 꺼져 있으면 아무것도 보내지 않는다
    delete process.env.STUDENT_API_KEY;
    assert.deepEqual(await pushExamRecords(records.slice(0, 1)), { configured: false, sent: 0, saved: 0, unmatched: 0, skipped: 0 });
  } finally {
    globalThis.fetch = original;
    if (savedUrl === undefined) delete process.env.STUDENT_API_URL; else process.env.STUDENT_API_URL = savedUrl;
    if (savedKey === undefined) delete process.env.STUDENT_API_KEY; else process.env.STUDENT_API_KEY = savedKey;
  }
});
