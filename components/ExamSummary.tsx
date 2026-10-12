"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import AcademyLogo from "@/components/AcademyLogo";
import {
  areasOf,
  duplicateKeys,
  hardestQuestions,
  scoreBins,
  sortRows,
  type ExamSummaryData,
  type SummarySort,
} from "@/lib/exam-summary";
import { formatWhen } from "@/lib/review";

/** 정답률에 따라 셀 바탕을 달리한다 — 낮을수록 붉게 */
function rateClass(rate: number): string {
  if (rate < 40) return "rate-low";
  if (rate < 70) return "rate-mid";
  return "rate-high";
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * 시험 결과 요약 화면.
 *
 * 응시생 전원이 한 표에 있다 — 점수·석차·표준점수·영역별 점수와 문항별 정오.
 * 맞은 문항은 ○, 틀린 문항은 학생이 고른 번호, 안 푼 문항은 ·. 머리줄에 정답과
 * 정답률을 두어 "3번을 많이 골랐네"가 바로 보인다. 저장된 보고서가 아니라 열
 * 때마다 다시 계산되므로 답안지를 더 판독하면 저절로 들어온다.
 */
export default function ExamSummary({ data, canExport }: { data: ExamSummaryData; canExport: boolean }) {
  const [sort, setSort] = useState<SummarySort>("score");
  const [showItems, setShowItems] = useState(true);

  const rows = useMemo(() => sortRows(data.rows, sort), [data.rows, sort]);
  const areas = useMemo(() => areasOf(data.questions), [data.questions]);
  const bins = useMemo(() => scoreBins(data.rows), [data.rows]);
  const hardest = useMemo(() => hardestQuestions(data.questions, 5), [data.questions]);
  const dups = useMemo(() => duplicateKeys(data.rows), [data.rows]);

  const unnamed = data.rows.filter((r) => !r.name).length;
  const withoutReport = data.rows.filter((r) => !r.reportToken).length;
  const base = `/admin/omr/${data.examId}`;

  return (
    <div className="admin-shell summary-shell">
      <header className="admin-header">
        <div className="brand-lockup">
          <AcademyLogo size="large" href="/admin" />
          <div>
            <strong>결과 요약</strong>
            <span>
              {data.typeLabel} · {data.title}
              {data.examDate ? ` · ${data.examDate}` : ""}
            </span>
          </div>
        </div>
        <div className="toolbar no-print" style={{ flexWrap: "wrap" }}>
          <Link className="button ghost" href="/admin/omr">← 시험 목록</Link>
          <Link className="button secondary" href={`${base}/scans`}>스캔 · 검수</Link>
          <Link className="button secondary" href={`${base}/reports`}>성적표 생성</Link>
          {canExport && data.reportCount > 0 ? (
            <a className="button secondary" href={`/api/admin/omr/exams/${data.examId}/scores`}>
              성적 엑셀 받기
            </a>
          ) : null}
          <button className="button primary" type="button" onClick={() => window.print()}>
            인쇄
          </button>
        </div>
      </header>

      <section className="panel">
        <div className="section-heading wrap">
          <div>
            <p className="eyebrow">응시 집단</p>
            <h2>
              검수 완료 답안지 {data.rows.length}장
              {data.pendingScans > 0 ? <span className="subtle"> · 검수 대기 {data.pendingScans}장은 빠져 있습니다</span> : null}
            </h2>
            <p className="subtle">
              이 요약은 저장된 문서가 아니라 열 때마다 지금 검수 완료된 답안지로 다시 채점합니다. 답안지를 더
              판독하면 다음에 열 때 저절로 들어옵니다. 기준 시각 {formatWhen(data.generatedAt)}.
            </p>
          </div>
        </div>

        {data.rows.length === 0 ? (
          <p className="subtle">
            아직 검수 완료된 답안지가 없습니다. <Link href={`${base}/scans`}>스캔 · 검수</Link>에서 판독을 마치면 여기에
            전원의 결과가 모입니다.
          </p>
        ) : (
          <>
            <div className="review-counts summary-kpis">
              <span>
                응시 <strong>{data.cohort.count}</strong>명
              </span>
              <span>
                평균 <strong>{fmt(data.cohort.mean)}</strong> / {data.max}점
              </span>
              <span>
                표준편차 <strong>{fmt(data.cohort.stdev)}</strong>
              </span>
              <span>
                최고 <strong>{fmt(data.cohort.max)}</strong>
              </span>
              <span>
                최저 <strong>{fmt(data.cohort.min)}</strong>
              </span>
              <span className={withoutReport > 0 ? "need" : "ok"}>
                성적표 <strong>{data.rows.length - withoutReport}</strong>/{data.rows.length}명 생성
              </span>
              {data.listening && data.listening.absent > 0 ? (
                <span className="need" title="듣기를 안 본 학생의 듣기 점수는 본 학생들의 평균을 적용합니다">
                  듣기 미응시 <strong>{data.listening.absent}</strong>명 · 듣기 평균 {data.listening.mean}/{data.listening.possible}점
                  (응시 {data.listening.takers}명 기준)
                </span>
              ) : null}
            </div>
            {!data.answerKeyComplete ? (
              <p className="form-error block" style={{ marginTop: 10 }}>
                정답이 아직 전부 입력되지 않았습니다. 입력된 문항만 채점한 임시 점수입니다 —{" "}
                <Link href={`${base}/key`}>정답 입력</Link>을 마쳐 주세요.
              </p>
            ) : null}
            {withoutReport > 0 ? (
              <p className="subtle" style={{ marginTop: 8 }}>
                성적표가 아직 없는 학생이 {withoutReport}명입니다. 여기 점수는 그대로 보이지만, 학부모에게 보내려면{" "}
                <Link href={`${base}/reports`}>성적표 생성</Link>을 한 번 더 눌러 주세요(새로 판독한 학생까지 함께 만들어집니다).
              </p>
            ) : null}
            {unnamed > 0 ? (
              <p className="subtle" style={{ marginTop: 4 }}>
                이름을 찾지 못한 답안지 {unnamed}장은 수험번호로 보입니다
                {data.directoryError ? ` — ${data.directoryError}` : " — 학생 관리 프로그램에 없는 번호이거나 잘못 읽힌 번호일 수 있습니다"}.
              </p>
            ) : null}
            {dups.size > 0 ? (
              <p className="subtle" style={{ marginTop: 4 }}>
                같은 수험번호가 두 번 이상 들어온 답안지가 있습니다({[...dups].join(", ")}). 집단 인원과 석차가 그만큼
                어긋나니 <Link href={`${base}/scans`}>스캔 · 검수</Link>에서 하나를 지워 주세요.
              </p>
            ) : null}
          </>
        )}
      </section>

      {data.rows.length > 0 ? (
        <>
          <section className="panel">
            <div className="section-heading wrap">
              <div>
                <p className="eyebrow">학생별 결과</p>
                <h2>
                  맞으면 ○, 틀리면 학생이 고른 번호, 안 풀었으면 ·
                  {data.listening && data.listening.absent > 0 ? ", 듣기 미응시는 미" : ""}
                </h2>
              </div>
              <div className="summary-controls no-print">
                <span className="trend-seg" role="group" aria-label="정렬">
                  {(
                    [
                      ["score", "점수순"],
                      ["name", "이름순"],
                      ["key", "수험번호순"],
                    ] as Array<[SummarySort, string]>
                  ).map(([value, label]) => (
                    <button key={value} type="button" className={sort === value ? "on" : ""} onClick={() => setSort(value)}>
                      {label}
                    </button>
                  ))}
                </span>
                <label className="checkbox-row" style={{ margin: 0 }}>
                  <input type="checkbox" checked={showItems} onChange={(e) => setShowItems(e.target.checked)} />
                  <span>문항별 정오 보기</span>
                </label>
              </div>
            </div>

            <div className="table-scroll summary-scroll">
              <table className="admin-table summary-table">
                <thead>
                  <tr>
                    <th className="sticky-col">학생</th>
                    <th>점수</th>
                    <th>석차</th>
                    <th>표준점수</th>
                    {areas.map((area) => (
                      <th key={area}>{area}</th>
                    ))}
                    <th>오답·무응답</th>
                    {showItems
                      ? data.questions.map((q) => (
                          <th key={q.no} className={`q-head${q.essay ? " essay" : ""}`} title={q.area ? `${q.no}번 · ${q.area}` : `${q.no}번`}>
                            {q.no}
                          </th>
                        ))
                      : null}
                  </tr>
                  {showItems ? (
                    <>
                      <tr className="q-meta">
                        <th className="sticky-col">정답</th>
                        <th colSpan={4 + areas.length} />
                        {data.questions.map((q) => (
                          <th key={q.no} className="q-head">
                            {q.answer}
                          </th>
                        ))}
                      </tr>
                      <tr className="q-meta">
                        <th className="sticky-col">정답률</th>
                        <th colSpan={4 + areas.length} />
                        {data.questions.map((q) => (
                          <th key={q.no} className={`q-head ${rateClass(q.rate)}`} title={`${q.no}번 정답률 ${q.rate}%`}>
                            {q.rate}
                          </th>
                        ))}
                      </tr>
                    </>
                  ) : null}
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const areaByName = new Map(r.areas.map((a) => [a.area, a]));
                    const label = r.name || `수험번호 ${r.studentKey}`;
                    return (
                      <tr key={`${r.studentKey}-${r.rank}-${r.raw}`}>
                        <td className="sticky-col">
                          {r.reportToken ? (
                            <Link href={`/r/${r.reportToken}`} target="_blank" rel="noreferrer" className="summary-name">
                              {label}
                            </Link>
                          ) : (
                            <span className="summary-name plain">{label}</span>
                          )}
                          <span className="subtle summary-sub">
                            {[r.school, r.className].filter(Boolean).join(" · ")}
                            {r.name ? ` · ${r.studentKey}` : ""}
                            {dups.has(r.studentKey) ? <em className="summary-dup"> 중복</em> : null}
                            {r.listeningAbsent ? <em className="summary-absent"> 듣기 미응시</em> : null}
                          </span>
                        </td>
                        <td>
                          <strong>{fmt(r.raw)}</strong>
                          <span className="subtle"> / {r.max}</span>
                        </td>
                        <td>
                          {r.rank}
                          <span className="subtle"> / {data.cohort.count}</span>
                        </td>
                        <td>{fmt(r.standardScore)}</td>
                        {areas.map((area) => {
                          const a = areaByName.get(area);
                          return (
                            <td key={area} className={a ? (a.estimated ? "estimated" : rateClass(a.rate)) : ""} title={a?.estimated ? "듣기 미응시 — 본 학생들의 평균 적용" : undefined}>
                              {a ? (
                                <>
                                  {fmt(a.earned)}
                                  <span className="subtle"> / {fmt(a.possible)}{a.estimated ? " 평균" : ""}</span>
                                </>
                              ) : (
                                "—"
                              )}
                            </td>
                          );
                        })}
                        <td>
                          {r.wrongCount}
                          {r.blankCount > 0 ? <span className="subtle"> · 무응답 {r.blankCount}</span> : null}
                        </td>
                        {showItems
                          ? r.items.map((it) => (
                              <td
                                key={it.no}
                                className={`q ${it.absent ? "absent" : it.essay ? "essay" : it.correct ? "ok" : it.marked ? "no" : "blank"}`}
                                title={
                                  it.absent
                                    ? `${it.no}번 듣기 미응시 — 채점하지 않음`
                                    : it.essay
                                      ? `${it.no}번 서술형 ${it.earned}/${it.point}점`
                                      : it.correct
                                        ? `${it.no}번 정답`
                                        : it.marked
                                          ? `${it.no}번 ${it.marked} 선택 (오답)`
                                          : `${it.no}번 무응답`
                                }
                              >
                                {it.absent ? "미" : it.essay ? `${fmt(it.earned)}` : it.correct ? "○" : it.marked || "·"}
                              </td>
                            ))
                          : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {data.essayCount > 0 ? (
              <p className="subtle" style={{ marginTop: 8 }}>
                서술형 칸에는 받은 점수를 적습니다. 머리줄의 정답률은 서술형이면 평균 득점률입니다.
              </p>
            ) : null}
          </section>

          <div className="summary-grid">
            <section className="panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">문항별 정답률</p>
                  <h2>수업에서 다시 다룰 문항</h2>
                </div>
              </div>
              <ul className="summary-hardest">
                {hardest.map((q) => (
                  <li key={q.no}>
                    <strong>{q.no}번</strong>
                    <span className="subtle">
                      {q.area ? `${q.area} · ` : ""}
                      정답 {q.answer}
                    </span>
                    <span className="rate-bar">
                      <i style={{ width: `${Math.max(2, Math.min(100, q.rate))}%` }} className={rateClass(q.rate)} />
                    </span>
                    <b className={rateClass(q.rate)}>{q.rate}%</b>
                  </li>
                ))}
              </ul>
              <details className="summary-all-rates">
                <summary>문항 전체 정답률 보기</summary>
                <div className="summary-rate-grid">
                  {data.questions.map((q) => (
                    <span key={q.no} className={rateClass(q.rate)} title={`${q.no}번 · 정답 ${q.answer}${q.area ? ` · ${q.area}` : ""}`}>
                      <b>{q.no}</b>
                      {q.rate}%
                    </span>
                  ))}
                </div>
              </details>
            </section>

            <section className="panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">점수 분포</p>
                  <h2>만점 대비 비율</h2>
                </div>
              </div>
              <ul className="summary-bins">
                {bins.map((b) => (
                  <li key={b.label}>
                    <span className="bin-label">{b.label}</span>
                    <span className="rate-bar">
                      <i style={{ width: `${data.rows.length ? (b.count / data.rows.length) * 100 : 0}%` }} />
                    </span>
                    <b>{b.count}명</b>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
