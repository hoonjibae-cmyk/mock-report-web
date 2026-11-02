/**
 * 답안지를 올린 사람의 표시 이름 — 계정 ID 를 사람 이름으로 바꾸는 표.
 * 서버에서만 부른다(계정 표를 읽는다). 못 읽어도 화면은 ID 로 보여 주면 되므로
 * 실패를 삼킨다.
 */
import { listManagedUsers } from "@/lib/users";

export async function loadUploaderNames(): Promise<Record<string, string>> {
  const names: Record<string, string> = {};
  const envAdmin = String(process.env.ADMIN_USERNAME || "admin").trim().toLowerCase() || "admin";
  names[envAdmin] = "시스템 관리자";
  try {
    for (const user of await listManagedUsers()) names[user.username] = user.displayName;
  } catch {
    // 이름을 못 붙여도 범위 나누기는 된다
  }
  return names;
}
