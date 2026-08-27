import AcademyLogo from "@/components/AcademyLogo";
import ReportActions from "@/components/ReportActions";
import type { GenericReportData, GrowthPoint } from "@/lib/omr-report-types";

/** 열람 시점에 주입되는 담임 의견(성적표 생성 후에도 수정 가능) */
export interface ReportComments {
  /** 시험 공통 총평 */
  overview: string | null;
  /** 학생별 개별 의견 */
  personal: string | null;
  /** 성적표에 칩으로 노출되는 긍정 키워드 */
  keywords: string[];
}

/** 표준점수 성장 추이 — 단일 시리즈 라인, 기준선 100 */
function GrowthChart({ points }: { points: GrowthPoint[] }) {
  const W = 640;
  const H = 220;
  const pad = { l: 44, r: 28, t: 18, b: 40 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;

  const values = points.map((p) => p.standardScore);
  const yMin = Math.min(80, Math.floor((Math.min(...values) - 8) / 10) * 10);
  const yMax = Math.max(120, Math.ceil((Math.max(...values) + 8) / 10) * 10);
  const yTo = (v: number) => pad.t + innerH * (1 - (v - yMin) / (yMax - yMin));
  const xTo = (i: number) =>
    pad.l + (points.length === 1 ? innerW / 2 : (innerW * i) / (points.length - 1));

  const gridStep = yMax - yMin > 60 ? 20 : 10;
  const gridLines: number[] = [];
  for (let v = yMin; v <= yMax; v += gridStep) gridLines.push(v);

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${xTo(i).toFixed(1)},${yTo(p.standardScore).toFixed(1)}`)
    .join(" ");

  const fmtDate = (d: string) => {
    const [y, m] = d.split("-");
    return y && m ? `${y.slice(2)}.${m}` : d;
  };

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="표준점수 추이 그래프"
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      {gridLines.map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={yTo(v)} y2={yTo(v)} stroke="#e5eaf1" strokeWidth={1} />
          <text x={pad.l - 8} y={yTo(v) + 4} textAnchor="end" fontSize={11} fill="#667085">
            {v}
          </text>
        </g>
      ))}
      {/* 기준선 100 = 이번 집단 평균 환산 */}
      <line
        x1={pad.l}
        x2={W - pad.r}
        y1={yTo(100)}
        y2={yTo(100)}
        stroke="#98a2b3"
        strokeWidth={1.5}
        strokeDasharray="5 4"
      />
      <text x={W - pad.r} y={yTo(100) - 6} textAnchor="end" fontSize={11} fill="#667085">
        평균(100)
      </text>

      <path d={path} fill="none" stroke="#183c73" strokeWidth={2.5} strokeLinejoin="round" />
      {points.map((p, i) => {
        const last = i === points.length - 1;
        return (
          <g key={p.examId}>
            <circle
              cx={xTo(i)}
              cy={yTo(p.standardScore)}
              r={last ? 6 : 4.5}
              fill={last ? "#183c73" : "#fff"}
              stroke="#183c73"
              strokeWidth={2}
            >
              <title>{`${p.title} (${p.date}) · 표준점수 ${p.standardScore} · 원점수 ${p.raw}점(평균 ${p.mean}점)`}</title>
            </circle>
            {(i === 0 || last) ? (
              <text
                x={i === 0 && !last ? xTo(i) + 10 : xTo(i)}
                y={yTo(p.standardScore) - 12}
                textAnchor={i === 0 && !last ? "start" : "middle"}
                fontSize={last ? 13 : 11}
                fontWeight={last ? 800 : 600}
                fill={last ? "#102b55" : "#667085"}
              >
                {p.standardScore}
              </text>
            ) : null}
            <text x={xTo(i)} y={H - 12} textAnchor="middle" fontSize={11} fill="#667085">
              {fmtDate(p.date)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** 응시 집단 내 위치 바 — 최저~최고 트랙 위에 평균·내 점수 마커 */
function DistributionBar({ report }: { report: GenericReportData }) {
  const { cohort, score } = report;
  const span = Math.max(cohort.max - cohort.min, 0.001);
  const pos = (v: number) => `${Math.max(0, Math.min(100, ((v - cohort.min) / span) * 100))}%`;
  return (
    <div className="dist-wrap">
      <div className="dist-track">
        <span className="dist-marker mean" style={{ left: pos(cohort.mean) }}>
          <i />
          <em>평균 {cohort.mean}</em>
        </span>
        <span className="dist-marker me" style={{ left: pos(score.raw) }}>
          <i />
          <em>{report.student.name} {score.raw}</em>
        </span>
      </div>
      <div className="dist-ends">
        <span>최저 {cohort.min}점</span>
        <span>최고 {cohort.max}점</span>
      </div>
    </div>
  );
}

export default function GenericReport({
  report,
  comments,
}: {
  report: GenericReportData;
  comments?: ReportComments;
}) {
  const { score, cohort } = report;
  const wrongItems = report.items.filter((item) => !item.correct);
  const weakSet = new Set(report.weakItems);
  const overviewText = comments?.overview ?? null;
  const personalText = comments?.personal ?? report.teacherComment?.text ?? null;
  const keywordChips = comments?.keywords ?? [];

  return (
    <main className="report-shell">
      <ReportActions />
      <article className="report-document web-report-document">
        <header className="report-hero">
          <div className="brand-lockup report-brand">
            <AcademyLogo size="large" />
            <div>
              <strong>{report.academy}</strong>
              <span>개인 성적표</span>
            </div>
          </div>
          <div className="report-title-block">
            <p>{report.examTypeLabel}{report.examDate ? ` · ${report.examDate}` : ""}</p>
            <h1>{report.examTitle}</h1>
          </div>
          <div className="student-strip">
            <div><span>학생명</span><strong>{report.student.name}</strong></div>
            <div><span>수험번호</span><strong>{report.student.key}</strong></div>
            <div><span>학교·학년</span><strong>{report.student.school || "미입력"}</strong></div>
            <div><span>발행일</span><strong>{new Date(report.generatedAt).toLocaleDateString("ko-KR")}</strong></div>
          </div>
        </header>

        <section className="overall-section">
          <div className="overall-kpis generic-kpis">
            <div>
              <span>원점수</span>
              <strong>{score.raw}</strong>
              <small>/ {score.max}점</small>
            </div>
            {report.grade != null ? (
              <div>
                <span>등급</span>
                <strong>{report.grade}</strong>
                <small>등급 (절대평가)</small>
              </div>
            ) : (
              <div>
                <span>상위</span>
                <strong>{report.topPercent}%</strong>
                <small>응시 {cohort.count}명 기준</small>
              </div>
            )}
            <div>
              <span>학원 석차</span>
              <strong>{report.rank}</strong>
              <small>/ {cohort.count}명</small>
            </div>
            <div>
              <span>표준점수</span>
              <strong>{report.standardScore}</strong>
              <small>평균=100 · 난이도 보정</small>
            </div>
          </div>

          <section className="analysis-card">
            <div className="card-title-row">
              <h4>응시 집단 내 위치</h4>
              <span>
                {cohort.count}명 응시 · 평균 {cohort.mean}점 · 표준편차 {cohort.stdev}
              </span>
            </div>
            <DistributionBar report={report} />
            <p className="subtle" style={{ marginTop: 10 }}>
              맞은 문항 {score.correctCount} · 틀린 문항 {score.wrongCount}
              {score.blankCount > 0 ? ` · 미표기 ${score.blankCount}` : ""} (총 {score.totalQuestions}문항)
              {report.essayCount > 0
                ? ` · 서술형 ${report.essayCount}문항은 선생님이 별도로 채점해 안내합니다.`
                : ""}
            </p>
          </section>
        </section>

        {report.growth.length >= 2 ? (
          <section className="analysis-card">
            <div className="card-title-row">
              <h4>표준점수 성장 추이</h4>
              <span>{report.examTypeLabel} 기준 · 회차 난이도 보정</span>
            </div>
            <GrowthChart points={report.growth} />
            <p className="subtle">
              표준점수는 매회 시험의 난이도 차이를 평균 100, 1표준편차 20으로 환산해 비교하는
              값입니다. 100보다 크면 그 회차 평균보다 잘한 것입니다.
            </p>
          </section>
        ) : null}

        <section className="analysis-card">
          <div className="card-title-row">
            <h4>문항별 채점 결과</h4>
            <span>표기 → 정답 · 색과 기호로 표시</span>
          </div>
          <div className="omr-item-grid">
            {report.items.map((item) => (
              <div
                key={item.no}
                className={`omr-item-cell ${item.correct ? "ok" : item.marked == null ? "blank" : "wrong"}${weakSet.has(item.no) ? " weak" : ""}`}
                title={`${item.no}번 · 배점 ${item.point} · 정답률 ${item.correctRate}%`}
              >
                <span className="no">{item.no}</span>
                <span className="mark">
                  {item.correct ? "○" : item.marked == null ? "–" : `${item.marked}→${item.answer ?? "?"}`}
                </span>
              </div>
            ))}
          </div>
          <p className="subtle" style={{ marginTop: 8 }}>
            ○ 정답 · 숫자→숫자 오답(내 표기→정답) · – 미표기 · 붉은 테두리는 우선 복습 문항
          </p>
        </section>

        {wrongItems.length > 0 ? (
          <section className="analysis-card">
            <div className="card-title-row">
              <h4>우선 복습 문항</h4>
              <span>틀린 문항 중 반 정답률이 낮은 순</span>
            </div>
            <table className="report-table">
              <thead>
                <tr><th>문항</th><th>내 표기</th><th>정답</th><th>배점</th><th>반 정답률</th></tr>
              </thead>
              <tbody>
                {wrongItems
                  .slice()
                  .sort((a, b) => a.correctRate - b.correctRate)
                  .slice(0, 8)
                  .map((item) => (
                    <tr key={item.no}>
                      <td><strong>{item.no}번</strong></td>
                      <td>{item.marked ?? "미표기"}</td>
                      <td>{item.answer}</td>
                      <td>{item.point}점</td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div className="metric-bar-track" style={{ width: 96, flex: "0 0 auto" }}>
                            <span style={{ width: `${item.correctRate}%` }} />
                          </div>
                          <span style={{ fontSize: 12, color: "#667085", whiteSpace: "nowrap" }}>
                            {item.correctRate}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <p className="subtle">
              반 정답률이 낮은 문항일수록 어려웠던 문항입니다. 정답률이 높은데 틀린 문항부터
              우선 점검하면 효율적입니다.
            </p>
          </section>
        ) : null}

        {overviewText || personalText ? (
          <section className="ai-review-card">
            <div className="ai-label"><span>담임</span><strong>선생님 의견</strong></div>
            {overviewText ? (
              <div style={{ marginBottom: personalText ? 18 : 0 }}>
                <h3 style={{ margin: "0 0 6px", fontSize: 14.5 }}>이번 시험 총평</h3>
                <p className="review-overview" style={{ whiteSpace: "pre-wrap" }}>{overviewText}</p>
              </div>
            ) : null}
            {personalText ? (
              <div>
                <h3 style={{ margin: "0 0 6px", fontSize: 14.5 }}>
                  {report.student.name} 학생에게
                </h3>
                {keywordChips.length > 0 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "0 0 10px" }}>
                    {keywordChips.map((keyword) => (
                      <span
                        key={keyword}
                        style={{
                          padding: "3px 11px",
                          borderRadius: 99,
                          fontSize: 12.5,
                          fontWeight: 750,
                          background: "rgba(255,255,255,.16)",
                          border: "1px solid rgba(255,255,255,.35)",
                        }}
                      >
                        #{keyword}
                      </span>
                    ))}
                  </div>
                ) : null}
                <p className="review-overview" style={{ whiteSpace: "pre-wrap" }}>{personalText}</p>
              </div>
            ) : null}
          </section>
        ) : null}

        <footer className="report-footer">
          <div className="footer-brand">
            <AcademyLogo size="small" />
            <strong>{report.academy}</strong>
          </div>
          <div>
            <p>본 성적표는 OMR 답안을 자동 판독·채점한 결과이며, 석차·표준점수는 학원 응시 집단 기준입니다.</p>
            <p>문의는 학원으로 연락 주세요.</p>
          </div>
        </footer>
      </article>
    </main>
  );
}
