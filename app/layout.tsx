import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OMR 리포트 | 목동유쌤영어학원",
  description: "OMR 답안지 생성·자동 채점과 학생별 웹 성적표 발송",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
