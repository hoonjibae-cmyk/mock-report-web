import type { Metadata } from "next";
import Guide from "./Guide";
export const metadata: Metadata = {
  title: "OMR 리포트 사용 가이드 | 목동유쌤영어학원",
  description: "시험 준비부터 검수, 성적표와 담임 의견, 알림톡 발송까지. 실제 화면으로 따라 하는 선생님용 가이드.",
  robots: { index: false, follow: false },
};
export default function GuidePage() { return <Guide />; }
