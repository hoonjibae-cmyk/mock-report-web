import type { MetadataRoute } from "next";
import { APP_NAME } from "@/lib/version";
import { ACADEMY_NAME } from "@/lib/omr-types";

/**
 * 홈 화면에 추가했을 때 앱처럼 보이게 하는 설명서.
 *
 * 선생님들이 휴대전화로 스캔 검수·발송을 하는 일이 잦아, 브라우저 주소창
 * 없이 바로 열리는 편이 낫다.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${APP_NAME} | ${ACADEMY_NAME}`,
    short_name: APP_NAME,
    description: "OMR 답안지 생성·자동 채점과 학생별 웹 성적표 발송",
    lang: "ko",
    start_url: "/admin",
    display: "standalone",
    background_color: "#f3f6fa",
    theme_color: "#183c73",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // maskable은 일부러 쓰지 않는다. 그것을 켜면 안드로이드가 아이콘을 제
      // 모양(원·둥근사각형)대로 잘라 쓰는데, 안전영역(가운데 80% 원)을 재 보니
      // 연필의 17.5%가 그 밖에 있다 — 지우개 쪽이 잘려 나간다. any로만 내주면
      // 안드로이드가 아이콘을 통째로 줄여 넣으므로 잘리는 곳이 없다.
    ],
  };
}
