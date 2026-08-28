"use client";

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
}

export interface FilterGroup {
  key: string;
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (next: string[]) => void;
}

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
