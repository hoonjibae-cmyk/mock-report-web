import type { GrowthPoint } from "@/lib/omr-report-types";
import { shortDate } from "@/lib/score-history";

/**
 * 학부모용 성적 추이 — 회차마다 내 점수와 반 평균을 막대 둘로.
 *
 * 숫자를 막대 위에 그대로 적어 축을 읽지 않아도 된다. 표준점수 같은 보정값은
 * 여기 두지 않는다 — 학부모가 알고 싶은 것은 "몇 점이었고 올랐나"다.
 *
 * `width`·`height`는 그림의 가로·세로 비율이다(기본 640 × 230). A4 판처럼 자리가 좁은 곳은
 * 320 × 150 처럼 작게 그린다 — 글자 크기는 그림 단위 그대로라, 그림이 차지하는 실제 너비가
 * 절반이면 글자도 같은 실제 크기로 찍힌다. 막대 위 숫자와 아래 날짜의 자리는 그대로 두고
 * 막대 부분만 짧아진다.
 */
export default function ParentTrendChart({
  points,
  width = 640,
  height = 230,
}: {
  points: GrowthPoint[];
  width?: number;
  height?: number;
}) {
  const W = width;
  const H = height;
  const pad = { l: 16, r: 16, t: 34, b: 44 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const yMax = Math.max(100, ...points.map((p) => Math.max(p.raw, p.mean)));
  const yTo = (v: number) => pad.t + innerH * (1 - v / yMax);
  const base = H - pad.b;
  const group = innerW / points.length;
  const bw = Math.min(34, group * 0.3);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="성적 추이 그래프 — 회차별 내 점수와 반 평균"
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      {[0, 25, 50, 75, 100].filter((v) => v <= yMax).map((v) => (
        <line key={v} x1={pad.l} x2={W - pad.r} y1={yTo(v)} y2={yTo(v)} stroke="#e5eaf1" strokeWidth={1} />
      ))}
      {/* 범례 */}
      <g fontSize={11} fill="#667085">
        <rect x={W - pad.r - 150} y={8} width={12} height={12} rx={3} fill="#183c73" />
        <text x={W - pad.r - 133} y={18}>내 점수</text>
        <rect x={W - pad.r - 76} y={8} width={12} height={12} rx={3} fill="#d5dde9" />
        <text x={W - pad.r - 59} y={18}>반 평균</text>
      </g>
      {points.map((p, i) => {
        const cx = pad.l + group * (i + 0.5);
        const last = i === points.length - 1;
        return (
          <g key={p.examId}>
            <rect x={cx - bw - 2} y={yTo(p.raw)} width={bw} height={Math.max(0, base - yTo(p.raw))} rx={4} fill={last ? "#183c73" : "#4a6a9e"}>
              <title>{`${p.title} (${p.date}) · 내 점수 ${p.raw}점`}</title>
            </rect>
            <rect x={cx + 2} y={yTo(p.mean)} width={bw} height={Math.max(0, base - yTo(p.mean))} rx={4} fill="#d5dde9">
              <title>{`${p.title} (${p.date}) · 반 평균 ${p.mean}점`}</title>
            </rect>
            <text x={cx - bw / 2 - 2} y={yTo(p.raw) - 6} textAnchor="middle" fontSize={last ? 13.5 : 12} fontWeight={800} fill="#102b55">
              {p.raw}
            </text>
            <text x={cx + bw / 2 + 2} y={yTo(p.mean) - 6} textAnchor="middle" fontSize={10.5} fill="#667085">
              {p.mean}
            </text>
            <text x={cx} y={H - 14} textAnchor="middle" fontSize={11.5} fontWeight={last ? 700 : 500} fill="#344054">
              {shortDate(p.date)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
