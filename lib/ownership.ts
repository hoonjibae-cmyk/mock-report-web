// 누가 지울 수 있는가 — 시험과 성적표 묶음.
//
// 지우는 것은 되돌릴 수 없다. 다른 선생님이 만든 시험을 실수로 지우면 그
// 선생님의 답안지·판독·성적표 링크가 한꺼번에 사라지고, 학부모에게 이미
// 나간 링크가 죽는다. 그래서 '삭제 권한'이 있어도 **제가 만든 것**만 지운다.
// 총괄(경영지원)은 뒷정리를 해야 하므로 누구 것이든 지운다.
//
// 만든 사람을 모르는 옛 자료(created_by_username 이 비어 있음)는 총괄만
// 지운다 — 주인이 없다고 아무나 지우게 두면 그 자료가 제일 위험하다.

import type { UserPermissions } from "@/lib/access";

export interface Deleter {
  username: string;
  role: "admin" | "user";
  permissions: Pick<UserPermissions, "deleteReports">;
}

/** 이 사람이 ownerUsername 이 만든 것을 지울 수 있는가 */
export function canDeleteOwned(user: Deleter, ownerUsername: string | null | undefined): boolean {
  if (user.role === "admin") return true;
  if (!user.permissions.deleteReports) return false;
  const owner = String(ownerUsername ?? "").trim();
  return owner !== "" && owner === user.username;
}

/** 남의 것을 지우려 할 때 화면에 띄우는 문장 */
export const NOT_OWNER_MESSAGE =
  "다른 사람이 만든 것은 지울 수 없습니다. 만든 사람이나 경영지원에 요청해 주세요.";
