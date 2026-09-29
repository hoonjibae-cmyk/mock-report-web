/**
 * 로그인 뒤 돌아갈 곳.
 *
 * 슬랙 알림의 링크(검토 화면 등)를 눌렀는데 로그인이 풀려 있으면 로그인 화면이
 * 먼저 뜬다. 로그인하고 나서 메인으로 떨어뜨리면 사람이 링크를 다시 찾아
 * 눌러야 한다. 그래서 가려던 주소를 `next` 로 들고 다니다가 로그인이 끝나면
 * 그리로 보낸다.
 *
 * 다만 `next` 는 주소창에 그대로 실리는 값이라 아무 데나 보내면 안 된다 —
 * 남의 사이트로 넘기는 '열린 리다이렉트' 가 되지 않게, 이 사이트 안의 경로만
 * 받아들이고 나머지는 관리자 메인으로 돌린다.
 */

export const DEFAULT_AFTER_LOGIN = "/admin";

/** 돌아갈 경로를 검사한다 — 사이트 안의 경로가 아니면 메인으로 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_AFTER_LOGIN;
  const value = raw.trim();
  // 절대 주소(https://…), 프로토콜 상대 주소(//evil.com), 역슬래시 꼼수(/\evil.com)를 모두 막는다
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return DEFAULT_AFTER_LOGIN;
  }
  if (/[\r\n\0]/.test(value)) return DEFAULT_AFTER_LOGIN;
  // 로그인·API 로 되돌리면 뱅뱅 돌거나 JSON 만 보게 된다
  if (value === "/login" || value.startsWith("/login?") || value.startsWith("/api/")) {
    return DEFAULT_AFTER_LOGIN;
  }
  return value;
}

/** 로그인 화면 주소 — 가려던 곳이 있으면 함께 싣는다 */
export function loginUrlFor(next: string | null | undefined): string {
  const target = safeNextPath(next);
  if (target === DEFAULT_AFTER_LOGIN) return "/login";
  return `/login?next=${encodeURIComponent(target)}`;
}
