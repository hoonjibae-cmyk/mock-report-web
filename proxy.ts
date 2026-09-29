import { NextResponse, type NextRequest } from "next/server";

/**
 * 관리 화면 요청에 '어디로 가려던 것인지' 를 표시해 둔다.
 *
 * 서버 컴포넌트(레이아웃)는 자기 주소를 알 방법이 없다. 그래서 여기서 요청
 * 헤더에 경로를 적어 두고, 레이아웃이 로그인 화면으로 보낼 때 그 경로를
 * `next` 로 실어 보낸다. 로그인 검사 자체는 그대로 레이아웃이 한다 — 한 곳에서.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const headers = new Headers(request.headers);
  headers.set("x-requested-path", `${pathname}${search}`);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/admin/:path*"],
};
