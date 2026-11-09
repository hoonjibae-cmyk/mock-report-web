import { Fragment, type ReactNode } from "react";
import AcademyLogo from "@/components/AcademyLogo";
import ParentTrendChart from "@/components/ParentTrendChart";
import { A4_REVIEW_ROWS, growthBeside, planA4Report, wrongItemsOf, type A4BlockKey } from "@/lib/a4-report-plan";
import { formatChoices, toChoices } from "@/lib/omr-answers";
import type { AreaStat, GenericItemResult, GenericReportData } from "@/lib/omr-report-types";
import { ratingClass, visibleComments, type ReportComments } from "@/lib/report-comments";
import { gradeRangeSentence } from "@/lib/school-grade";
import { trendSentence } from "@/lib/score-history";

/**
 * OMR 성적표의 A4 판 — 토요모의고사·월말평가·인클래스·국영수 OMR 성적표를 종이 쪽 단위로 그린다.
 *
 * 화면에서는 보이지 않다가(`.a4-report-root`는 숨김) 주소에 `?layout=a4`가 붙거나 인쇄할 때
 * 웹 성적표 대신 나온다. 쪽 나누기는 lib/a4-report-plan 이 정하고, 여기서는 열쇠마다 그린다.
 * 한 쪽이 넘치면 화면의 fitA4Pages 가 그 쪽을 줄여 넣는다.
 *
 * 반배치고사는 여기로 오지 않는다 — 반배치고사 성적표는 웹 문서를 그대로 인쇄하는 제 규칙이 있다.
 */

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function cellState(item: GenericItemResult): string {
  if (item.absent) return "absent";
  if (item.correct) return "ok";
  if (item.essay) return "partial";
  if (toChoices(item.marked).length === 0) return "blank";
  return "wrong";
}

function markOf(item: GenericItemResult): string {
  if (item.absent) return "미응시";
  if (item.essay) return `${item.earned}/${item.point}`;
  if (item.correct) return "○";
  if (toChoices(item.marked).length === 0) return "–";
  return `${formatChoices(item.marked)}→${formatChoices(item.answer, "?")}`;
}

function Header({ report }: { report: GenericReportData }) {
  // 학생 관리 프로그램에서 맞춘 신규생은 수험번호 대신 sc<학생ID> 열쇠를 쓴다 — 종이에 찍을 번호가 아니다
  const hasExamNumber = !/^sc\d+$/.test(report.student.key);
  return (
    <header className="a4g-header">
      <div className="a4g-header-row">
        <div className="a4g-brand">
          <AcademyLogo size="large" />
          <div>
            <strong>{report.academy}</strong>
            <span>개인 성적표</span>
          </div>
        </div>
        <div className="a4g-title">
          <p>
            {report.examTypeLabel}
            {report.examDate ? ` · ${report.examDate}` : ""}
          </p>
          <h1>{report.examTitle}</h1>
        </div>
      </div>
      <div className="a4g-student">
        <div><span>학생명</span><strong>{report.student.name}</strong></div>
        {hasExamNumber ? <div><span>수험번호</span><strong>{report.student.key}</strong></div> : null}
        <div><span>학교·학년</span><strong>{report.student.school || "미입력"}</strong></div>
        {report.student.className ? <div><span>반</span><strong>{report.student.className}</strong></div> : null}
        <div><span>발행일</span><strong>{new Date(report.generatedAt).toLocaleDateString("ko-KR")}</strong></div>
      </div>
    </header>
  );
}

function Kpis({ report }: { report: GenericReportData }) {
  const { score, cohort } = report;
  const scope = report.cohortScope === "level" ? "같은 레벨" : report.cohortScope === "class" ? "우리 반" : "응시";
  return (
    <div className="a4g-kpis">
      <div className="primary">
        <span>원점수</span>
        <strong>
          {score.raw}
          <em>/ {score.max}점</em>
        </strong>
        <small>
          맞은 문항 {score.correctCount} · 틀린 문항 {score.wrongCount}
          {score.blankCount > 0 ? ` · 미표기 ${score.blankCount}` : ""}
        </small>
      </div>
      {/* 석차·상위 %는 학부모용 성적표에 싣지 않는다(웹 성적표와 같은 방침) */}
      {report.grade != null ? (
        <div>
          <span>등급</span>
          <strong>{report.grade}</strong>
          <small>등급 (절대평가)</small>
        </div>
      ) : null}
      <div>
        <span>{report.cohortLabel ?? "학원 평균"}</span>
        <strong>{cohort.mean}</strong>
        <small>
          {scope} {cohort.count}명 · 표준편차 {cohort.stdev}
        </small>
      </div>
      <div>
        <span>표준점수</span>
        <strong>{report.standardScore}</strong>
        <small>평균=100 · 난이도 보정</small>
      </div>
    </div>
  );
}

