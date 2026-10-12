/**
 * 알림톡 받는 사람 고르기 — 학부모만 / 학부모 + 학생 / 학생만.
 *
 * 성적표는 학부모에게 가는 것이 기본이고, 학생 본인은 거기에 얹는 선택이다.
 * 그런데 학부모에게 먼저 보낸 뒤 학생에게도 보내려 할 때 '학부모 + 학생'을
 * 고르면 학부모가 한 번 더 받거나, 그러지 않으려고 일일이 체크를 풀어야 한다.
 * 그래서 '학생만'을 따로 둔다 — 학부모에게는 보내지 않고 학생 본인에게만 나간다.
 *
 * 화면(OmrSendPanel)과 테스트가 함께 쓰는 순수 규칙만 있다. 서버는 모드를
 * 모른다 — 성적표·수신자 유형 한 쌍씩 받아 그 시점의 사실로 다시 판단한다.
 * 평문 번호는 여기 없다(report-send 의 타입만 쓴다).
 */
import type { RecipientType } from "@/lib/report-messages";
import type { RecipientSlot, SendTarget } from "@/lib/report-send";

export type SendMode = "parent" | "both" | "student";

/** 화면에 늘어놓는 순서 — 기본은 학부모만 */
export const SEND_MODES: readonly SendMode[] = ["parent", "both", "student"];

export const SEND_MODE_LABELS: Record<SendMode, string> = {
  parent: "학부모만",
  both: "학부모 + 학생",
  student: "학생만",
};

/** 이 모드가 보내는 수신자 유형 — 막힌 곳은 아직 거르지 않는다 */
export function recipientsOf(mode: SendMode): RecipientType[] {
  if (mode === "parent") return ["parent"];
  if (mode === "student") return ["student"];
  return ["parent", "student"];
}

/** 이 모드에 이 수신자 유형이 들어 있는가 — 표의 열을 보일지도 이것으로 정한다 */
export function includesRecipient(mode: SendMode, type: RecipientType): boolean {
  return recipientsOf(mode).includes(type);
}

export function slotOf(target: SendTarget, type: RecipientType): RecipientSlot {
  return type === "parent" ? target.parent : target.student;
}

/** 이 모드에서 이 학생에게 실제로 나갈 수신자들 — 막힌 곳은 뺀다 */
export function channelsFor(target: SendTarget, mode: SendMode): RecipientType[] {
  return recipientsOf(mode).filter((type) => !slotOf(target, type).blocked);
}

/**
 * 보낼 수 있는 곳 중 아직 안 보낸 곳이 하나라도 있는가 — '안 보낸 학생 전체'의
 * 기준. 모드에 없는 쪽의 기록은 보지 않는다: 학부모가 이미 받았어도 '학생만'
 * 에서는 학생이 안 받았으면 안 보낸 학생이다.
 */
export function hasUnsentChannel(target: SendTarget, mode: SendMode): boolean {
  return channelsFor(target, mode).some((type) => !slotOf(target, type).history?.sent);
}

/** "학부모 3명 · 학생 2명" — 모드에 있는 쪽만 적는다 */
export function recipientCountText(mode: SendMode, parents: number, students: number): string {
  const parts: string[] = [];
  if (includesRecipient(mode, "parent")) parts.push(`학부모 ${parents}명`);
  if (includesRecipient(mode, "student")) parts.push(`학생 ${students}명`);
  return parts.join(" · ");
}
