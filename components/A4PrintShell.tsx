"use client";

/**
 * 시험 전체 A4 인쇄 화면의 껍데기 — 위에 도구 막대, 아래에 학생들의 A4 쪽.
 *
 * 성적표의 A4 판(`.a4-report-root`)은 보통 숨어 있다가 body 에 `report-layout-a4` 가 붙으면
 * 나온다. 이 화면은 처음부터 A4 판이 목적이므로 들어오자마자 그 표식을 붙이고, 글꼴이 자리
 * 잡은 뒤 쪽마다 넘치는 내용을 줄여 넣는다(fitA4Pages). 인쇄 직전에도 한 번 더 맞춘다.
 * 도구 막대는 인쇄에 찍히지 않는다(.no-print).
 */

import Link from "next/link";
import { useEffect, type ReactNode } from "react";

import { afterTwoFrames, fitA4Pages } from "@/lib/a4-fit";

export default function A4PrintShell({
  title,
  subtitle,
  count,
  pageCount,
  backHref,
  summaryHref,
  printHref,
  classNames,
  activeClass,
  children,
}: {
  title: string;
  subtitle: string;
  /** 이 화면에 실린 학생 수 */
  count: number;
  /** 이 화면의 A4 쪽 수(어림) */
  pageCount: number;
  backHref: string;
  summaryHref: string;
  /** 반 고르기 링크의 바탕 주소(?class= 를 붙인다) */
  printHref: string;
  /** 성적표에 적힌 반 이름들 — 둘 이상이면 반별로 뽑을 수 있게 고르는 칸을 둔다 */
  classNames: string[];
  activeClass: string | null;
  children: ReactNode;
}) {
  useEffect(() => {
    document.body.classList.add("report-layout-a4", "a4-print-body");
    const fit = () => fitA4Pages();
    const run = () => afterTwoFrames(fit);
    if (document.fonts?.ready) void document.fonts.ready.then(run);
    else run();
    window.addEventListener("beforeprint", fit);
    return () => {
      document.body.classList.remove("report-layout-a4", "a4-print-body");
      window.removeEventListener("beforeprint", fit);
    };
  }, [count, activeClass]);

  return (
    <>
      <div className="a4-print-toolbar no-print" role="toolbar" aria-label="인쇄 도구">
        <div className="a4-print-toolbar-title">
          <strong>성적표 A4 인쇄 · {title}</strong>
          <span>
            {subtitle} · 학생 {count}명 · 약 {pageCount}쪽
          </span>
        </div>
        <div className="a4-print-toolbar-actions">
          <Link className="button ghost" href={backHref}>
            ← 성적표 생성
          </Link>
          <Link className="button ghost" href={summaryHref}>
            결과 요약
          </Link>
          <button
            className="button primary"
            type="button"
            disabled={count === 0}
            onClick={() => {
              fitA4Pages();
              window.print();
            }}
          >
            인쇄 · PDF 저장
          </button>
        </div>
        {classNames.length > 1 ? (
          <div className="a4-print-classes" aria-label="반 고르기">
            <span>반 고르기</span>
            <Link href={printHref} aria-current={activeClass ? undefined : "page"}>
              전체
            </Link>
            {classNames.map((name) => (
              <Link
                key={name}
                href={`${printHref}?class=${encodeURIComponent(name)}`}
                aria-current={activeClass === name ? "page" : undefined}
              >
                {name}
              </Link>
            ))}
          </div>
        ) : null}
        <p className="a4-print-tip">
          인쇄 창에서 <b>대상</b>을 ‘PDF로 저장’으로 고르면 파일로 받을 수 있습니다. 용지는 <b>A4</b>, 여백은 ‘기본값’
          그대로 두세요. 학생마다 새 쪽에서 시작하고 바닥글에 시험명과 학생 이름이 찍혀 있어 나눠 줄 때 섞이지
          않습니다. 담임 의견은 확정(저장)한 글만 실립니다.
        </p>
      </div>
      <main className="report-shell a4-print-shell">{children}</main>
    </>
  );
}
