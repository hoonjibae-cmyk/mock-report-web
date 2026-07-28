import A4ReportView from "@/components/A4ReportView";
import AcademyLogo from "@/components/AcademyLogo";
import ReportActions from "@/components/ReportActions";
import { SUBJECT_KEYS } from "@/lib/exams";
import { sanitizeNationalReviewList, sanitizeNationalReviewText } from "@/lib/review-sanitizer";
import type { CategoryStat, StudentReportData, SubjectReport } from "@/lib/types";
import { formatMiddleGrade, formatPercent, round } from "@/lib/utils";

function Bar({ value, label, detail }: { value: number; label: string; detail?: string }) {
  const width = Math.max(0, Math.min(100, value));
  return (
    <div className="metric-bar-row">
      <div className="metric-bar-label"><strong>{label}</strong><span>{detail ?? `${round(value, 1)}%`}</span></div>
      <div className="metric-bar-track"><span style={{ width: `${width}%` }} /></div>
    </div>
  );
}

function CategoryBlock({ title, stats }: { title: string; stats: CategoryStat[] }) {
  return (
    <section className="analysis-card">
      <div className="card-title-row"><h4>{title}</h4><span>배점 기준 성취율</span></div>
      <div className="category-bars">
        {stats.map((stat) => (
          <Bar key={stat.name} value={stat.rate} label={stat.name} detail={`${stat.earned}/${stat.possible}점 · ${formatPercent(stat.rate)}`} />
        ))}
      </div>
    </section>
  );
}

function SubjectSummary({ subject }: { subject: SubjectReport }) {
  return (
    <>
      <div className="subject-kpis">
        <div className="score-emphasis"><span>원점수</span><strong>{subject.score}</strong><small>/ {subject.maxScore}</small></div>
        <div><span>등급</span><strong>{subject.grade}등급</strong><small>고1 전국 기준</small></div>
        <div><span>전국 상위 추정</span><strong>{formatPercent(subject.nationalTopPercent)}</strong><small>공개 구간 보간</small></div>
        <div><span>학원 내 순위</span><strong>{subject.academyRank}위</strong><small>{subject.academyCount}명 응시</small></div>
        <div><span>정답 문항</span><strong>{subject.correctCount}개</strong><small>{subject.questionCount}문항 중</small></div>
      </div>
      <section className="comparison-card">
        <div className="card-title-row"><h4>점수 비교</h4><span>100점 만점</span></div>
        <Bar value={subject.score} label="학생 점수" detail={`${subject.score}점`} />
        <Bar value={subject.academyAverage} label="학원 응시자 평균" detail={`${subject.academyAverage}점`} />
        <Bar value={subject.nationalAverage} label="전국 평균" detail={`${subject.nationalAverage}점`} />
      </section>
    </>
  );
}