function Distribution({ report }: { report: GenericReportData }) {
  const { cohort, score } = report;
  const span = Math.max(cohort.max - cohort.min, 0.001);
  const pos = (value: number) => `${clamp(((value - cohort.min) / span) * 100)}%`;
  return (
    <div className="a4g-dist">
      <div className="a4g-dist-track">
        <span className="a4g-dist-marker mean" style={{ left: pos(cohort.mean) }}>
          <i />
          <em>평균 {cohort.mean}</em>
        </span>
        <span className="a4g-dist-marker me" style={{ left: pos(score.raw) }}>
          <i />
          <em>
            {report.student.name} {score.raw}
          </em>
        </span>
      </div>
      <div className="a4g-dist-ends">
        <span>최저 {cohort.min}점</span>
        <span>최고 {cohort.max}점</span>
      </div>
    </div>
  );
}

function Position({ report }: { report: GenericReportData }) {
  const { score, cohort } = report;
  const gradeNotice = report.examType === "saturday" ? gradeRangeSentence(report.cohortGrades) : "";
  const listeningAbsent = report.listeningAbsent ?? null;
  return (
    <section className="a4g-card">
      <div className="a4g-card-head">
        <h2>응시 집단 내 위치</h2>
        <span>
          {cohort.count}명 응시 · 평균 {cohort.mean}점 · 표준편차 {cohort.stdev}
        </span>
      </div>
      {gradeNotice ? <p className="a4g-notice">{gradeNotice}</p> : null}
      {report.cohortNote ? <p className="a4g-cohort-note">{report.cohortNote}</p> : null}
      <Distribution report={report} />
      <p className="a4g-note">
        맞은 문항 {score.correctCount} · 틀린 문항 {score.wrongCount}
        {score.blankCount > 0 ? ` · 미표기 ${score.blankCount}` : ""}
        {listeningAbsent ? ` · 듣기 미응시 ${listeningAbsent.count}문항` : ""} (총 {score.totalQuestions}문항)
        {report.essayCount > 0
          ? ` · 객관식 ${score.objectiveRaw}점 + 서술형 ${score.essayRaw}점(${report.essayCount}문항)`
          : ""}
      </p>
      {listeningAbsent ? (
        <p className="a4g-note a4g-listening">
          듣기 평가를 응시하지 않아 듣기 점수는 이 시험에서 듣기를 응시한 학생들의 평균값({listeningAbsent.mean}점 /{" "}
          {listeningAbsent.possible}점)을 적용했습니다. 문항별 결과에서 듣기 문항은 ‘미응시’로 표시됩니다.
        </p>
      ) : null}
    </section>
  );
}

