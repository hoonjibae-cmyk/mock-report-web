import Link from "next/link";
import AdminTopNav, { type NavUser } from "@/components/AdminTopNav";
import ExamTypeBadge from "@/components/ExamTypeBadge";
import TeacherPicker from "@/components/TeacherPicker";
import TrendChart from "@/components/TrendChart";
import { EXAM_TYPE_LABELS } from "@/lib/omr-types";
import type { HistoryGroup, StudentCandidate } from "@/lib/student-history";

export interface StudentHistory {
  student: StudentCandidate;
  groups: HistoryGroup[];
  /** 이 계정이 볼 수 없는 유형이라 가려진 성적표 수(반배치고사) */
  hiddenCount: number;
}

interface Props {
  user: NavUser;
  /** 검색 범위의 담임 — 일반 계정은 본인, 총괄은 고른 선생님 또는 빈 값(전체) */
  teacherName: string;
  /** 총괄에게만 주는 선생님 목록. null 이면 드롭다운이 없다 */
  teachers: string[] | null;
  query: string;
  /** null 이면 아직 검색하지 않았다 */
  candidates: StudentCandidate[] | null;
  history: StudentHistory | null;
  /** 담임이 제 학생이 아닌 학생의 이력을 열려 했다 */
  forbidden: boolean;
  setupError: string;
}

/** 학생 이력 주소 — 수험번호가 있으면 그것, 없으면 이름+학교 */
function historyHref(c: StudentCandidate, teacherName: string): string {
  const params = new URLSearchParams();
  if (c.studentKey) params.set("key", c.studentKey);
  else {
    params.set("name", c.studentName);
    params.set("school", c.school);
  }
  if (teacherName) params.set("teacher", teacherName);
  return `/admin/students?${params.toString()}`;
}

function fmt(value: number): string {
  return String(Math.round(value * 10) / 10);
}

/**
 * 학생별 시험 이력 — 이름으로 찾고, 그 학생이 본 시험을 유형별로 늘어놓는다.
 *
 * 훅이 없는 그리기 전용 컴포넌트다(추이 그래프만 클라이언트). 검색은 주소(?q=)로
 * 가는 보통의 폼이라 스크립트 없이도 움직인다.
 */