function QuestionHeatmap({ subject }: { subject: SubjectReport }) {
  return (
    <section className="analysis-card wide-card">
      <div className="card-title-row"><h4>문항별 정오답</h4><span>○ 정답 · × 오답 · – 미입력</span></div>
      <div className="question-grid">
        {subject.items.map((item) => (
          <div
            key={item.number}
            className={`question-cell ${item.isCorrect === true ? "correct" : item.isCorrect === false ? "wrong" : "blank"}`}
            title={`${item.number}번 · ${item.detail} · ${item.points}점`}
          >
            <span>{item.number}</span>
            <strong>{item.isCorrect === true ? "○" : item.isCorrect === false ? "×" : "–"}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function DetailedTable({ subject }: { subject: SubjectReport }) {
  return (
    <section className="detail-section">
      <div className="card-title-row"><h4>{subject.name} 문항별 세부 분석</h4><span>문항 분류는 학원 진단용 기준</span></div>
      <div className="table-scroll report-table-scroll">
        <table className="report-table">
          <thead>
            <tr><th>문항</th><th>내용영역</th><th>세부 유형·내용</th><th>행동영역</th><th>난이도</th><th>학년 수준</th><th>배점</th><th>학원 정답률</th><th>결과</th></tr>
          </thead>
          <tbody>
            {subject.items.map((item) => (
              <tr key={item.number} className={item.isCorrect === false ? "wrong-row" : ""}>
                <td><strong>{item.number}</strong></td>
                <td>{item.content}</td>
                <td>{item.detail}</td>
                <td>{item.behavior}</td>
                <td><span className={`difficulty-chip level-${item.difficulty}`}>{item.difficulty}</span></td>
                <td>{item.gradeLevel}</td>
                <td>{item.points}점</td>
                <td>{item.cohortCorrectRate === undefined ? "–" : formatPercent(item.cohortCorrectRate)}</td>
                <td><span className={`result-chip ${item.isCorrect === true ? "correct" : item.isCorrect === false ? "wrong" : "blank"}`}>{item.isCorrect === true ? "정답" : item.isCorrect === false ? "오답" : "미입력"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SubjectSection({ subject }: { subject: SubjectReport }) {
  return (
    <section className={`subject-section subject-${subject.key}`}>
      <header className="subject-header">
        <div><span>{subject.name} 영역</span><h2>{subject.examName}</h2></div>
        <div className="subject-score-badge"><strong>{subject.score}</strong><span>점</span></div>
      </header>

      <SubjectSummary subject={subject} />
      <div className="analysis-grid">
        <CategoryBlock title="행동영역별 분석" stats={subject.behaviorStats} />
        <CategoryBlock title="내용영역별 분석" stats={subject.contentStats} />
        <CategoryBlock title="난이도별 분석" stats={subject.difficultyStats} />
        <CategoryBlock title="학년 수준별 분석" stats={subject.gradeLevelStats} />
      </div>
      <QuestionHeatmap subject={subject} />
      <DetailedTable subject={subject} />
      <p className="data-note"><strong>전국 비교 기준:</strong> {subject.nationalDataLabel}. {subject.nationalDataNote}</p>
    </section>
  );
}

export default function ReportView({ report }: { report: StudentReportData }) {
  const subjects = SUBJECT_KEYS.map((key) => report.subjects[key]).filter(Boolean) as SubjectReport[];
  const review = report.aiReview;
  const nationalSnapshot = subjects
    .map((subject) => `${subject.name} 전국 상위 약 ${round(subject.nationalTopPercent, 1)}%`)
    .join(", ");
  const reviewHeadline = sanitizeNationalReviewText(review.headline)
    || "전국 기준의 성취 수준을 바탕으로 과목별 학습 방향을 점검했습니다.";
  const reviewOverview = sanitizeNationalReviewText(review.overview)
    || `전국 상위 추정치는 ${nationalSnapshot}입니다. 공개된 전국 점수 분포를 활용한 참고값입니다.`;
  const sanitizedStrengths = sanitizeNationalReviewList(review.strengths);
  const sanitizedPriorities = sanitizeNationalReviewList(review.priorities);
  const reviewStrengths = sanitizedStrengths.length
    ? sanitizedStrengths
    : ["전국 시험 문항에서 안정적으로 해결한 영역을 중심으로 강점을 유지하겠습니다."];
  const reviewPriorities = sanitizedPriorities.length
    ? sanitizedPriorities
    : ["전국 시험에서 확인된 오답 영역의 개념과 판단 근거를 우선 점검하겠습니다."];
  const reviewParentNote = sanitizeNationalReviewText(review.parentNote)
    || "전국 기준의 현재 위치와 문항별 성취를 함께 확인하여 다음 학습 단계로 연결하겠습니다.";

  return (
    <main className="report-shell">
      <ReportActions />
      <article className="report-document web-report-document">
        <header className="report-hero">
          <div className="brand-lockup report-brand">
            <AcademyLogo size="large" />
            <div><strong>목동유쌤영어학원</strong><span>정밀 학습 진단 리포트</span></div>
          </div>
          <div className="report-title-block">
            <p>{report.examLabel}</p>
            <h1>{report.reportTitle}</h1>
          </div>
          <div className="student-strip">
            <div><span>학생명</span><strong>{report.student.name}</strong></div>
            <div><span>학교·학년</span><strong>{report.student.school || "학교 미입력"} · {formatMiddleGrade(report.student.grade)}</strong></div>
            <div><span>응시 과목</span><strong>{subjects.map((subject) => subject.name).join(" · ")}</strong></div>
            <div><span>발행일</span><strong>{new Date(report.generatedAt).toLocaleDateString("ko-KR")}</strong></div>
          </div>
        </header>

        <section className="overall-section">
          <div className="overall-kpis">
            <div><span>과목 평균</span><strong>{report.overall.averageScore}</strong><small>점</small></div>
            <div><span>강점 과목</span><strong>{report.overall.bestSubject || "–"}</strong><small>현재 점수 기준</small></div>
            <div><span>집중 과목</span><strong>{report.overall.focusSubject || "–"}</strong><small>우선 보완 권장</small></div>
          </div>

          <section className="ai-review-card">
            <div className="ai-label"><span>AI</span><strong>종합 학습 총평</strong></div>
            <h2>{reviewHeadline}</h2>
            <p className="review-overview">{reviewOverview}</p>
            <div className="review-columns">
              <div><h3>확인된 강점</h3><ul>{reviewStrengths.map((item, index) => <li key={`strength-${index}`}>{item}</li>)}</ul></div>
              <div><h3>우선 보완 영역</h3><ul>{reviewPriorities.map((item, index) => <li key={`priority-${index}`}>{item}</li>)}</ul></div>
              <div><h3>여름방학 학습 로드맵</h3><ol>{review.actionPlan.map((item, index) => <li key={`action-${index}`}>{item}</li>)}</ol></div>
            </div>
            <blockquote>{reviewParentNote}</blockquote>
          </section>
        </section>

        {subjects.map((subject) => <SubjectSection key={subject.key} subject={subject} />)}

        <footer className="report-footer">
          <div className="footer-brand"><AcademyLogo size="small" /><strong>목동유쌤영어학원</strong></div>
          <div>
            {report.notices.map((notice, index) => <p key={`notice-${index}`}>{notice}</p>)}
            <p>전국 상위 추정치는 공개된 등급 경계 및 누적 비율을 구간 보간한 참고값이며 공식 개인 백분위가 아닙니다.</p>
          </div>
        </footer>
      </article>
      <A4ReportView
        report={report}
        subjects={subjects}
        review={{
          headline: reviewHeadline,
          overview: reviewOverview,
          strengths: reviewStrengths,
          priorities: reviewPriorities,
          actionPlan: review.actionPlan,
          parentNote: reviewParentNote,
        }}
      />
    </main>
  );
}
