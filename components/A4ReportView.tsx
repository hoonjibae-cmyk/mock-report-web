import AcademyLogo from "@/components/AcademyLogo";
import type { CategoryStat, StudentReportData, SubjectReport } from "@/lib/types";
import { formatMiddleGrade, formatPercent, round } from "@/lib/utils";

interface PreparedReview {
  headline: string;
  overview: string;
  strengths: string[];
  priorities: string[];
  parentNote: string;
  actionPlan: string[];
}

interface A4ReportViewProps {
  report: StudentReportData;
  subjects: SubjectReport[];
  review: PreparedReview;
}

function chunkItems<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

function A4Page({
  children,
  pageNumber,
  totalPages,
  className = "",
}: {
  children: React.ReactNode;
  pageNumber: number;
  totalPages: number;
  className?: string;
}) {
  return (
    <section className={`a4-page ${className}`.trim()}>
      <div className="a4-page-body">{children}</div>
      <footer className="a4-page-footer">
        <div className="a4-footer-brand"><AcademyLogo size="small" /><strong>목동유쌤영어학원</strong></div>
        <span>{pageNumber} / {totalPages}</span>
      </footer>
    </section>
  );
}

function A4MetricBar({
  value,
  label,
  detail,
  tone,
}: {
  value: number;
  label: string;
  detail: string;
  tone: "national" | "academy" | "student";
}) {
  const width = Math.max(0, Math.min(100, value));
  return (
    <div className={`a4-metric-row tone-${tone}`}>
      <div className="a4-metric-label"><strong>{label}</strong><span>{detail}</span></div>
      <div className="a4-metric-track"><span style={{ width: `${width}%` }} /></div>
    </div>
  );
}

