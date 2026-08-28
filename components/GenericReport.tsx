import AcademyLogo from "@/components/AcademyLogo";
import ReportActions from "@/components/ReportActions";
import { formatChoices, toChoices } from "@/lib/omr-answers";
import type { AreaStat, GenericReportData, GrowthPoint } from "@/lib/omr-report-types";

/** 열람 시점에 주입되는 담임 의견(성적표 생성 후에도 수정 가능) */
export interface ReportComments {
  /** 시험 공통 총평 */
  overview: string | null;
  /** 영역별 출제 안내 — 응시생 전원에게 똑같이 실린다 */
  areaNotes?: Array<{ area: string; text: string }>;
  /** 학생별 개별 의견(종합 평가) */
  personal: string | null;
  /** 영역별 평가 — 등급 + 서술 */
  areaFeedback?: Array<{ area: string; rating: string; text: string }>;
  /** 성적표에 칩으로 노출되는 긍정 키워드 */
  keywords: string[];
}

/** 등급 이름을 CSS 클래스로 — 한글 클래스명 대신 안정적인 영문 키를 쓴다 */
function ratingClass(rating: string): string {
  if (rating === "매우 우수") return "best";
  if (rating === "우수") return "good";
  if (rating === "보통") return "fair";
  return "work";
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

/** 영역별 성취율 — 학생 막대 위에 집단 평균 마커를 겹쳐 비교한다 */
function AreaBars({ areas }: { areas: AreaStat[] }) {
  return (
    <div className="area-bars">
      {areas.map((stat) => {
        const diff = Math.round((stat.rate - stat.cohortRate) * 10) / 10;
        return (
          <div className="area-row" key={stat.area}>
            <div className="area-head">
              <strong>{stat.area}</strong>
              <span>
                {stat.earned}/{stat.possible}점 · {stat.rate}%
                <em className={diff >= 0 ? "up" : "down"}>
                  {diff >= 0 ? `평균 +${diff}` : `평균 ${diff}`}
                </em>
              </span>
            </div>
            <div className="area-track">
              <span className="area-fill" style={{ width: `${Math.max(0, Math.min(100, stat.rate))}%` }} />
              <span
                className="area-avg"
                style={{ left: `${Math.max(0, Math.min(100, stat.cohortRate))}%` }}
                title={`반 평균 ${stat.cohortRate}%`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * 갈래별 성취 표 — 막대만으로는 '몇 점 만점에 몇 점'이 안 보인다.
 * 배점·득점·반 평균을 숫자로 함께 실어 학부모가 바로 읽을 수 있게 한다.
 */
function AreaTable({ areas }: { areas: AreaStat[] }) {
  return (
    <div className="area-table-wrap">
      <table className="area-table">
        <thead>
          <tr>
            <th>영역</th>
            <th>배점</th>
            <th>득점</th>
            <th>반 평균</th>
            <th>내 성취율</th>
            <th>반 평균 성취율</th>
          </tr>
        </thead>
        <tbody>
          {areas.map((stat) => (
            <tr key={stat.area}>
              <td className="name">{stat.area}</td>
              <td>{stat.possible}</td>
              <td>
                <strong>{stat.earned}</strong>
              </td>
              <td>{stat.cohortEarned}</td>
              <td className={stat.rate >= stat.cohortRate ? "up" : "down"}>{stat.rate}%</td>
              <td>{stat.cohortRate}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 분석영역 / 내용 두 계층에 같은 모양으로 쓰는 분석 묶음 */
function BreakdownSection({
  title,
  hint,
  note,
  areas,
}: {
  title: string;
  hint: string;
  note: string;
  areas: AreaStat[];
}) {
  return (
    <section className="analysis-card">
      <div className="card-title-row">
        <h4>{title}</h4>
        <span>{hint}</span>
      </div>
      <AreaBars areas={areas} />
      <AreaTable areas={areas} />
      <p className="subtle" style={{ marginTop: 10 }}>
        {note}
      </p>
    </section>
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
  // 분류를 입력한 시험에서만 상세 표를 싣는다 — 없는 열을 빈칸으로 채우면 지저분하다
  const hasArea = report.items.some((item) => item.area);
  const hasContent = report.items.some((item) => item.content);
  const hasBreakdown = hasArea || hasContent;
  const hasSpecifiedDifficulty = report.items.some((item) => item.difficultySpecified);
  const weakSet = new Set(report.weakItems);
  const overviewText = comments?.overview ?? null;
  const personalText = comments?.personal ?? report.teacherComment?.text ?? null;
  const keywordChips = comments?.keywords ?? [];
  const areaNotes = (comments?.areaNotes ?? []).filter((entry) => entry.text.trim());
  const areaFeedback = (comments?.areaFeedback ?? []).filter(
    (entry) => entry.text.trim() || entry.rating,
  );

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
                ? ` · 객관식 ${score.objectiveRaw}점 + 서술형 ${score.essayRaw}점(${report.essayCount}문항)`
                : ""}
            </p>
          </section>
        </section>

        {report.national ? (
          <section className="analysis-card">
            <div className="card-title-row">
              <h4>전국 비교</h4>
              <span>{report.national.subjectLabel} · 전국연합학력평가 기준</span>
            </div>
            <div className="national-grid">
              <div>
                <span>전국 등급</span>
                <strong>{report.national.grade}등급</strong>
              </div>
              <div>
                <span>전국 상위 추정</span>
                <strong>{report.national.topPercent}%</strong>
              </div>
              {report.national.average !== null ? (
                <>
                  <div>
                    <span>전국 평균</span>
                    <strong>{report.national.average}점</strong>
                  </div>
                  <div>
                    <span>전국 평균 대비</span>
                    <strong className={(report.national.diffFromAverage ?? 0) >= 0 ? "up" : "down"}>
                      {(report.national.diffFromAverage ?? 0) >= 0 ? "+" : ""}
                      {report.national.diffFromAverage}점
                    </strong>
                  </div>
                </>
              ) : null}
            </div>
            <p className="subtle" style={{ marginTop: 10 }}>{report.national.note}</p>
          </section>
        ) : null}

        {report.classificationStats && report.classificationStats.length > 0 ? (
          <section className="analysis-card">
            <div className="card-title-row">
              <h4>분류 기준별 성취</h4>
              <span>막대 = 내 성취율 · 세로선 = 반 평균</span>
            </div>
            {report.classificationStats.map((group) => (
              <div key={group.kind} className="classification-group">
                <p className="classification-label">{group.label}</p>
                <AreaBars areas={group.rows} />
              </div>
            ))}
            <p className="subtle" style={{ marginTop: 10 }}>
              행동영역·내용영역·난이도·학년 수준은 공식 정답·해설의 출제 의도를 바탕으로 학원
              진단용으로 재분류한 기준입니다.
            </p>
          </section>
        ) : null}

        {report.areas.length > 0 ? (
          <BreakdownSection
            title="영역별 분석"
            hint="막대 = 내 성취율 · 세로선 = 반 평균"
            note="듣기·문법·독해처럼 큰 갈래로 묶은 결과입니다. 성취율이 낮은 영역부터 표시했으니, 반 평균보다 낮은 영역을 먼저 보완하면 총점이 빠르게 오릅니다."
            areas={report.areas}
          />
        ) : null}

        {(report.contents?.length ?? 0) > 0 ? (
          <BreakdownSection
            title="내용별 분석"
            hint="막대 = 내 성취율 · 세로선 = 반 평균"
            note="빈칸추론·어법성 판단처럼 문항 유형으로 묶은 결과입니다. 같은 영역 안에서도 어떤 유형에서 막히는지 드러나므로, 다음 학습에서 무엇을 집중할지 정할 때 봅니다."
            areas={report.contents ?? []}
          />
        ) : null}

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
            <span>표기 → 정답 · 아래 숫자는 반 정답률</span>
          </div>
          <div className="omr-item-grid">
            {report.items.map((item) => (
              <div
                key={item.no}
                className={`omr-item-cell ${item.correct ? "ok" : item.essay ? "partial" : toChoices(item.marked).length === 0 ? "blank" : "wrong"}${weakSet.has(item.no) ? " weak" : ""}`}
                title={`${item.no}번${item.area ? ` · ${item.area}` : ""} · 배점 ${item.point}점 · 반 정답률 ${item.correctRate}% (${item.difficulty})`}
              >
                <span className="no">{item.no}</span>
                <span className="mark">
                  {item.essay
                    ? `${item.earned}/${item.point}`
                    : item.correct
                      ? "○"
                      : toChoices(item.marked).length === 0
                        ? "–"
                        : `${formatChoices(item.marked)}→${formatChoices(item.answer, "?")}`}
                </span>
                <span className={`rate d-${item.difficulty}`}>{item.correctRate}%</span>
              </div>
            ))}
          </div>
          <p className="subtle" style={{ marginTop: 8 }}>
            ○ 정답 · ①→② 오답(내 표기→정답) · – 미표기 · 서술형은 득점/배점 · 붉은 테두리는
            우선 복습 문항. 정답률 색은 난이도입니다 — <b className="d-쉬움">쉬움</b> ·{" "}
            <b className="d-보통">보통</b> · <b className="d-어려움">어려움</b>
            {hasSpecifiedDifficulty
              ? " (출제 시 정한 난이도이며, 지정이 없는 문항은 반 정답률로 매깁니다)"
              : " (반 전체 결과로 자동 분류)"}
            .
          </p>

          {/* 문항 하나하나의 분류까지 보고 싶을 때를 위한 전체 표.
              분류를 입력하지 않은 시험에서는 위 격자로 충분하므로 싣지 않는다. */}
          {hasBreakdown ? (
            <details className="item-detail">
              <summary>문항별 상세 보기 ({report.items.length}문항)</summary>
              <div className="area-table-wrap">
                <table className="area-table item-table">
                  <thead>
                    <tr>
                      <th>문항</th>
                      <th>정답</th>
                      {hasArea ? <th>분석영역</th> : null}
                      {hasContent ? <th>내용</th> : null}
                      <th>득점</th>
                      <th>반 정답률</th>
                      <th>난이도</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.items.map((item) => (
                      <tr key={item.no} className={weakSet.has(item.no) ? "weak" : undefined}>
                        <td>{item.no}</td>
                        <td className={item.correct ? "ok-mark" : "x-mark"}>
                          {item.essay ? "–" : item.correct ? "○" : "✕"}
                        </td>
                        {hasArea ? <td className="name">{item.area ?? "–"}</td> : null}
                        {hasContent ? <td className="name">{item.content ?? "–"}</td> : null}
                        <td>
                          {item.earned > 0 ? <strong>{item.earned}</strong> : "–"}
                          <em className="of-point">/{item.point}</em>
                        </td>
                        <td>{item.correctRate}%</td>
                        <td>
                          <span className={`diff-chip d-${item.difficulty}`}>{item.difficulty}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ) : null}
        </section>

        {wrongItems.length > 0 ? (
          <section className="analysis-card">
            <div className="card-title-row">
              <h4>우선 복습 문항</h4>
              <span>틀린 문항 중 반 정답률이 낮은 순</span>
            </div>
            <table className="report-table">
              <thead>
                <tr><th>문항</th><th>영역</th><th>내 표기</th><th>정답</th><th>배점</th><th>반 정답률 · 난이도</th></tr>
              </thead>
              <tbody>
                {wrongItems
                  .slice()
                  .sort((a, b) => a.correctRate - b.correctRate)
                  .slice(0, 8)
                  .map((item) => (
                    <tr key={item.no}>
                      <td><strong>{item.no}번</strong>{item.essay ? <span>서술형</span> : null}</td>
                      <td>
                        {item.area ?? "–"}
                        {item.classification?.detail ? <span>{item.classification.detail}</span> : null}
                      </td>
                      <td>{item.essay ? `${item.earned}점` : formatChoices(item.marked, "미표기")}</td>
                      <td>{item.essay ? "–" : formatChoices(item.answer)}</td>
                      <td>{item.point}점</td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div className="metric-bar-track" style={{ width: 96, flex: "0 0 auto" }}>
                            <span style={{ width: `${item.correctRate}%` }} />
                          </div>
                          <span style={{ fontSize: 12, color: "#667085", whiteSpace: "nowrap" }}>
                            {item.correctRate}%
                          </span>
                          <span className={`diff-chip d-${item.difficulty}`}>{item.difficulty}</span>
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

            {/* 영역별 출제 안내 — 무엇을 확인하려 한 시험인지 */}
            {areaNotes.length > 0 ? (
              <div className="area-notes">
                <h3>이번 시험에서 확인한 것</h3>
                {areaNotes.map((entry) => (
                  <div className="area-note-row" key={entry.area}>
                    <strong>{entry.area}</strong>
                    <p style={{ whiteSpace: "pre-wrap" }}>{entry.text}</p>
                  </div>
                ))}
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

            {/* 영역별 평가 — 종합 평가만으로는 어디가 강하고 약한지 안 보인다 */}
            {areaFeedback.length > 0 ? (
              <div className="area-feedback">
                <h3>영역별 평가</h3>
                {areaFeedback.map((entry) => (
                  <div className="area-feedback-row" key={entry.area}>
                    <div className="area-feedback-head">
                      <strong>{entry.area}</strong>
                      <span className={`rating-chip r-${ratingClass(entry.rating)}`}>
                        {entry.rating}
                      </span>
                    </div>
                    {entry.text ? <p style={{ whiteSpace: "pre-wrap" }}>{entry.text}</p> : null}
                  </div>
                ))}
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
            <p>
              문의는 학원으로 연락 주세요.
              {report.appVersion ? ` · 시스템 v${report.appVersion}` : ""}
            </p>
          </div>
        </footer>
      </article>
    </main>
  );
}
