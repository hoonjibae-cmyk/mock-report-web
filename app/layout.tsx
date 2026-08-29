import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OMR 리포트 | 목동유쌤영어학원",
  description: "OMR 답안지 생성·자동 채점과 학생별 웹 성적표 발송",
  // 크기별 파일을 따로 둔다. 512px 원본은 256KB라, 그걸 탭 아이콘으로 쓰면
  // 성적표를 여는 학부모 휴대전화마다 매번 받아 간다. 탭에는 2KB짜리 32px면
  // 충분하다. 큰 것은 홈 화면에 추가할 때만 쓰인다.
  icons: {
    icon: [
      { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/icon-32.png",
    apple: { url: "/icon-180.png", sizes: "180x180", type: "image/png" },
  },
  appleWebApp: {
    capable: true,
    title: "OMR 리포트",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  // 홈 화면에서 열었을 때 상단 상태 표시줄이 화면 색과 이어진다
  themeColor: "#183c73",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
