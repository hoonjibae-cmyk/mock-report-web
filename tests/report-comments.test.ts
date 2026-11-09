/**
 * 성적표에 싣는 담임 의견 — 확정한 글만, 작성 방식(free)이면 영역별 항목은 뺀다.
 *
 * 실행: npm test
 */
import assert from "node:assert/strict";
import test from "node:test";

import { emptyOverview, emptyTeacherComment, type OverviewComment, type TeacherComment } from "../lib/omr-comments";
import { publishedComments, ratingClass, visibleComments } from "../lib/report-comments";

const overview = (patch: Partial<OverviewComment>): OverviewComment => ({ ...emptyOverview(), ...patch });
const personal = (patch: Partial<TeacherComment>): TeacherComment => ({ ...emptyTeacherComment(), ...patch });

test("초안은 학부모에게 보이지 않는다 — 확정(final)한 글만 실린다", () => {
  const draft = publishedComments(
    overview({ final: "총평 초안", areaNotes: [{ area: "듣기", text: "안내" }], style: "structured" }),
    personal({ personalFinal: "개별 초안", displayKeywords: ["성실"], areaFeedback: [{ area: "듣기", rating: "우수", text: "좋아요" }] }),
  );
  assert.equal(draft.overview, null);
  assert.deepEqual(draft.areaNotes, []);
  assert.equal(draft.personal, null);
  assert.deepEqual(draft.areaFeedback, []);
  assert.deepEqual(draft.keywords, []);
  // 작성 방식은 상태와 무관하게 전해진다
  assert.equal(draft.style, "structured");

  const final = publishedComments(
    overview({ final: "총평", areaNotes: [{ area: "듣기", text: "안내" }], style: "structured", status: "final" }),
    personal({
      personalFinal: "개별",
      displayKeywords: ["성실"],
      areaFeedback: [{ area: "듣기", rating: "우수", text: "좋아요" }],
      status: "final",
    }),
  );
  assert.equal(final.overview, "총평");
  assert.deepEqual(final.areaNotes, [{ area: "듣기", text: "안내" }]);
  assert.equal(final.personal, "개별");
  assert.deepEqual(final.areaFeedback, [{ area: "듣기", rating: "우수", text: "좋아요" }]);
  assert.deepEqual(final.keywords, ["성실"]);
});

test("총평이 없는 시험(exam_id 없음)은 자유 서술로 본다", () => {
  const comments = publishedComments(null, personal({ personalFinal: "개별", status: "final" }));
  assert.equal(comments.style, "free");
  assert.equal(comments.personal, "개별");
});

test("자유 서술 방식이면 영역별 항목은 그리지 않는다", () => {
  const visible = visibleComments(
    {
      overview: "총평",
      style: "free",
      areaNotes: [{ area: "듣기", text: "안내" }],
      personal: "개별",
      areaFeedback: [{ area: "듣기", rating: "우수", text: "" }],
      keywords: ["성실"],
    },
    null,
  );
  assert.equal(visible.overview, "총평");
  assert.deepEqual(visible.areaNotes, []);
  assert.deepEqual(visible.areaFeedback, []);
  assert.deepEqual(visible.keywords, ["성실"]);
  assert.ok(visible.any);
});

test("영역별 구조면 글이나 등급이 있는 항목만 — 빈 항목은 뺀다", () => {
  const visible = visibleComments(
    {
      overview: null,
      style: "structured",
      areaNotes: [
        { area: "듣기", text: "  " },
        { area: "독해", text: "안내" },
      ],
      personal: null,
      areaFeedback: [{ area: "문법", rating: "보통", text: "" }],
      keywords: ["성실"],
    },
    "예전 성적표에 들어 있던 글",
  );
  assert.deepEqual(visible.areaNotes, [{ area: "독해", text: "안내" }]);
  assert.deepEqual(visible.areaFeedback, [{ area: "문법", rating: "보통", text: "" }]);
  // 개별 의견이 비면 성적표 본문(Phase B)의 글로 — 키워드도 그때만
  assert.equal(visible.personal, "예전 성적표에 들어 있던 글");
  assert.deepEqual(visible.keywords, ["성실"]);
});

test("아무 글도 없으면 any 가 거짓이고 키워드도 비운다", () => {
  const visible = visibleComments({ overview: null, personal: null, keywords: ["성실"] }, null);
  assert.equal(visible.any, false);
  assert.deepEqual(visible.keywords, []);
});

test("등급 이름 → CSS 클래스", () => {
  assert.equal(ratingClass("매우 우수"), "best");
  assert.equal(ratingClass("우수"), "good");
  assert.equal(ratingClass("보통"), "fair");
  assert.equal(ratingClass("보완 필요"), "work");
});
