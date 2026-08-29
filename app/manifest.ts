import type { MetadataRoute } from "next";
import { APP_NAME } from "@/lib/version";
import { ACADEMY_NAME } from "@/lib/omr-types";

/**
 * 홈 화면에 추가했을 때 앱처럼 보이게 하는 설명서.
 *
 * 선생님들이 휴대전화로 스캔 검수·발송을 하는 일이 잦아, 브라우저 주소창
 * 없이 바로 열리는 편이 낫다. 아이콘 한 장(public/app-icon.png)만 있으면
 * 되고, 크기별 파일을 따로 두지 않는다 — 브라우저가 줄여서 쓴다.
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
      {
        src: "/app-icon.png",
        // 원본 한 장을 모든 크기로 쓴다. 크기를 못 박으면 그 크기 파일이
        // 없을 때 아이콘이 통째로 무시된다.
        sizes: "any",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