function A4CategoryCard({ title, stats }: { title: string; stats: CategoryStat[] }) {
  return (
    <section className="a4-category-card">
      <h3>{title}</h3>
      <div className="a4-category-list">
        {stats.map((stat) => (
          <div className="a4-category-row" key={`${title}-${stat.name}`}>
            <span title={stat.name}>{stat.name}</span>
            <div><i style={{ width: `${Math.max(0, Math.min(100, stat.rate))}%` }} /></div>
            <strong>{round(stat.rate, 1)}%</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function A4OverviewPage({
  report,
  subjects,
  review,
  pageNumber,
  totalPages,
}: A4ReportViewProps & { pageNumber: number; totalPages: number }) {
  return (
    <A4Page pageNumber={pageNumber} totalPages={totalPages} className="a4-overview-page">
      <header className="a4-report-header">
        <div className="a4-report-brand"><AcademyLogo size="large" /><div><strong>목동유쌤영어학원</strong><span>정밀 학습 진단 리포트</span></div></div>
        <div className="a4-report-title"><p>{report.examLabel}</p><h1>{report.reportTitle}</h1></div>
        <div className="a4-student-grid">
          <div><span>학생명</span><strong>{report.student.name}</strong></div>
          <div><span>학교·학년</span><strong>{report.student.school || "학교 미입력"} · {formatMiddleGrade(report.student.grade)}</strong></div>
          <div><span>응시 과목</span><strong>{subjects.map((subject) => subject.name).join(" · ")}</strong></div>
          <div><span>발행일</span><strong>{new Date(report.generatedAt).toLocaleDateString("ko-KR")}</strong></div>
        </div>
      </header>

      <section className="a4-national-section">
        <div className="a4-section-heading"><div><span>전국 기준 진단</span><h2>과목별 현재 위치</h2></div><p>공개된 전국 점수 분포를 바탕으로 산출한 추정치입니다.</p></div>
        <div className={`a4-national-cards count-${subjects.length}`}>
          {subjects.map((subject) => (
            <article key={subject.key} className={`a4-national-card subject-${subject.key}`}>
              <div className="a4-national-card-title"><strong>{subject.name}</strong><span>{subject.grade}등급</span></div>
              <div className="a4-national-score"><strong>{subject.score}</strong><span>점</span></div>
              <div className="a4-national-position"><span>전국 상위 추정</span><strong>{formatPercent(subject.nationalTopPercent)}</strong></div>
              <div className="a4-national-average">전국 평균 {subject.nationalAverage}점 · 정답 {subject.correctCount}/{subject.questionCount}</div>
            </article>
          ))}
        </div>
      </section>

      <section className="a4-ai-summary">
        <div className="a4-ai-heading"><span>AI</span><strong>종합 학습 총평</strong></div>
        <h2>{review.headline}</h2>
        <p className="a4-ai-overview">{review.overview}</p>
        <div className="a4-review-grid">
          <div><h3>확인된 강점</h3><ul>{review.strengths.map((item, index) => <li key={`a4-strength-${index}`}>{item}</li>)}</ul></div>
          <div><h3>우선 보완 영역</h3><ul>{review.priorities.map((item, index) => <li key={`a4-priority-${index}`}>{item}</li>)}</ul></div>
          <div><h3>여름방학 학습 로드맵</h3><ol>{review.actionPlan.map((item, index) => <li key={`a4-roadmap-${index}`}>{item}</li>)}</ol></div>
        </div>
        <blockquote>{review.parentNote}</blockquote>
      </section>

      <section className="a4-report-notice">
        {report.notices.slice(0, 2).map((notice, index) => <p key={`a4-notice-${index}`}>{notice}</p>)}
        <p>전국 상위 추정치는 공식 개인 백분위가 아니며, 공개된 등급 경계와 누적 비율을 이용한 참고값입니다.</p>
      </section>
    </A4Page>
  );
}

function A4SubjectSummaryPage({
  subject,
  pageNumber,
  totalPages,
}: {
  subject: SubjectReport;
  pageNumber: number;
  totalPages: number;
}) {
  return (
    <A4Page pageNumber={pageNumber} totalPages={totalPages} className={`a4-subject-page subject-${subject.key}`}>
      <header className="a4-subject-header">
        <div><span>{subject.name} 영역 분석</span><h1>{subject.examName}</h1><p>{subject.testDate}</p></div>
        <div className="a4-subject-score"><strong>{subject.score}</strong><span>점</span></div>
      </header>

      <div className="a4-subject-kpis">
        <div className="primary"><span>원점수</span><strong>{subject.score}</strong><small>/ {subject.maxScore}</small></div>
        <div><span>전국 등급</span><strong>{subject.grade}등급</strong><small>고1 전국 기준</small></div>
        <div><span>전국 상위 추정</span><strong>{formatPercent(subject.nationalTopPercent)}</strong><small>공개 구간 보간</small></div>
        <div><span>정답 문항</span><strong>{subject.correctCount}개</strong><small>{subject.questionCount}문항 중</small></div>
      </div>

      <section className="a4-comparison-card">
        <h2>전국·학원·개인 점수 비교</h2>
        <A4MetricBar value={subject.nationalAverage} label="전국 평균" detail={`${subject.nationalAverage}점`} tone="national" />
        <A4MetricBar value={subject.academyAverage} label="학원 응시자 평균" detail={`${subject.academyAverage}점`} tone="academy" />
        <A4MetricBar value={subject.score} label="개인 점수" detail={`${subject.score}점`} tone="student" />
      </section>

      <div className="a4-analysis-grid">
        <A4CategoryCard title="내용영역별 분석" stats={subject.contentStats} />
        <div className="a4-analysis-stack">
          <A4CategoryCard title="행동영역별 분석" stats={subject.behaviorStats} />
          <div className="a4-analysis-mini-grid">
            <A4CategoryCard title="난이도별 분석" stats={subject.difficultyStats} />
            <A4CategoryCard title="학년 수준별 분석" stats={subject.gradeLevelStats} />
          </div>
        </div>
      </div>

      <section className="a4-question-card">
        <div className="a4-card-heading"><h2>문항별 정오답</h2><span>○ 정답 · × 오답 · – 미입력</span></div>
        <div className="a4-question-grid">
          {subject.items.map((item) => (
            <div key={`a4-${subject.key}-${item.number}`} className={`a4-question-cell ${item.isCorrect === true ? "correct" : item.isCorrect === false ? "wrong" : "blank"}`}>
              <span>{item.number}</span><strong>{item.isCorrect === true ? "○" : item.isCorrect === false ? "×" : "–"}</strong>
            </div>
          ))}
        </div>
      </section>

      <p className="a4-data-note"><strong>전국 비교 기준:</strong> {subject.nationalDataLabel}. {subject.nationalDataNote}</p>
    </A4Page>
  );
}

function A4DetailPage({
  subject,
  items,
  part,
  partCount,
  pageNumber,
  totalPages,
}: {
  subject: SubjectReport;
  items: SubjectReport["items"];
  part: number;
  partCount: number;
  pageNumber: number;
  totalPages: number;
}) {
  return (
    <A4Page pageNumber={pageNumber} totalPages={totalPages} className={`a4-detail-page subject-${subject.key}`}>
      <header className="a4-detail-header">
        <div><span>{subject.name} 문항 분석</span><h1>문항별 세부 분석</h1></div>
        <div><strong>{part}</strong><span>/ {partCount}</span></div>
      </header>
      <p className="a4-detail-caption">문항 분류는 학원 진단용 기준이며, 오답은 진한 빨간색으로 표시됩니다.</p>
      <table className="a4-detail-table">
        <colgroup>
          <col style={{ width: "5%" }} /><col style={{ width: "13%" }} /><col style={{ width: "25%" }} />
          <col style={{ width: "12%" }} /><col style={{ width: "8%" }} /><col style={{ width: "10%" }} />
          <col style={{ width: "7%" }} /><col style={{ width: "10%" }} /><col style={{ width: "10%" }} />
        </colgroup>
        <thead><tr><th>문항</th><th>내용영역</th><th>세부 유형·내용</th><th>행동영역</th><th>난이도</th><th>학년 수준</th><th>배점</th><th>학원 정답률</th><th>결과</th></tr></thead>
        <tbody>
          {items.map((item) => (
            <tr key={`a4-detail-${subject.key}-${item.number}`} className={item.isCorrect === false ? "wrong-row" : ""}>
              <td><strong>{item.number}</strong></td><td>{item.content}</td><td>{item.detail}</td><td>{item.behavior}</td>
              <td><span className={`a4-difficulty level-${item.difficulty}`}>{item.difficulty}</span></td><td>{item.gradeLevel}</td><td>{item.points}점</td>
              <td>{item.cohortCorrectRate === undefined ? "–" : formatPercent(item.cohortCorrectRate)}</td>
              <td><span className={`a4-result ${item.isCorrect === true ? "correct" : item.isCorrect === false ? "wrong" : "blank"}`}>{item.isCorrect === true ? "정답" : item.isCorrect === false ? "오답" : "미입력"}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </A4Page>
  );
}

export default function A4ReportView({ report, subjects, review }: A4ReportViewProps) {
  const detailChunks = subjects.map((subject) => ({
    subject,
    chunks: chunkItems(subject.items, subject.key === "math" ? 30 : 24),
  }));
  const totalPages = 1 + subjects.length + detailChunks.reduce((sum, entry) => sum + entry.chunks.length, 0);
  let pageNumber = 1;
  const pages: React.ReactNode[] = [];

  pages.push(<A4OverviewPage key="a4-overview" report={report} subjects={subjects} review={review} pageNumber={pageNumber++} totalPages={totalPages} />);
  for (const subject of subjects) {
    pages.push(<A4SubjectSummaryPage key={`a4-summary-${subject.key}`} subject={subject} pageNumber={pageNumber++} totalPages={totalPages} />);
    const entry = detailChunks.find((item) => item.subject.key === subject.key);
    entry?.chunks.forEach((items, index) => {
      pages.push(
        <A4DetailPage
          key={`a4-detail-${subject.key}-${index}`}
          subject={subject}
          items={items}
          part={index + 1}
          partCount={entry.chunks.length}
          pageNumber={pageNumber++}
          totalPages={totalPages}
        />,
      );
    });
  }

  return <div className="a4-report-root" aria-label="A4 출력용 성적표 미리보기">{pages}</div>;
}
