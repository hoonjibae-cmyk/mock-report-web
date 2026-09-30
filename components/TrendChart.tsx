"use client";

import { useEffect, useMemo, useState } from "react";
import { LineChart } from "@/components/TrendChartSvg";
import {
  filterByMonths,
  trendData,
  type HistoryPoint,
  type TrendMetric,
  type TrendMonths,
  type TrendScope,
} from "@/lib/score-history";

const PREFS_KEY = "ys_trend_prefs";

interface Prefs {
  metric: TrendMetric;
  scope: TrendScope;
  months: TrendMonths;
}

const DEFAULT_PREFS: Prefs = { metric: "raw", scope: "total", months: 6 };

function readPrefs(): Prefs {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      metric: parsed.metric === "standard" ? "standard" : "raw",
      scope: parsed.scope === "areas" ? "areas" : "total",
      months: parsed.months === 3 || parsed.months === 12 ? parsed.months : 6,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (next: T) => void;
  disabled?: boolean;
}) {
  return (
    <span className={`trend-seg${disabled ? " disabled" : ""}`} role="group">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          className={o.value === value ? "on" : ""}
          onClick={() => onChange(o.value)}
          disabled={disabled}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}

/**
 * 학생 한 명의 성적 추이 — 담임 의견을 쓸 때 참고한다.
 *
 * 보는 방식(원점수/표준점수 · 총점/영역별 · 3·6·12개월)은 선생님이 고르고,
 * 한 번 고르면 브라우저에 남아 다음 학생·다음 시험에서도 같은 방식으로 보인다.
 * 영역별은 성취율(%)로 그리므로 원점수/표준점수 선택이 의미가 없어 잠근다.
 */
export default function TrendChart({ points, examTypeLabel }: { points: HistoryPoint[]; examTypeLabel: string }) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [today, setToday] = useState<Date | null>(null);

  // 저장된 설정은 마운트 뒤에 읽는다 — 서버가 그린 것과 첫 화면이 어긋나지 않게
  useEffect(() => {
    setPrefs(readPrefs());
    setToday(new Date());
  }, []);

  function update(next: Partial<Prefs>) {
    setPrefs((prev) => {
      const merged = { ...prev, ...next };
      try {
        window.localStorage.setItem(PREFS_KEY, JSON.stringify(merged));
      } catch {
        // 저장이 막혀 있어도 화면은 그대로 바뀐다
      }
      return merged;
    });
  }

  const visible = useMemo(
    () => (today ? filterByMonths(points, prefs.months, today) : points),
    [points, prefs.months, today],
  );
  const data = useMemo(() => trendData(visible, prefs.metric, prefs.scope), [visible, prefs.metric, prefs.scope]);
  const hasAreas = points.some((p) => p.areas.length > 0);

  return (
    <div className="trend-box">
      <div className="trend-head">
        <span className="trend-title">
          성적 추이 <span className="subtle">· {examTypeLabel} · 최근 {visible.length}회</span>
        </span>
        <div className="trend-controls">
          <Segmented
            value={prefs.metric}
            options={[
              { value: "raw", label: "원점수" },
              { value: "standard", label: "표준점수" },
            ]}
            onChange={(metric) => update({ metric })}
            disabled={prefs.scope === "areas"}
          />
          <Segmented
            value={prefs.scope}
            options={[
              { value: "total", label: "총점" },
              { value: "areas", label: "영역별" },
            ]}
            onChange={(scope) => update({ scope })}
            disabled={!hasAreas}
          />
          <Segmented
            value={prefs.months}
            options={[
              { value: 3, label: "3개월" },
              { value: 6, label: "6개월" },
              { value: 12, label: "1년" },
            ]}
            onChange={(months) => update({ months })}
          />
        </div>
      </div>
      {visible.length >= 2 ? (
        <LineChart data={data} ariaLabel="성적 추이 그래프" height={200} />
      ) : (
        <p className="subtle trend-empty">
          이 기간에는 회차가 {visible.length}개뿐이라 추이를 그릴 수 없습니다. 기간을 늘려 보세요.
        </p>
      )}
      {prefs.scope === "areas" ? (
        <p className="subtle trend-note">영역별은 회차마다 만점이 달라 성취율(%)로 그립니다.</p>
      ) : prefs.metric === "standard" ? (
        <p className="subtle trend-note">표준점수는 회차 난이도를 평균 100, 1표준편차 20으로 맞춘 값입니다.</p>
      ) : null}
    </div>
  );
}
