// 슬랙 계정으로 로그인 — 슬랙의 OpenID Connect.
//
// 왜 슬랙인가
// ----------
// 직원은 이미 슬랙으로 일한다. 안내도 슬랙으로 가므로, 슬랙에 없는 사람은
// 어차피 이 프로그램을 쓸 수 없다. 슬랙은 이미 사실상의 전제 조건이었다.
//
// 무엇보다 **워크스페이스 멤버십은 회사가 통제한다.** 퇴사자를 슬랙에서
// 내보내면 그 순간 이 프로그램도 막힌다. 직원이 스스로 만든 구글 계정에는
// 없는 성질이다 — 그건 회사가 정지시킬 수 없어서, 우리 명부가 유일한
// 잠금장치가 된다.
//
// 구글을 쓰지 않는 실무상의 이유
// ----------------------------
// 구글은 앱을 '프로덕션'으로 게시하기 전까지 **미리 등록한 사람만** 로그인시킨다.
// 그러면 사람을 뽑을 때마다 구글 콘솔에 이메일을 손으로 넣어야 하는데, 빠뜨리면
// 신입이 첫날 로그인에 실패하고 본인은 이유를 알 수 없다. 사람이 기억해야 하는
// 일을 없애려고 만든 연동에 그런 단계를 끼워 넣을 수는 없다.
//
// 슬랙에는 그런 명단이 없다. 워크스페이스 멤버면 되고, 그중 누가 들어올지는
// 우리 명부(app_users)가 정한다.

import { signPayload, verifyPayload } from "@/lib/crypto";

export const SLACK_STATE_COOKIE = "ys_mock_oauth_state";

const AUTH_ENDPOINT = "https://slack.com/openid/connect/authorize";
const TOKEN_ENDPOINT = "https://slack.com/api/openid.connect.token";

export class SlackLoginNotConfiguredError extends Error {
  constructor() {
    super(
      "슬랙 로그인이 설정되어 있지 않습니다. " +
        "Vercel → Settings → Environment Variables 에서 SLACK_CLIENT_ID와 " +
        "SLACK_CLIENT_SECRET을 추가한 뒤 다시 배포해 주세요.",
    );
    this.name = "SlackLoginNotConfiguredError";
  }
}

export function slackLoginConfigured(): boolean {
  return Boolean(process.env.SLACK_CLIENT_ID && process.env.SLACK_CLIENT_SECRET);
}

export function slackRedirectUri(siteUrl: string): string {
  return `${siteUrl.replace(/\/$/, "")}/api/auth/slack/callback`;
}

/**
 * 돌아올 때 확인할 표식.
 *
 * 이것이 없으면 남이 만든 로그인 요청을 우리 쪽에서 그대로 처리하게 된다(CSRF).
 * 쿠키에 넣은 값과 슬랙이 돌려준 값이 같아야 통과시킨다.
 */
export function createState(): string {
  return signPayload({
    nonce: Math.random().toString(36).slice(2) + Date.now().toString(36),
    exp: Date.now() + 10 * 60 * 1000,
  });
}

export function stateMatches(fromCookie: string | undefined, fromSlack: string | null): boolean {
  if (!fromCookie || !fromSlack || fromCookie !== fromSlack) return false;
  // 서명과 만료까지 확인한다 — 쿠키를 그대로 되돌려 보내는 것만으로는 부족하다.
  return verifyPayload<{ nonce?: string }>(fromCookie) !== null;
}

export function authorizeUrl(siteUrl: string, state: string): string {
  if (!slackLoginConfigured()) throw new SlackLoginNotConfiguredError();
  const params = new URLSearchParams({
    client_id: process.env.SLACK_CLIENT_ID ?? "",
    redirect_uri: slackRedirectUri(siteUrl),
    response_type: "code",
    // 신원 확인에 필요한 최소한. 슬랙 내용을 읽는 권한은 하나도 받지 않는다.
    scope: "openid email profile",
    state,
  });
  const team = (process.env.SLACK_TEAM_ID ?? "").trim();
  // 우리 워크스페이스를 지정해 두면 계정 선택 화면이 바로 그쪽으로 뜬다.
  // 실제 검증은 아래 identityFromClaims 에서 한 번 더 한다.
  if (team) params.set("team", team);
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export interface SlackIdentity {
  email: string;
  name: string;
  teamId: string;
  slackUserId: string;
}

interface IdTokenClaims {
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  aud?: string;
  exp?: number;
  "https://slack.com/team_id"?: string;
  "https://slack.com/user_id"?: string;
}

/** id_token 가운데 토막(payload)을 읽는다 */
export function decodeIdToken(idToken: string): IdTokenClaims | null {
  const part = idToken.split(".")[1];
  if (!part) return null;
  try {
    const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json) as IdTokenClaims;
  } catch {
    return null;
  }
}

/**
 * 슬랙이 준 신원을 확인한다.
 *
 * 서명을 따로 검사하지 않는 것은 의도한 것이다. 이 토큰은 우리 서버가 슬랙 토큰
 * 창구에 **우리 비밀키를 넣어 직접** 받아 온 것이라 중간에 바꿔치기할 자리가
 * 없다(브라우저를 거쳐 온 토큰이라면 반드시 서명을 봐야 한다).
 *
 * 워크스페이스를 확인하는 것이 핵심이다. 이것을 안 보면 아무 슬랙 워크스페이스나
 * 만들어서 우리 직원과 같은 이메일을 넣어 두면 그만이고, "회사가 통제하는 슬랙
 * 멤버십" 이라는 전제가 통째로 무너진다.
 */
export function identityFromClaims(claims: IdTokenClaims | null): SlackIdentity | null {
  if (!claims) return null;
  const email = String(claims.email ?? "").trim().toLowerCase();
  if (!email) return null;
  if (claims.email_verified !== true && claims.email_verified !== "true") return null;
  if (claims.aud && claims.aud !== process.env.SLACK_CLIENT_ID) return null;
  if (typeof claims.exp === "number" && claims.exp * 1000 < Date.now()) return null;

  const teamId = String(claims["https://slack.com/team_id"] ?? "").trim();
  const expected = (process.env.SLACK_TEAM_ID ?? "").trim();
  if (expected && teamId !== expected) return null;

  return {
    email,
    name: String(claims.name ?? "").trim(),
    teamId,
    slackUserId: String(claims["https://slack.com/user_id"] ?? "").trim(),
  };
}

/** 인가 코드를 신원으로 바꾼다 */
export async function exchangeCode(code: string, siteUrl: string): Promise<SlackIdentity | null> {
  if (!slackLoginConfigured()) throw new SlackLoginNotConfiguredError();
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.SLACK_CLIENT_ID ?? "",
      client_secret: process.env.SLACK_CLIENT_SECRET ?? "",
      redirect_uri: slackRedirectUri(siteUrl),
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  // 슬랙은 실패해도 HTTP 200으로 {ok:false, error:"..."} 를 준다.
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; id_token?: string };
  if (data.ok === false || !data.id_token) return null;
  return identityFromClaims(decodeIdToken(data.id_token));
}
