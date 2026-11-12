"use client";

import type { ScanDay } from "@/lib/scan-filter";

/**
 * 답안지 찾기 줄 — 이름·수험번호 검색 칸과 올린 날짜 칩.
 *
 * 검수·성적표 생성·결과 요약 화면이 같이 쓴다. 목록이 짧고 날짜가 하루뿐이면 고를 것이
 * 없으므로 그리지 않는다. 찾기는 보는 것만 좁힌다 — 성적표 생성이나 일괄 처리의 대상이
 * 어떻게 되는지는 각 화면이 제 글로 말한다.
 */
export default function ScanFilterBar({
  query,
  onQuery,
  days = [],
  day = null,
  onDay,
  total,
  shown,
  unit = "장",
  placeholder = "학생 이름 · 수험번호 · 파일명",
  dayLabel = "올린 날짜",
  note,
  minTotal = 5,
}: {
  query: string;
  onQuery: (next: string) => void;
  /** 올린 날짜별 장수 — 둘 이상일 때만 칩이 나온다 */
  days?: ScanDay[];
  day?: string | null;
  onDay?: (next: string | null) => void;
  /** 좁히기 전 장수(범위 안) */
  total: number;
  /** 좁힌 뒤 보이는 장수 */
  shown: number;
  unit?: string;
  placeholder?: string;
  dayLabel?: string;
  /** 줄 아래 한 줄 설명 */
  note?: string;
  /** 이보다 적으면(그리고 날짜도 하루뿐이면) 그리지 않는다 */
  minTotal?: number;
}) {
  const hasDays = days.length > 1 && Boolean(onDay);
  if (total < minTotal && !hasDays && !query) return null;
  const filtering = query.trim() !== "" || day !== null;

  return (
    <div className="filter-bar scan-filter" role="search" aria-label="답안지 찾기">
      <div className="filter-group">
        <span className="filter-label">찾기</span>
        <div className="scan-search">
          <input
            type="search"
            value={query}
            placeholder={placeholder}
            aria-label={placeholder}
            onChange={(event) => onQuery(event.target.value)}
          />
          {query ? (
            <button type="button" className="scan-search-clear" onClick={() => onQuery("")} aria-label="검색어 지우기">
              ×
            </button>
          ) : null}
          <span className="scan-search-count" aria-live="polite">
            {filtering ? `${shown}/${total}${unit} 표시` : `${total}${unit}`}
          </span>
        </div>
      </div>
      {hasDays ? (
        <div className="filter-group">
          <span className="filter-label">{dayLabel}</span>
          <div className="filter-chips">
            <button type="button" className={day === null ? "active" : ""} aria-pressed={day === null} onClick={() => onDay?.(null)}>
              전체<em>{total}</em>
            </button>
            {days.map((entry) => (
              <button
                key={entry.key}
                type="button"
                className={day === entry.key ? "active" : ""}
                aria-pressed={day === entry.key}
                onClick={() => onDay?.(day === entry.key ? null : entry.key)}
                title={`${entry.label}에 올린 답안지 ${entry.total}${unit} (검수 완료 ${entry.reviewed}${unit})`}
              >
                {entry.label}
                <em>{entry.total}</em>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {note ? <p className="uploader-note">{note}</p> : null}
    </div>
  );
}
