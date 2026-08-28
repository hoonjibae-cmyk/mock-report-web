"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 검수용 답안지 미리보기 — 확대·이동 지원.
 *
 * 원본 스캔이 아니라 **판독기가 실제로 본 이미지**(원근 보정 후 + 판정 표시)를
 * 띄운다. 잘못 읽힌 문항이 있으면 왜 그렇게 읽혔는지 눈으로 바로 확인된다.
 * 이미지는 열 때 한 장만 불러온다.
 */

const MIN_SCALE = 1;
const MAX_SCALE = 6;

export default function ScanPreview({ scanId }: { scanId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    fetch(`/api/admin/omr/scans/${scanId}/preview`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok) setError(data.error || "미리보기를 불러오지 못했습니다.");
        else setUrl(data.url);
      })
      .catch(() => alive && setError("미리보기를 불러오지 못했습니다."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [scanId]);

  const reset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  /** 배율을 바꿀 때 화면 중심(또는 커서 위치)이 그대로 있도록 위치를 보정한다 */
  const zoomAt = useCallback((next: number, cx?: number, cy?: number) => {
    setScale((current) => {
      const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
      if (clamped === current) return current;
      const box = boxRef.current;
      if (box && cx !== undefined && cy !== undefined) {
        const rect = box.getBoundingClientRect();
        const px = cx - rect.left - rect.width / 2;
        const py = cy - rect.top - rect.height / 2;
        const ratio = clamped / current;
        setOffset((o) => ({
          x: px - (px - o.x) * ratio,
          y: py - (py - o.y) * ratio,
        }));
      }
      if (clamped === MIN_SCALE) setOffset({ x: 0, y: 0 });
      return clamped;
    });
  }, []);

  if (loading) return <div className="scan-preview loading">미리보기를 불러오는 중…</div>;
  if (error || !url) {
    return (
      <div className="scan-preview empty">
        <p>{error || "미리보기가 없습니다."}</p>
      </div>
    );
  }

  return (
    <div className="scan-preview">
      <div className="scan-preview-bar">
        <span>판독기가 본 이미지</span>
        <div className="scan-preview-zoom">
          <button type="button" onClick={() => zoomAt(scale - 0.5)} aria-label="축소">−</button>
          <strong>{Math.round(scale * 100)}%</strong>
          <button type="button" onClick={() => zoomAt(scale + 0.5)} aria-label="확대">＋</button>
          <button type="button" onClick={reset} disabled={scale === 1 && offset.x === 0 && offset.y === 0}>
            원래대로
          </button>
        </div>
      </div>

      <div
        ref={boxRef}
        className={`scan-preview-stage${scale > 1 ? " zoomed" : ""}`}
        onWheel={(e) => {
          // 확대 중이 아닐 때는 페이지 스크롤을 막지 않는다
          if (!e.ctrlKey && scale === 1) return;
          e.preventDefault();
          zoomAt(scale + (e.deltaY < 0 ? 0.3 : -0.3), e.clientX, e.clientY);
        }}
        onDoubleClick={(e) => (scale > 1 ? reset() : zoomAt(2.5, e.clientX, e.clientY))}
        onPointerDown={(e) => {
          if (scale === 1) return;
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
        }}
        onPointerMove={(e) => {
          const d = dragRef.current;
          if (!d) return;
          setOffset({ x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) });
        }}
        onPointerUp={() => (dragRef.current = null)}
        onPointerLeave={() => (dragRef.current = null)}
      >
        {/* 답안지 이미지는 서명 주소로만 열리고 10분 뒤 만료된다 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt="판독한 답안지"
          draggable={false}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          }}
        />
      </div>

      <p className="scan-preview-hint">
        휠(또는 ⌘/Ctrl+휠)로 확대 · 끌어서 이동 · 두 번 눌러 확대/원래대로 ·{" "}
        <b className="mark-ok">초록</b> 단일 표기 · <b className="mark-multi">빨강</b> 중복 표기
      </p>
    </div>
  );
}
