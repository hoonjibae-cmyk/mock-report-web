"use client";

// 성적표 화면의 A4 출력 장치. **눈에 보이는 것은 없다.**
//
// 예전에는 여기에 '웹·모바일 보기 / A4 출력 미리보기' 전환과 인쇄 버튼이
// 함께 있었다. 그런데 이 화면은 학부모가 받는 성적표다. 학부모에게 출력
// 설정을 고르라고 내미는 것은 자리를 잘못 잡은 것이라 걷어냈다.
//
// 기능은 그대로 남는다.
//   - 주소에 `?layout=a4` 가 붙으면 A4 판으로 그린다(관리자 화면의 'A4' 버튼)
//   - 인쇄를 누르는 순간 페이지가 A4 한 장에 들어가도록 배율을 맞춘다
// 그래서 컴포넌트를 지우지 않고 화면에 나오는 부분만 없앴다.

import { useEffect, useState } from "react";

type ReportLayout = "web" | "a4";

const A4_MIN_SCALE = 0.70;

function fitA4Pages() {
  const pages = [...document.querySelectorAll<HTMLElement>(".a4-page")];
  if (!pages.length) return;

  for (const page of pages) page.style.setProperty("--a4-content-scale", "1");

  // Force one layout pass after resetting the previous scale.
  void document.documentElement.offsetHeight;

  for (const page of pages) {
    const body = page.querySelector<HTMLElement>(".a4-page-body");
    if (!body) continue;

    const availableHeight = body.clientHeight;
    const naturalHeight = body.scrollHeight;
    if (!availableHeight || naturalHeight <= availableHeight + 1) continue;

    // A small safety margin prevents Chrome's print rounding from creating
    // a footer-only overflow page.
    const scale = Math.max(A4_MIN_SCALE, Math.min(1, (availableHeight / naturalHeight) * 0.975));
    page.style.setProperty("--a4-content-scale", scale.toFixed(4));
  }
}

function afterTwoFrames(callback: () => void) {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(callback);
  });
}

export default function ReportLayoutEffects() {
  const [layout, setLayout] = useState<ReportLayout>("web");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const queryLayout = new URLSearchParams(window.location.search).get("layout");
    setLayout(queryLayout === "a4" ? "a4" : "web");
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    document.body.classList.toggle("report-layout-a4", layout === "a4");
    const url = new URL(window.location.href);
    if (layout === "a4") url.searchParams.set("layout", "a4");
    else url.searchParams.delete("layout");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);

    if (layout === "a4") {
      const runFit = () => afterTwoFrames(fitA4Pages);
      if (document.fonts?.ready) void document.fonts.ready.then(runFit);
      else runFit();
    }

    return () => document.body.classList.remove("report-layout-a4");
  }, [layout, ready]);

  useEffect(() => {
    const handleBeforePrint = () => fitA4Pages();
    const handleResize = () => {
      if (document.body.classList.contains("report-layout-a4")) afterTwoFrames(fitA4Pages);
    };

    window.addEventListener("beforeprint", handleBeforePrint);
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("beforeprint", handleBeforePrint);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // 그리는 것은 없다. 위의 효과만 걸어 둔다.
  return null;
}
