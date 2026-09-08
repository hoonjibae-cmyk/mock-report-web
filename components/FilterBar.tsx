"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * 목록 화면 공용 필터·정렬 막대.
 *
 * 필터는 그룹마다 여러 개를 동시에 켤 수 있고(복수 선택), 그룹끼리는 AND로
 * 걸린다. 예: 유형 [월말평가, 반배치고사] + 만든 사람 [김선생] →
 * '월말평가 또는 반배치고사' 이면서 '김선생이 만든' 것.
 */

export interface FilterOption {
  value: string;
  label: string;
  /** 이 값에 해당하는 항목 수(0이면 흐리게 표시) */
  count?: number;
  /**
   * 이름만으로 구분이 안 될 때 밑에 한 줄 더 붙이는 말(만든 사람 등).
   * 접어 둔 필터에서만 보인다 — 칩은 한 줄짜리라 넣을 자리가 없다.
   */
  note?: string;
}

export interface FilterGroup {
  key: string;
  label: string;
  /** 보이는 차례대로 쓴다 — 정렬은 자료를 만드는 쪽에서 정해 넘긴다 */
  options: FilterOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  /**
   * 항목이 계속 늘어나는 그룹은 접어 둔다.
   *
   * 유형이나 상태처럼 가짓수가 정해진 것은 늘어놓는 편이 한눈에 보여 낫다.
   * 시험처럼 회차마다 하나씩 쌓이는 것은 한 해만 지나도 화면 절반을 덮으므로
   * 접어야 한다. 어느 쪽인지는 자료를 아는 쪽에서 정한다.
   */
  dropdown?: boolean;
  /** 접었을 때 아무것도 안 고른 상태에 쓸 말 */
  allLabel?: string;
}

/** 목록 안에 찾기 칸을 띄우기 시작할 항목 수 */
const SEARCHABLE_FROM = 8;

export interface SortSpec {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (next: string) => void;
}

interface Props {
  groups: FilterGroup[];
  sort?: SortSpec;
  search?: { value: string; onChange: (next: string) => void; placeholder?: string };
  /** 필터를 걸고 난 결과 개수 (전체 개수와 함께 표시) */
  resultLabel?: string;
  onReset?: () => void;
}

/**
 * 접어 둔 필터 하나.
 *
 * 여러 개를 동시에 고를 수 있는 것은 늘어놓았을 때와 같다. 그래서 고르면
 * 바로 닫지 않는다 — 시험 두세 개를 견주어 보려는 사람이 매번 다시 열어야
 * 한다면 접어 둔 것이 오히려 불편해진다.
 */
function FilterDropdown({ group }: { group: FilterGroup }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // 닫을 때 찾기 칸을 비운다. 다시 열었을 때 지난번 검색어 때문에 목록이
  // 비어 보이면, 항목이 사라진 것으로 읽힌다.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return group.options;
    // 밑줄에 적은 것(만든 사람 등)으로도 찾을 수 있어야 한다. 화면에 보이는
    // 글자인데 그것으로 검색이 안 되면 없는 것으로 읽힌다.
    return group.options.filter((option) =>
      `${option.label} ${option.note ?? ""}`.toLowerCase().includes(needle),
    );
  }, [group.options, query]);

  const allLabel = group.allLabel ?? "전체";
  const chosen = group.options.filter((option) => group.selected.includes(option.value));
  const summary =
    chosen.length === 0
      ? allLabel
      : chosen.length === 1
        ? chosen[0].label
        : `${chosen[0].label} 외 ${chosen.length - 1}개`;

  function toggle(value: string) {
    group.onChange(
      group.selected.includes(value)
        ? group.selected.filter((v) => v !== value)
        : [...group.selected, value],
    );
  }

  return (
    <div className={`filter-dropdown${open ? " open" : ""}`} ref={boxRef}>
      <button
        type="button"
        className={`filter-dropdown-trigger${chosen.length > 0 ? " active" : ""}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="filter-dropdown-summary">{summary}</span>
        {chosen.length > 0 ? <em>{chosen.length}</em> : null}
        <span className="filter-dropdown-caret" aria-hidden="true" />
      </button>

      {open ? (
        <div className="filter-dropdown-panel" role="listbox" aria-multiselectable="true">
          {group.options.length >= SEARCHABLE_FROM ? (
            <input
              className="filter-dropdown-search"
              value={query}
              autoFocus
              placeholder={`${group.label} 찾기`}
              onChange={(e) => setQuery(e.target.value)}
            />
          ) : null}

          <div className="filter-dropdown-list">
            {visible.length === 0 ? (
              <p className="filter-dropdown-empty">찾는 {group.label}이(가) 없습니다.</p>
            ) : (
              visible.map((option) => {
                const on = group.selected.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={on}
                    className={`filter-dropdown-option${on ? " on" : ""}${
                      option.count === 0 ? " empty" : ""
                    }`}
                    onClick={() => toggle(option.value)}
                  >
                    <span className="check" aria-hidden="true" />
                    <span className="text">
                      <span className="main">{option.label}</span>
                      {option.note ? <small>{option.note}</small> : null}
                    </span>
                    {typeof option.count === "number" ? <em>{option.count}</em> : null}
                  </button>
                );
              })
            )}
          </div>

          {chosen.length > 0 ? (
            <button
              type="button"
              className="filter-dropdown-clear"
              onClick={() => group.onChange([])}
            >
              {group.label} 선택 해제
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function FilterBar({ groups, sort, search, resultLabel, onReset }: Props) {
  const active =
    groups.some((g) => g.selected.length > 0) || Boolean(search?.value.trim());

  function toggle(group: FilterGroup, value: string) {
    group.onChange(
      group.selected.includes(value)
        ? group.selected.filter((v) => v !== value)
        : [...group.selected, value],
    );
  }

  return (
    <div className="filter-bar">
      {groups
        .filter((group) => group.options.length > 0)
        .map((group) => (
          <div className="filter-group" key={group.key}>
            <span className="filter-label">{group.label}</span>
            {group.dropdown ? (
              <FilterDropdown group={group} />
            ) : (
            <div className="filter-chips">
              {group.options.map((option) => {
                const on = group.selected.includes(option.value);
                const empty = option.count === 0;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`${on ? "active" : ""}${empty ? " empty" : ""}`}
                    aria-pressed={on}
                    onClick={() => toggle(group, option.value)}
                  >
                    {option.label}
                    {typeof option.count === "number" ? (
                      <em>{option.count}</em>
                    ) : null}
                  </button>
                );
              })}
            </div>
            )}
          </div>
        ))}

      <div className="filter-tail">
        {search ? (
          <input
            className="filter-search"
            value={search.value}
            placeholder={search.placeholder ?? "검색"}
            onChange={(e) => search.onChange(e.target.value)}
          />
        ) : null}
        {sort ? (
          <label className="filter-sort">
            <span>정렬</span>
            <select value={sort.value} onChange={(e) => sort.onChange(e.target.value)}>
              {sort.options.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        ) : null}
        {resultLabel ? <span className="filter-result">{resultLabel}</span> : null}
        {active && onReset ? (
          <button type="button" className="button tiny ghost" onClick={onReset}>
            필터 초기화
          </button>
        ) : null}
      </div>
    </div>
  );
}
