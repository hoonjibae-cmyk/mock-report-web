// 구글 계정으로 로그인 — 인가 코드 방식(authorization code flow).
//
// 왜 구글인가
// ----------
// 직원은 이미 업무용 구글 계정으로 슬랙을 쓴다. 비밀번호를 따로 만들면 그것을
// 어떻게든 전달해야 하고(슬랙 DM에 영영 남는다), 사람이 외우거나 적어 두게 되며,
// 퇴사한 뒤에도 그 비밀번호는 그대로 살아 있다.
//
// 구글이 잠금장치가 아니다
// ----------------------
// **이 구글 계정은 직원이 스스로 만든 것이라 회사가 정지시킬 수 없다.** 퇴사한
// 사람의 계정은 대개 그대로 살아 있고, 구글은 여전히 "이 사람 맞다"고 답한다.
//
// 그래서 구글은 **누구인지만** 확인해 주고, **들어와도 되는지** 는 우리 명부가
// 정한다(app_users 에 있고 is_active 인 사람만). 인사 프로그램에서 퇴사·부서
// 이동이 확인되면 그 자리에서 잠기고, 살아 있는 구글 계정으로도 못 들어온다.
// 로그인할 때마다, 그리고 이미 로그인한 세션도 요청마다 이 표를 다시 본다.
//
// 왜 라이브러리를 안 쓰나
// ---------------------
// 이 프로그램에 필요한 것은 "구글이 확인해 준 이메일 한 줄"뿐이다. 세션은 이미
// 우리 것이 있고(서명 쿠키), 회원가입도 비밀번호 재설정도 없다. 그 한 줄을 위해
// 인증 체계를 하나 더 들이면 로그인 경로가 둘이 되어 어느 쪽이 진짜인지
// 흐려진다.

import { signPayload, verifyPayload } from "@/lib/crypto";

export const GOOGLE_STATE_COOKIE = "ys_mock_oauth_state";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export class GoogleNotConfiguredError extends Error {
  constructor() {
    super(
      "구글 로그인이 설정되어 있지 않습니다. " +
        "Vercel → Settings → Environment Variables 에서 GOOGLE_CLIENT_ID와 " +
        "GOOGLE_CLIENT_SECRET을 추가한 뒤 다시 배포해 주세요.",
    );
    this.name = "GoogleNotConfiguredError";
  }
}

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function googleRedirectUri(siteUrl: string): string {
  return `${siteUrl.replace(/\/$/, "")}/api/auth/google/callback`;
}

/**
 * 돌아올 때 확인할 표식.
 *
 * 이것이 없으면 남이 만든 로그인 요청을 우리 쪽에서 그대로 처리하게 된다
 * (CSRF). 쿠키에 넣은 값과 구글이 돌려준 값이 같아야 통과시킨다.
 */
export function createState(): string {
  return signPayload({
    nonce: Math.random().toString(36).slice(2) + Date.now().toString(36),
    exp: Date.now() + 10 * 60 * 1000,
  });
}

export function stateMatches(fromCookie: string | undefined, fromGoogle: string | null): boolean {
  if (!fromCookie || !fromGoogle || fromCookie !== fromGoogle) return false;
  // 서명과 만료까지 확인한다 — 쿠키를 그대로 되돌려 보내는 것만으로는 부족하다.
  return verifyPayload<{ nonce?: string }>(fromCookie) !== null;
}

export function authorizeUrl(siteUrl: string, state: string): string {
  if (!googleConfigured()) throw new GoogleNotConfiguredError();
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: googleRedirectUri(siteUrl),
    response_type: "code",
    scope: "openid email profile",
    state,
    // 계정을 여럿 쓰는 사람이 어느 계정으로 들어갈지 매번 고를 수 있게 한다.
    prompt: "select_account",
  });
  const domain = (process.env.GOOGLE_WORKSPACE_DOMAIN ?? "").trim();
  // 회사가 도메인을 가진 구글 워크스페이스를 쓸 때만 넣는다. 직원이 각자 만든
  // 계정(gmail 등)을 쓰는 지금은 **비워 두어야 한다** — 넣으면 아무도 가지지
  // 않은 도메인으로 계정 선택 화면을 좁혀 전원이 못 들어온다.
  //
  // 넣더라도 편의일 뿐 잠금장치가 아니다. 실제 판정은 명부 대조로 한다.
  if (domain) params.set("hd", domain);
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export interface GoogleIdentity {
  email: string;
  name: string;
}

interface IdTokenClaims {
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  aud?: string;
  exp?: number;
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
 * 구글이 준 신원을 확인한다.
 *
 * 서명을 따로 검사하지 않는 것은 의도한 것이다. 이 토큰은 우리 서버가 구글
 * 토큰 창구에 **우리 비밀키를 넣어 직접** 받아 온 것이라, 중간에 누가 바꿔치기할
 * 자리가 없다(브라우저를 거쳐 온 토큰이라면 반드시 서명을 봐야 한다).
 *
 * 그래도 받는 사람(aud)과 만료, 그리고 **이메일 확인 여부** 는 본다. 확인되지
 * 않은 이메일을 받아들이면 남의 회사 주소를 적어 넣은 계정으로 들어올 수 있다.
 */
export function identityFromClaims(claims: IdTokenClaims | null): GoogleIdentity | null {
  if (!claims) return null;
  const email = String(claims.email ?? "").trim().toLowerCase();
  if (!email) return null;
  if (claims.email_verified !== true && claims.email_verified !== "true") return null;
  if (claims.aud && claims.aud !== process.env.GOOGLE_CLIENT_ID) return null;
  if (typeof claims.exp === "number" && claims.exp * 1000 < Date.now()) return null;
  return { email, name: String(claims.name ?? "").trim() };
}

/** 인가 코드를 신원으로 바꾼다 */
export async function exchangeCode(code: string, siteUrl: string): Promise<GoogleIdentity | null> {
  if (!googleConfigured()) throw new GoogleNotConfiguredError();
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: googleRedirectUri(siteUrl),
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => ({}))) as { id_token?: string };
  if (!data.id_token) return null;
  return identityFromClaims(decodeIdToken(data.id_token));
}
