import type { TrendData } from "@/lib/score-history";

/**
 * 선 그래프 한 장 — 훅 없는 순수 SVG라 서버 컴포넌트(성적표)와 클라이언트
 * (담임 의견 화면) 어디서나 그린다. 무엇을 그릴지는 lib/score-history 가 정한다.
 */
export function LineChart({ data, ariaLabel, height = 220 }: { data: TrendData; ariaLabel: string; height?: number }) {
  const W = 640;
  const H = height;
  const pad = { l: 44, r: 44, t: 22, b: 40 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const n = data.labels.length;
  const span = Math.max(data.yMax - data.yMin, 1);

  const yTo = (v: number) => pad.t + innerH * (1 - (v - data.yMin) / span);
  const xTo = (i: number) => pad.l + (n <= 1 ? innerW / 2 : (innerW * i) / (n - 1));

  const gridStep = span > 60 ? 20 : 10;
  const grid: number[] = [];
  for (let v = data.yMin; v <= data.yMax + 0.001; v += gridStep) grid.push(Math.round(v * 10) / 10);

  // 선이 여럿이면 값을 마지막 점에만, 오른쪽으로 비켜 적는다 — 겹쳐서 못 읽는다
  const multi = data.series.filter((s) => s.emphasize).length > 1;

  const pathOf = (values: Array<number | null>) => {
    let d = "";
    let pen = false;
    values.forEach((v, i) => {
      if (v === null || v === undefined) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${xTo(i).toFixed(1)},${yTo(v).toFixed(1)} `;
      pen = true;
    });
    return d.trim();
  };

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} style={{ width: "100%", height: "auto", display: "block" }}>
        {grid.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={yTo(v)} y2={yTo(v)} stroke="#e5eaf1" strokeWidth={1} />
            <text x={pad.l - 8} y={yTo(v) + 4} textAnchor="end" fontSize={11} fill="#667085">
              {v}
            </text>
          </g>
        ))}
        {data.baseline ? (
          <>
            <line
              x1={pad.l}
              x2={W - pad.r}
              y1={yTo(data.baseline.value)}
              y2={yTo(data.baseline.value)}
              stroke="#98a2b3"
              strokeWidth={1.5}
              strokeDasharray="5 4"
            />
            <text x={W - pad.r} y={yTo(data.baseline.value) - 6} textAnchor="end" fontSize={11} fill="#667085">
              {data.baseline.label}
            </text>
          </>
        ) : null}

        {data.series.map((s) => (
          <g key={s.name}>
            <path
              d={pathOf(s.values)}
              fill="none"
              stroke={s.color}
              strokeWidth={s.emphasize ? 2.5 : 2}
              strokeDasharray={s.dashed ? "5 4" : undefined}
              strokeLinejoin="round"
            />
            {s.values.map((v, i) => {
              if (v === null || v === undefined) return null;
              const last = i === n - 1;
              return (
                <g key={i}>
                  <circle
                    cx={xTo(i)}
                    cy={yTo(v)}
                    r={last && s.emphasize ? 5.5 : 4}
                    fill={s.emphasize ? (last ? s.color : "#fff") : "#fff"}
                    stroke={s.color}
                    strokeWidth={2}
                  >
                    <title>{`${data.titles[i]} · ${s.name} ${v}${data.unit}`}</title>
                  </circle>
                  {s.emphasize && (!multi || last) ? (
                    <text
                      x={multi ? xTo(i) + 9 : xTo(i)}
                      y={multi ? yTo(v) + 4 : yTo(v) - 11}
                      textAnchor={multi ? "start" : "middle"}
                      fontSize={last ? 12.5 : 11}
                      fontWeight={last ? 800 : 600}
                      fill={last ? s.color : "#667085"}
                    >
                      {v}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </g>
        ))}

        {data.labels.map((label, i) => (
          <text key={i} x={xTo(i)} y={H - 12} textAnchor="middle" fontSize={11} fill="#667085">
            {label}
          </text>
        ))}
      </svg>
      {data.series.length > 1 ? (
        <div className="trend-legend">
          {data.series.map((s) => (
            <span key={s.name}>
              <i style={{ background: s.dashed ? "transparent" : s.color, borderColor: s.color, borderStyle: s.dashed ? "dashed" : "solid" }} />
              {s.name}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
