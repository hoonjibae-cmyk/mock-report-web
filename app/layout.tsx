import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OMR 리포트 | 목동유쌤영어학원",
  description: "OMR 답안지 생성·자동 채점과 학생별 웹 성적표 발송",
  // 아이콘 원본은 public/app-icon.png 한 장뿐이다. 크기별 파일을 따로 두지
  // 않는 것은, 파일이 늘어날수록 아이콘을 바꿀 때 한 곳을 빠뜨리기 쉬워서다.
  // 탭에 들어갈 작은 크기는 브라우저가 알아서 줄여 쓴다.
  icons: {
    icon: "/app-icon.png",
    shortcut: "/app-icon.png",
    apple: "/app-icon.png",
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
