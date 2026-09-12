import Link from "next/link";
import AdminTopNav, { type NavUser } from "@/components/AdminTopNav";
import type { ExamGroup } from "@/lib/homeroom";
import { EXAM_TYPE_LABELS } from "@/lib/omr-types";

interface Props {
  user: NavUser;
  groups: ExamGroup[];
  setupError: string;
}

/**
 * 담임 선생님의 '내 반' — 제 학생들의 성적표와 시험별 반 요약.
 *
 * 훅이 없는 그리기 전용 컴포넌트다. 데이터는 페이지가 넘겨주고, 펼치고 접는
 * 것은 <details> 로 충분하다 — 담임이 보는 화면에서 스크립트가 할 일이 없다.
 * 데이터를 떼어 둔 덕에 가짜 데이터로 그려 보며 사용설명서 사진도 찍을 수 있다.
 */
export default function MyClassView({ user, groups, setupError }: Props) {
  const studentTotal = new Set(
    groups.flatMap((g) => g.students.map((s) => s.studentKey ?? s.reportId)),
  ).size;

  return (
    <div className="admin-shell">
      <AdminTopNav user={user} />

      <section className="panel">
        <div className="section-heading wrap">
          <div>
            <p className="eyebrow">MY CLASS</p>
            <h2>{user.displayName} 선생님 반</h2>
            <p className="subtle">
              학생 관리 프로그램에서 담임이 <strong>{user.displayName}</strong>으로 적힌 학생들의
              성적표입니다. 시험마다 반 평균을 전체 평균 옆에 놓았고, 학생 이름을 누르면 성적표가
              열립니다(학부모 PIN 없이 바로 열립니다).
            </p>
            <p className="subtle">
              반배치고사는 여기에 나오지 않습니다. 담임 정보는 성적표를 만들 때 함께 저장되므로,
              그 전에 만든 성적표는 여기 없을 수 있습니다.
            </p>
          </div>
          {groups.length > 0 ? (
            <div className="review-counts">
              <span>
                시험 <strong>{groups.length}</strong>개
              </span>
              <span>
                학생 <strong>{studentTotal}</strong>명
              </span>
            </div>
          ) : null}
        </div>

        {setupError ? <p className="form-error block">{setupError}</p> : null}

        {!setupError && groups.length === 0 ? (
          <div className="info-box">
            <strong>아직 보이는 성적표가 없습니다.</strong>
            <p>
              담임으로 등록된 학생의 성적표가 만들어지면 여기 나타납니다. 학생 관리 프로그램의 담임
              이름과 인사 프로그램의 이름이 서로 다르면(띄어쓰기는 괜찮습니다) 보이지 않으니, 그
              경우 운영진에 알려 주세요.
            </p>
          </div>
        ) : null}

        {groups.map((group, index) => (
          <details key={group.examId ?? group.examTitle} className="my-class-exam" open={index === 0}>
            <summary>
              <div className="my-class-exam-head">
                <div>
                  <span className="status-chip active">{EXAM_TYPE_LABELS[group.examType]}</span>
                  <strong>{group.examTitle}</strong>
                  <span className="subtle">{group.examDate ?? ""}</span>
                </div>
                <div className="review-counts">
                  <span>
                    우리 반 <strong>{group.summary.count}</strong>명
                  </span>
                  <span className="auto">
                    반 평균 <strong>{group.summary.mean}</strong>점
                  </span>
                  <span>
                    전체 평균 <strong>{group.summary.cohortMean}</strong>점
                  </span>
                  <span className="ok">
                    전체 평균 이상 <strong>{group.summary.aboveCohort}</strong>명
                  </span>
                </div>
              </div>
            </summary>

            <div className="my-class-body">
              {group.summary.areas.length > 0 ? (
                <div className="my-class-areas">
                  {group.summary.areas.map((a) => {
                    const diff = Math.round((a.rate - a.cohortRate) * 10) / 10;
                    return (
                      <div key={a.area} className="my-class-area">
                        <span className="my-class-area-name">{a.area}</span>
                        <strong>{a.rate}%</strong>
                        <span className={diff >= 0 ? "up" : "down"}>
                          전체 {a.cohortRate}% ({diff >= 0 ? "+" : ""}
                          {diff})
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              <div className="table-scroll">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>석차(전체)</th>
                      <th>학생</th>
                      <th>학교 · 학년</th>
                      <th>점수</th>
                      <th>표준점수</th>
                      <th>학부모 열람</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.students.map((s) => (
                      <tr key={s.reportId}>
                        <td>
                          {s.rank} / {s.cohortCount}
                        </td>
                        <td>
                          <Link href={`/r/${s.token}`} target="_blank" rel="noreferrer">
                            <strong>{s.studentName}</strong>
                          </Link>
                          {s.className ? <span className="subtle"> · {s.className}</span> : null}
                        </td>
                        <td>{s.school || "-"}</td>
                        <td>
                          <strong>{s.raw}</strong> / {s.max}
                        </td>
                        <td>{s.standardScore}</td>
                        <td>{s.viewCount > 0 ? `${s.viewCount}회` : "아직"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </details>
        ))}
      </section>
    </div>
  );
}