export default function StudentHistoryView({
  user,
  teacherName,
  teachers,
  query,
  candidates,
  history,
  forbidden,
  setupError,
}: Props) {
  const scopeLabel = teacherName ? (
    <>
      성적표에 담임이 <strong>{teacherName}</strong>으로 적힌 학생
    </>
  ) : (
    <>모든 학생</>
  );

  return (
    <div className="admin-shell">
      <AdminTopNav user={user} />

      <section className="panel">
        <div className="section-heading wrap">
          <div>
            <p className="eyebrow">STUDENT HISTORY</p>
            <h2>학생별 시험 이력</h2>
            <p className="subtle">
              {scopeLabel}을 이름이나 수험번호로 찾습니다. 학생을 고르면 그 학생이 OMR 리포트로 본 시험이
              담임이 바뀌기 전 것까지 모두 나오고, 시험 제목을 누르면 성적표가 열립니다(학부모 PIN 없이).
            </p>
          </div>
          <div className="my-class-tools">
            {teachers ? (
              <TeacherPicker
                teachers={teachers}
                current={teacherName}
                self={user.displayName}
                basePath="/admin/students"
                allowAll
              />
            ) : null}
          </div>
        </div>

        <form className="student-search" method="get" action="/admin/students">
          {teacherName && teachers ? <input type="hidden" name="teacher" value={teacherName} /> : null}
          <input
            name="q"
            defaultValue={query}
            placeholder="학생 이름 또는 수험번호"
            aria-label="학생 이름 또는 수험번호"
            autoComplete="off"
            maxLength={40}
          />
          <button className="button primary" type="submit">
            찾기
          </button>
        </form>

        {setupError ? <p className="form-error block">{setupError}</p> : null}

        {candidates && candidates.length === 0 ? (
          <p className="subtle">
            ‘{query}’에 맞는 학생이 없습니다.
            {teacherName
              ? ` 성적표에 담임이 ${teacherName}으로 적힌 학생만 찾습니다 — 담임 정보는 성적표를 만들 때 저장되므로, 그 전에 만든 성적표뿐인 학생은 여기 없을 수 있습니다.`
              : " 성적표가 만들어진 학생만 찾을 수 있습니다."}
          </p>
        ) : null}

        {candidates && candidates.length > 0 ? (
          <div className="table-scroll">
            <table className="admin-table student-table">
              <thead>
                <tr>
                  <th>학생</th>
                  <th>학교</th>
                  <th>반 · 담임</th>
                  <th>성적표</th>
                  <th>최근 응시</th>
                  <th>이력</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => (
                  <tr key={c.identity}>
                    <td>
                      <strong>{c.studentName}</strong>
                      {c.studentKey ? <span>수험번호 {c.studentKey}</span> : <span>수험번호 없음(옛 성적표)</span>}
                    </td>
                    <td>{c.school || "—"}</td>
                    <td>
                      {c.className || "—"}
                      {c.teacher ? <span>담임 {c.teacher}</span> : null}
                    </td>
                    <td>{c.reportCount}장</td>
                    <td>{c.lastExamDate ?? "—"}</td>
                    <td>
                      <Link className="button tiny primary" href={historyHref(c, teachers ? teacherName : "")}>
                        이력 보기
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {forbidden ? (
        <section className="panel">
          <div className="info-box">
            <strong>담당 학생이 아닙니다.</strong>
            <p>성적표에 담임으로 적힌 학생의 이력만 볼 수 있습니다. 위에서 학생을 다시 찾아 주세요.</p>
          </div>
        </section>
      ) : null}

      {history ? (
        <section className="panel">
          <div className="section-heading wrap">
            <div>
              <p className="eyebrow">HISTORY</p>
              <h2>
                {history.student.studentName}
                {history.student.school ? <span className="student-school"> · {history.student.school}</span> : null}
              </h2>
              <p className="subtle">
                {history.student.className ? `${history.student.className} · ` : ""}
                {history.student.teacher ? `담임 ${history.student.teacher} · ` : ""}
                {history.student.studentKey ? `수험번호 ${history.student.studentKey}` : "수험번호 없음"}
                {" · "}가장 최근 성적표 기준
              </p>
            </div>
            <div className="review-counts">
              <span>
                시험 <strong>{history.groups.reduce((n, g) => n + g.rows.length, 0)}</strong>회
              </span>
              <span>
                마지막 응시 <strong>{history.student.lastExamDate ?? "—"}</strong>
              </span>
            </div>
          </div>

          {history.groups.length === 0 ? (
            <p className="subtle">
              볼 수 있는 성적표가 없습니다.
              {history.hiddenCount > 0 ? ` 이 계정에 열리지 않는 유형의 성적표 ${history.hiddenCount}장은 가려졌습니다.` : ""}
            </p>
          ) : null}

          {history.groups.map((group) => (
            <div key={group.examType} className="history-group">
              <div className="history-group-head">
                <ExamTypeBadge type={group.examType} sub={null} />
                <strong>{EXAM_TYPE_LABELS[group.examType]}</strong>
                <span className="subtle">{group.rows.length}회</span>
              </div>

              {group.points.length >= 2 ? (
                <TrendChart points={group.points} examTypeLabel={EXAM_TYPE_LABELS[group.examType]} />
              ) : null}

              <div className="table-scroll">
                <table className="admin-table history-table">
                  <thead>
                    <tr>
                      <th>응시일</th>
                      <th>시험</th>
                      <th>점수</th>
                      <th>평균</th>
                      <th>석차</th>
                      <th>표준점수</th>
                      <th>영역별 성취율</th>
                      <th>그때의 반 · 담임</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((row) => (
                      <tr key={row.reportId}>
                        <td>{row.examDate ?? row.createdAt.slice(0, 10)}</td>
                        <td>
                          <Link href={`/r/${row.token}`} target="_blank" rel="noreferrer" className="row-title">
                            {row.examTitle}
                          </Link>
                          {row.listeningAbsent ? <span>듣기 미응시 · 듣기는 평균으로 산출</span> : null}
                        </td>
                        <td>
                          <strong>{fmt(row.raw)}</strong>
                          <span>/ {fmt(row.max)}점</span>
                        </td>
                        <td>{fmt(row.cohortMean)}점</td>
                        <td>
                          {row.rank}
                          <span>/ {row.cohortCount}명</span>
                        </td>
                        <td>{fmt(row.standardScore)}</td>
                        <td className="history-areas">
                          {row.areas.length > 0
                            ? row.areas.map((a) => `${a.area} ${fmt(a.rate)}%`).join(" · ")
                            : "—"}
                        </td>
                        <td>
                          {row.className || "—"}
                          {row.teacher ? <span>{row.teacher}</span> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {history.hiddenCount > 0 && history.groups.length > 0 ? (
            <p className="subtle">이 계정에 열리지 않는 유형의 성적표 {history.hiddenCount}장은 가려졌습니다.</p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
