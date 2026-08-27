import Link from "next/link";
import AdminTopNav, { type NavUser } from "@/components/AdminTopNav";
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
    desc: "중3 전국 모의고사. 채점된 엑셀을 올리면 전국 비교·AI 총평이 담긴 성적표가 생성됩니다.",
    href: "/admin/mock",
    cta: "엑셀 업로드",
    badge: "엑셀",
  },
  {
    title: "토요모의고사",
    desc: "영어 45문항. OMR 답안지로 시험 보고 스캔하면 듣기·독해 영역별 분석 성적표가 나옵니다.",
    href: "/admin/omr/new",
    cta: "시험 만들기",
    badge: "OMR",
  },
  {
    title: "월말평가",
    desc: "매월 정기 평가. 표준점수로 전월 대비 성장 추이를 학부모에게 보여줍니다.",
    href: "/admin/omr/new",
    cta: "시험 만들기",
    badge: "OMR",
  },
  {
    title: "반배치고사",
    desc: "신입생·레벨 테스트. 문항 수를 자유롭게 정해 반 편성 근거 자료를 만듭니다.",
    href: "/admin/omr/new",
    cta: "시험 만들기",
    badge: "OMR",
  },
  {
    title: "인클래스 테스트",
    desc: "수업 중 쪽지시험·단원평가. 간단히 만들고 빠르게 채점합니다.",
    href: "/admin/omr/new",
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
                        <td><strong>{exam.title}</strong><span>{exam.examDate || exam.createdAt.slice(0, 10)}</span></td>
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
                <li key={report.id}>
                  <span>{report.studentName.slice(0, 1)}</span>
                  <div>
                    <strong>{report.studentName}</strong>
                    <p>
                      {report.batchTitle} · {new Date(report.createdAt).toLocaleDateString("ko-KR")}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
