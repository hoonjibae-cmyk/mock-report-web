"use client";

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

export default function ReportActions() {
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

  function printA4() {
    setLayout("a4");
    afterTwoFrames(() => {
      const printAfterFit = () => {
        fitA4Pages();
        afterTwoFrames(() => window.print());
      };
      if (document.fonts?.ready) void document.fonts.ready.then(printAfterFit);
      else printAfterFit();
    });
  }

  return (
    <div className="report-actions no-print">
      <div className="report-view-switch" role="group" aria-label="성적표 보기 형식">
        <button
          type="button"
          className={`report-view-option ${layout === "web" ? "active" : ""}`}
          aria-pressed={layout === "web"}
          onClick={() => setLayout("web")}
        >
          웹·모바일 보기
        </button>
        <button
          type="button"
          className={`report-view-option ${layout === "a4" ? "active" : ""}`}
          aria-pressed={layout === "a4"}
          onClick={() => setLayout("a4")}
        >
          A4 출력 미리보기
        </button>
      </div>
      <div className="report-print-action">
        <span>A4 세로 · 배율 100% · 머리글/바닥글 해제 권장</span>
        <button type="button" className="button primary" onClick={printA4}>A4 PDF 저장·인쇄</button>
      </div>
    </div>
  );
}
