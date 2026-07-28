import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "중3 모의고사 웹리포트 | 목동유쌤영어학원",
  description: "국어·수학·영어 모의고사 문항 분석 및 학생별 웹 성적표",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
