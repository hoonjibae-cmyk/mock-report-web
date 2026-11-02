"use client";

import { NO_UPLOADER, type UploaderScope, type UploaderSummary } from "@/lib/uploaders";

/**
 * 답안지를 올린 사람별 범위 선택.
 *
 * 여러 직원이 답안지를 나눠 올린 시험에서 검수·주관식 채점 화면이 "내가 올린
 * 답안지"를 먼저 보게 하는 칩 줄이다. 혼자 올린 시험이면(범위가 하나뿐) 고를 것이
 * 없으므로 그리지 않는다 — 기록 없는 옛 답안지만 있는 경우도 마찬가지다.
 */
export default function UploaderScopeBar<T extends UploaderSummary>({
  uploaders,
  scope,
  onChange,
  describe,
  note,
  disabled = false,
}: {
  uploaders: T[];
  scope: UploaderScope;
  onChange: (next: UploaderScope) => void;
  /** 칩 아래 작은 글 — 범위마다 진행 상황 */
  describe?: (entry: T) => string;
  /** 칩 줄 아래 한 줄 설명 */
  note?: string;
  disabled?: boolean;
}) {
  // 범위가 하나뿐이면 전체와 같다 — 고를 것이 없다
  if (uploaders.length < 2) return null;
  const total = uploaders.reduce((sum, u) => sum + u.total, 0);

  return (
    <div className="filter-bar uploader-scope" role="group" aria-label="올린 사람 범위">
      <div className="filter-group">
        <span className="filter-label">범위</span>
        <div className="filter-chips">
          {uploaders.map((entry) => {
            const on = scope === entry.key;
            return (
              <button
                key={entry.key}
                type="button"
                className={`${on ? "active" : ""}${entry.key === NO_UPLOADER ? " legacy" : ""}`}
                aria-pressed={on}
                disabled={disabled}
                onClick={() => onChange(entry.key)}
                title={describe ? describe(entry) : undefined}
              >
                {entry.mine ? "내가 올린 답안지" : entry.displayName}
                <em>{entry.total}</em>
              </button>
            );
          })}
          <button
            type="button"
            className={scope === null ? "active" : ""}
            aria-pressed={scope === null}
            disabled={disabled}
            onClick={() => onChange(null)}
          >
            전체<em>{total}</em>
          </button>
        </div>
      </div>
      {describe ? (
        <ul className="uploader-progress">
          {uploaders.map((entry) => (
            <li key={entry.key} className={scope === entry.key ? "active" : ""}>
              <strong>{entry.mine ? `${entry.displayName}` : entry.displayName}</strong>
              <span>{describe(entry)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {note ? <p className="uploader-note">{note}</p> : null}
    </div>
  );
}
