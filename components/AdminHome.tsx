import Link from "next/link";
import AdminTopNav, { type NavUser } from "@/components/AdminTopNav";
import { APP_RELEASED_AT, APP_VERSION_LABEL } from "@/lib/version";
import { EXAM_TYPE_LABELS, type OmrExam } from "@/lib/omr-types";
import type { AdminReportListItem } from "@/lib/reports";

interface Props {
  currentUser: NavUser;
  exams: OmrExam[];
  reports: AdminReportListItem[];
  setupError: string;
  canCreate: boolean;
}

const TYPE_CARDS: Array<{
  title: string;
  desc: string;
  href: string;
  cta: string;
  badge: string;
}> = [
  {
    title: "국영수 모의고사",
    desc: "국어·영어·수학 과목별 OMR로 직접 보거나, 전국 모의고사 채점 엑셀을 올려 전국 비교·AI 총평 성적표를 만듭니다.",
    href: "/admin/omr?type=mock",
    cta: "바로가기",
    badge: "OMR · 엑셀",
  },
  {
    title: "토요모의고사",
    desc: "영어 45문항. OMR 답안지로 시험 보고 스캔하면 듣기·독해 영역별 분석 성적표가 나옵니다.",
    href: "/admin/omr/new?type=saturday",
    cta: "시험 만들기",
    badge: "OMR",
  },
  {
    title: "월말평가",
    desc: "매월 정기 평가. 표준점수로 전월 대비 성장 추이를 학부모에게 보여줍니다.",
    href: "/admin/omr/new?type=monthly",
    cta: "시험 만들기",
    badge: "OMR",
  },
  {
    title: "반배치고사",
    desc: "신입생·레벨 테스트. 문항 수를 자유롭게 정해 반 편성 근거 자료를 만듭니다.",
    href: "/admin/omr/new?type=placement",
    cta: "시험 만들기",
    badge: "OMR",
  },
  {
    title: "인클래스 테스트",
    desc: "수업 중 쪽지시험·단원평가. 간단히 만들고 빠르게 채점합니다.",
    href: "/admin/omr/new?type=inclass",
    cta: "시험 만들기",
    badge: "OMR",
  },
];

const WORKFLOW = [
  { step: "1", title: "시험 만들기", desc: "유형·문항 수 설정" },
  { step: "2", title: "답안지 출력", desc: "수능형 OMR 인쇄·배부" },
  { step: "3", title: "정답 입력", desc: "객관식 정답키 등록" },
  { step: "4", title: "스캔 · 검수", desc: "업로드 즉시 자동 판독" },
  { step: "5", title: "성적표 발송", desc: "학부모 웹링크 공유" },
];

export default function AdminHome({ currentUser, exams, reports, setupError, canCreate }: Props) {
  return (
    <main className="admin-shell">
      <AdminTopNav user={currentUser} />

      {setupError ? <p className="form-error block">{setupError}</p> : null}

      <section className="panel" style={{ marginBottom: 20 }}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">WORKFLOW</p>
            <h2>시험 진행 순서</h2>
          </div>
        </div>
        <div className="workflow-row">
          {WORKFLOW.map((item) => (
            <div className="workflow-step" key={item.step}>
              <span>{item.step}</span>
              <strong>{item.title}</strong>
              <p>{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">EXAMS</p>
            <h2>시험 시작하기</h2>
            <p className="subtle">학원에서 치르는 모든 시험을 여기서 만들고 성적표까지 발송합니다.</p>
          </div>
        </div>
        <div className="type-cards">
          {TYPE_CARDS.map((card) => (
            <article className="type-card" key={card.title}>
              <div className="type-card-head">
                <strong>{card.title}</strong>
                <span className="status-chip active">{card.badge}</span>
              </div>
              <p>{card.desc}</p>
              <Link className="button small secondary" href={canCreate ? card.href : "/admin/omr"}>
                {canCreate ? card.cta : "목록 보기"}
              </Link>
            </article>
          ))}
        </div>
      </section>

      <div className="admin-grid">
        <section className="panel">
          <div className="section-heading wrap">
            <div>
              <p className="eyebrow">RECENT</p>
              <h2>최근 시험</h2>
            </div>
            <Link className="button secondary" href="/admin/omr">전체 보기</Link>
          </div>
          {exams.length === 0 ? (
            <p className="subtle">아직 만든 OMR 시험이 없습니다. 위에서 유형을 골라 시작하세요.</p>
          ) : (
            <div className="table-scroll">
              <table className="admin-table">
                <thead>
                  <tr><th>유형</th><th>제목</th><th>정답</th><th>바로가기</th></tr>
                </thead>
                <tbody>
                  {exams.slice(0, 5).map((exam) => {
                    const filled = Object.keys(exam.answerKey ?? {}).length;
                    return (
                      <tr key={exam.id}>
                        <td><span className="status-chip active">{EXAM_TYPE_LABELS[exam.examType]}</span></td>
                        <td>
                          {/*
                            제목을 누르면 그 시험에서 **다음에 할 일**로 간다. 정답이
                            덜 채워졌으면 정답 입력, 다 채웠으면 스캔·검수다. 어느
                            쪽인지는 바로 옆 '정답' 칸에 그대로 보이므로, 눌러 보기
                            전에 어디로 갈지 알 수 있다.
                          */}
                          <Link
                            className="row-title"
                            href={
                              filled >= exam.numQuestions
                                ? `/admin/omr/${exam.id}/scans`
                                : `/admin/omr/${exam.id}/key`
                            }
                          >
                            {exam.title}
                          </Link>
                          <span>{exam.examDate || exam.createdAt.slice(0, 10)}</span>
                        </td>
                        <td>
                          {filled >= exam.numQuestions ? (
                            <span className="status-chip active">완료</span>
                          ) : (
                            <span className="status-chip inactive">{filled}/{exam.numQuestions}</span>
                          )}
                        </td>
                        <td>
                          <div className="row-actions">
                            <Link className="button tiny ghost" href={`/admin/omr/${exam.id}/key`}>정답</Link>
                            <Link className="button tiny ghost" href={`/admin/omr/${exam.id}/scans`}>스캔</Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel">
          <div className="section-heading wrap">
            <div>
              <p className="eyebrow">RECENT</p>
              <h2>최근 성적표</h2>
            </div>
            <Link className="button secondary" href="/admin/reports">전체 보기</Link>
          </div>
          {reports.length === 0 ? (
            <p className="subtle">아직 생성된 성적표가 없습니다.</p>
          ) : (
            <ul className="process-list" style={{ marginTop: 0 }}>
              {reports.slice(0, 5).map((report) => (
                <li className="recent-report-item" key={report.id}>
                  {/*
                    학부모가 받는 그 성적표를 그대로 연다(웹 리포트 관리의 '웹'
                    버튼과 같은 곳). 새 탭으로 여는 것은, 관리 화면으로 돌아오려고
                    뒤로 가기를 누르게 하지 않기 위해서다.
                  */}
                  <a
                    className="recent-report"
                    href={`/r/${report.token}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>{report.studentName.slice(0, 1)}</span>
                    <div>
                      <strong>{report.studentName}</strong>
                      <p>
                        {report.batchTitle} · {new Date(report.createdAt).toLocaleDateString("ko-KR")}
                      </p>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <p className="app-version">
        {APP_VERSION_LABEL} · {APP_RELEASED_AT} 업데이트
      </p>
    </main>
  );
}