function AreaTable({ title, hint, note, areas }: { title: string; hint: string; note: string; areas: AreaStat[] }) {
  return (
    <section className="a4g-card">
      <div className="a4g-card-head">
        <h2>{title}</h2>
        <span>{hint}</span>
      </div>
      <table className="a4g-table">
        <thead>
          <tr>
            <th>영역</th>
            <th className="bar">성취율 (막대 = 나 · 세로선 = 반 평균)</th>
            <th>득점</th>
            <th>배점</th>
            <th>반 평균</th>
            <th>내 성취율</th>
            <th>반 성취율</th>
            <th>차이</th>
          </tr>
        </thead>
        <tbody>
          {areas.map((stat) => {
            const diff = round1(stat.rate - stat.cohortRate);
            return (
              <tr key={stat.area}>
                <td className="name">
                  {stat.area}
                  {stat.estimated ? <small className="a4g-estimated">미응시 · 반 평균 적용</small> : null}
                </td>
                <td className="bar">
                  <div className="a4g-bar">
                    <i style={{ width: `${clamp(stat.rate)}%` }} />
                    <b style={{ left: `${clamp(stat.cohortRate)}%` }} />
                  </div>
                </td>
                <td>
                  <strong>{stat.earned}</strong>
                </td>
                <td>{stat.possible}</td>
                <td>{stat.cohortEarned}</td>
                <td className={stat.rate >= stat.cohortRate ? "up" : "down"}>{stat.rate}%</td>
                <td>{stat.cohortRate}%</td>
                <td className={diff >= 0 ? "up" : "down"}>{diff >= 0 ? `+${diff}` : diff}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="a4g-note">{note}</p>
    </section>
  );
}

function Items({ report }: { report: GenericReportData }) {
  const weakSet = new Set(report.weakItems);
  const listeningAbsent = Boolean(report.listeningAbsent);
  const hasSpecifiedDifficulty = report.items.some((item) => item.difficultySpecified);
  return (
    <section className="a4g-card">
      <div className="a4g-card-head">
        <h2>문항별 채점 결과</h2>
        <span>표기 → 정답 · 아래 숫자는 반 정답률</span>
      </div>
      <div className="a4g-items">
        {report.items.map((item) => (
          <div key={item.no} className={`a4g-item ${cellState(item)}${weakSet.has(item.no) ? " weak" : ""}`}>
            <span className="no">{item.no}</span>
            <span className="mark">{markOf(item)}</span>
            <span className={`rate d-${item.difficulty}`}>{item.correctRate}%</span>
          </div>
        ))}
      </div>
      <p className="a4g-legend">
        ○ 정답 · ①→② 오답(내 표기→정답) · – 미표기{listeningAbsent ? " · 미응시 = 듣기 평가를 보지 않은 문항" : ""} · 서술형은
        득점/배점 · 붉은 테두리는 우선 복습 문항. 정답률 색은 난이도입니다 — <b className="d-쉬움">쉬움</b> ·{" "}
        <b className="d-보통">보통</b> · <b className="d-어려움">어려움</b>
        {hasSpecifiedDifficulty ? " (출제 시 정한 난이도이며, 지정이 없는 문항은 반 정답률로 매깁니다)" : " (반 전체 결과로 자동 분류)"}.
      </p>
    </section>
  );
}

/** 성적 추이 — 위치 카드 옆 반 너비 자리에 맞춘 비율(가로 320 : 세로 150)로 그린다 */
function Growth({ report }: { report: GenericReportData }) {
  return (
    <section className="a4g-card a4g-growth">
      <div className="a4g-card-head">
        <h2>성적 추이</h2>
        <span>최근 {report.growth.length}회 · 내 점수와 반 평균</span>
      </div>
      <ParentTrendChart points={report.growth} width={320} height={150} />
      <p className="a4g-note">{trendSentence(report.growth)}</p>
    </section>
  );
}

function National({ report }: { report: GenericReportData }) {
  const national = report.national;
  if (!national) return null;
  const diff = national.diffFromAverage ?? 0;
  return (
    <section className="a4g-card">
      <div className="a4g-card-head">
        <h2>전국 비교</h2>
        <span>{national.subjectLabel} · 전국연합학력평가 기준</span>
      </div>
      <div className="a4g-national">
        <div><span>전국 등급</span><strong>{national.grade}등급</strong></div>
        <div><span>전국 상위 추정</span><strong>{national.topPercent}%</strong></div>
        {national.average !== null ? (
          <>
            <div><span>전국 평균</span><strong>{national.average}점</strong></div>
            <div>
              <span>전국 평균 대비</span>
              <strong className={diff >= 0 ? "up" : "down"}>
                {diff >= 0 ? "+" : ""}
                {national.diffFromAverage}점
              </strong>
            </div>
          </>
        ) : null}
      </div>
      <p className="a4g-note">{national.note}</p>
    </section>
  );
}

function Classification({ report }: { report: GenericReportData }) {
  const groups = report.classificationStats ?? [];
  if (groups.length === 0) return null;
  return (
    <section className="a4g-card">
      <div className="a4g-card-head">
        <h2>분류 기준별 성취</h2>
        <span>막대 = 내 성취율 · 세로선 = 반 평균</span>
      </div>
      {groups.map((group) => (
        <div key={group.kind} className="a4g-group">
          <p className="a4g-group-label">{group.label}</p>
          {group.rows.map((stat) => (
            <div key={stat.area} className="a4g-mini-row">
              <span>{stat.area}</span>
              <div className="a4g-bar">
                <i style={{ width: `${clamp(stat.rate)}%` }} />
                <b style={{ left: `${clamp(stat.cohortRate)}%` }} />
              </div>
              <strong>{stat.rate}%</strong>
              <em>반 {stat.cohortRate}%</em>
            </div>
          ))}
        </div>
      ))}
      <p className="a4g-note">
        행동영역·내용영역·난이도·학년 수준은 공식 정답·해설의 출제 의도를 바탕으로 학원 진단용으로 재분류한 기준입니다.
      </p>
    </section>
  );
}

function Review({ report }: { report: GenericReportData }) {
  // 반 정답률이 높은 것부터 — 남들은 다 맞힌 문항을 놓친 것이 먼저다(웹 성적표와 같은 순서)
  const rows = wrongItemsOf(report)
    .slice()
    .sort((a, b) => b.correctRate - a.correctRate)
    .slice(0, A4_REVIEW_ROWS);
  if (rows.length === 0) return null;
  return (
    <section className="a4g-card">
      <div className="a4g-card-head">
        <h2>우선 복습 문항</h2>
        <span>틀린 문항 중 반 정답률이 높은 순</span>
      </div>
      <table className="a4g-table a4g-review">
        <thead>
          <tr>
            <th>문항</th>
            <th>영역</th>
            <th>내 표기</th>
            <th>정답</th>
            <th>배점</th>
            <th className="bar">반 정답률</th>
            <th>난이도</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr key={item.no}>
              <td className="name">
                {item.no}번{item.essay ? <small className="a4g-estimated">서술형</small> : null}
              </td>
              <td className="name">
                {item.area ?? "–"}
                {item.classification?.detail ? <small className="a4g-estimated">{item.classification.detail}</small> : null}
              </td>
              <td>{item.essay ? `${item.earned}점` : formatChoices(item.marked, "미표기")}</td>
              <td>{item.essay ? "–" : formatChoices(item.answer)}</td>
              <td>{item.point}점</td>
              <td className="bar">
                <div className="a4g-rate">
                  <div className="a4g-bar">
                    <i style={{ width: `${clamp(item.correctRate)}%` }} />
                  </div>
                  <span>{item.correctRate}%</span>
                </div>
              </td>
              <td>
                <span className={`a4g-chip d-${item.difficulty}`}>{item.difficulty}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="a4g-note">
        반 정답률이 낮은 문항일수록 어려웠던 문항입니다. 정답률이 높은데 틀린 문항부터 우선 점검하면 효율적입니다.
      </p>
    </section>
  );
}

function CommentBand({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="a4g-comments-head">
      <span>담임</span>
      <strong>선생님 의견</strong>
    </div>
  );
}

function Footnote({ report }: { report: GenericReportData }) {
  return (
    <div className="a4g-footnote">
      <p>본 성적표는 OMR 답안을 자동 판독·채점한 결과이며, 평균·표준점수는 학원 응시 집단 기준입니다.</p>
      <p>
        문의는 학원으로 연락 주세요.
        {report.appVersion ? ` · 시스템 v${report.appVersion}` : ""}
      </p>
    </div>
  );
}

function A4GPage({
  children,
  pageNumber,
  totalPages,
  label,
  academy,
}: {
  children: ReactNode;
  pageNumber: number;
  totalPages: number;
  label: string;
  academy: string;
}) {
  return (
    <section className="a4-page a4g-page">
      <div className="a4-page-body a4g-body">{children}</div>
      <footer className="a4-page-footer a4g-footer">
        <div className="a4-footer-brand">
          <AcademyLogo size="small" />
          <strong>{academy}</strong>
        </div>
        <span className="a4g-footer-mid">{label}</span>
        <span className="a4g-footer-page">
          {pageNumber} / {totalPages}
        </span>
      </footer>
    </section>
  );
}

export default function A4GenericReport({
  report,
  comments,
}: {
  report: GenericReportData;
  comments?: ReportComments;
}) {
  const plan = planA4Report(report, comments);
  const visible = visibleComments(comments, report.teacherComment?.text ?? null);
  const firstComment = plan.blocks.find((block) => block.key.startsWith("comment-"))?.key;

  const render = (key: A4BlockKey): ReactNode => {
    switch (key) {
      case "header":
        return <Header report={report} />;
      case "kpis":
        return <Kpis report={report} />;
      case "position":
        // 성적 추이가 있으면 위치 카드와 나란히 — 둘 다 '이번 점수가 어디쯤인가'를 말한다
        return growthBeside(report) ? (
          <div className="a4g-row">
            <Position report={report} />
            <Growth report={report} />
          </div>
        ) : (
          <Position report={report} />
        );
      case "areas":
        return (
          <AreaTable
            title="영역별 분석"
            hint="성취율이 낮은 영역부터"
            note="듣기·문법·독해처럼 큰 갈래로 묶은 결과입니다. 성취율이 낮은 영역부터 표시했으니, 반 평균보다 낮은 영역을 먼저 보완하면 총점이 빠르게 오릅니다."
            areas={report.areas}
          />
        );
      case "items":
        return <Items report={report} />;
      case "national":
        return <National report={report} />;
      case "classification":
        return <Classification report={report} />;
      case "contents":
        return (
          <AreaTable
            title="내용별 분석"
            hint="문항 유형별"
            note="빈칸추론·어법성 판단처럼 문항 유형으로 묶은 결과입니다. 같은 영역 안에서도 어떤 유형에서 막히는지 드러나므로, 다음 학습에서 무엇을 집중할지 정할 때 봅니다."
            areas={report.contents ?? []}
          />
        );
      case "review":
        return <Review report={report} />;
      case "comment-overview":
        return (
          <section className="a4g-comments">
            <CommentBand show={firstComment === key} />
            <h3>이번 시험 총평</h3>
            <p>{visible.overview}</p>
          </section>
        );
      case "comment-notes":
        return (
          <section className="a4g-comments">
            <CommentBand show={firstComment === key} />
            <h3>이번 시험에서 확인한 것</h3>
            {visible.areaNotes.map((entry) => (
              <div className="a4g-area-note" key={entry.area}>
                <strong>{entry.area}</strong>
                <p>{entry.text}</p>
              </div>
            ))}
          </section>
        );
      case "comment-personal":
        return (
          <section className="a4g-comments">
            <CommentBand show={firstComment === key} />
            <h3>{report.student.name} 학생에게</h3>
            {visible.keywords.length > 0 ? (
              <div className="a4g-chips">
                {visible.keywords.map((keyword) => (
                  <span key={keyword}>#{keyword}</span>
                ))}
              </div>
            ) : null}
            <p>{visible.personal}</p>
          </section>
        );
      case "comment-feedback":
        return (
          <section className="a4g-comments">
            <CommentBand show={firstComment === key} />
            <h3>영역별 평가</h3>
            {visible.areaFeedback.map((entry) => (
              <div className="a4g-area-feedback" key={entry.area}>
                <div className="a4g-area-feedback-head">
                  <strong>{entry.area}</strong>
                  <span className={`rating-chip r-${ratingClass(entry.rating)}`}>{entry.rating}</span>
                </div>
                {entry.text ? <p>{entry.text}</p> : null}
              </div>
            ))}
          </section>
        );
      default:
        return null;
    }
  };

  const label = `${report.examTitle} · ${report.student.name}`;
  return (
    <>
      {plan.pages.map((keys, index) => (
        <A4GPage
          key={keys[0] ?? index}
          pageNumber={index + 1}
          totalPages={plan.pages.length}
          label={label}
          academy={report.academy}
        >
          {keys.map((key) => (
            <Fragment key={key}>{render(key)}</Fragment>
          ))}
          {index === plan.pages.length - 1 ? <Footnote report={report} /> : null}
        </A4GPage>
      ))}
    </>
  );
}
