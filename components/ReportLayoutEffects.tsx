"use client";

// 성적표 화면의 A4 출력 장치.
//
// 학부모에게는 **눈에 보이는 것이 없다.** 예전에는 여기에 '웹·모바일 보기 / A4 출력
// 미리보기' 전환과 인쇄 버튼이 함께 있었는데, 이 화면은 학부모가 받는 성적표다.
// 학부모에게 출력 설정을 고르라고 내미는 것은 자리를 잘못 잡은 것이라 걷어냈다.
//
// 기능은 그대로 남는다.
//   - 주소에 `?layout=a4` 가 붙으면 A4 판으로 그린다(관리자 화면의 'A4' 버튼)
//   - 인쇄를 누르는 순간 페이지가 A4 한 장에 들어가도록 배율을 맞춘다
//
// 직원이 볼 때(`tools`)만 아래에 작은 막대를 띄운다 — 웹/A4 보기 전환과 '인쇄 · PDF 저장'.
// 직원인지는 서버(/r/[token])가 로그인 상태로 판단해 넘기므로, 학부모 화면에서는 이 prop 이
// 절대 참이 되지 않는다.

import { useEffect, useRef, useState } from "react";

import { afterTwoFrames, fitA4Pages } from "@/lib/a4-fit";

type ReportLayout = "web" | "a4";

export default function ReportLayoutEffects({ tools = false }: { tools?: boolean }) {
  const [layout, setLayout] = useState<ReportLayout>("web");
  const [ready, setReady] = useState(false);
  // 웹 보기에서 '인쇄'를 누르면 A4 판으로 바꾼 뒤 배율을 맞추고 나서 인쇄 창을 연다
  const printPending = useRef(false);

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
      const runFit = () =>
        afterTwoFrames(() => {
          fitA4Pages();
          if (printPending.current) {
            printPending.current = false;
            window.print();
          }
        });
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
    if (layout === "a4") {
      fitA4Pages();
      window.print();
      return;
    }
    printPending.current = true;
    setLayout("a4");
  }

  // 학부모 화면 — 그리는 것은 없다. 위의 효과만 걸어 둔다.
  if (!tools || !ready) return null;

  return (
    <div className="report-staff-tools no-print" role="toolbar" aria-label="직원용 보기·인쇄 도구">
      <span className="report-staff-tools-label">직원 전용</span>
      <div className="report-staff-tools-switch">
        <button type="button" aria-pressed={layout === "web"} onClick={() => setLayout("web")}>
          웹 보기
        </button>
        <button type="button" aria-pressed={layout === "a4"} onClick={() => setLayout("a4")}>
          A4 보기
        </button>
      </div>
      <button
        type="button"
        className="report-staff-tools-print"
        onClick={printA4}
        title="A4 판으로 인쇄합니다. 인쇄 창에서 대상을 ‘PDF로 저장’으로 고르면 파일로 받습니다."
      >
        인쇄 · PDF 저장
      </button>
    </div>
  );
}
