"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { copyText } from "@/lib/clipboard";
import {
  areaMaxima,
  areasOf,
  fmtScore,
  hardestQuestions,
  rateClass,
  summaryClipboardText,
} from "@/lib/exam-summary";
import type { ExamGroup } from "@/lib/homeroom";

/**
 * '내 반'의 시험 한 건 — 결과 요약과 같은 표를 우리 반 학생만으로.
 *
 * 점수·석차·표준점수·영역별 점수·오답 수와 문항별 정오(맞으면 ○, 틀리면 고른
 * 번호, 안 풀었으면 ·), 머리줄의 정답과 정답률(우리 반·전체), 우리 반이 많이
 * 틀린 문항, 엑셀 붙여넣기용 복사. 결과 요약은 답안지를 다시 채점하지만 여기는
 * 성적표에 저장된 결과를 그대로 그린다 — 담임이 보는 것은 발행된 성적표와 같아야 한다.
 */
export default function ClassExamDetail({ group }: { group: ExamGroup }) {
  const [showItems, setShowItems] = useState(true);
  const [copied, setCopied] = useState("");
  const copiedTimer = useRef<number | null>(null);

  const questions = group.questions;
  const areas = useMemo(() => areasOf(questions), [questions]);
  const maxima = useMemo(() => areaMaxima(questions), [questions]);
  // 우리 반 정답률 낮은 순 — 수업에서 다시 다룰 문항
  const hardest = useMemo(
    () => hardestQuestions(questions.map((q) => ({ ...q, rate: group.classRates[q.no] ?? 0 })), 5),
    [questions, group.classRates],
  );
  const cohortRate = useMemo(() => new Map(questions.map((q) => [q.no, q.rate])), [questions]);

  const cohortCount = group.students[0]?.cohortCount ?? 0;
  const max = group.students[0]?.max ?? 100;
  // 옛 성적표(문항 결과가 없는 것)만 있는 시험이면 문항 칸을 그리지 않는다
  const hasItems = questions.length > 0 && group.students.some((s) => s.items.length > 0);
  const anyAbsent = group.students.some((s) => s.listeningAbsent);
  const itemsOn = showItems && hasItems;
  const fixedCols = 5 + areas.length; // 학생 다음의 석차·점수·표준점수·영역들·오답·열람 — 학생 칸은 뺀다

  async function copyForExcel() {
    const rows = group.students.map((s) => ({
      name: s.studentName,
      studentKey: s.studentKey,
      raw: s.raw,
      areas: s.areas,
    }));
    const ok = await copyText(summaryClipboardText(rows, areas));
    setCopied(
      ok
        ? `${rows.length}명 복사됨 — 엑셀에 붙여넣으세요` +
            (anyAbsent ? " (듣기 미응시 학생의 듣기는 평균값)" : "")
        : "복사하지 못했습니다. 브라우저가 클립보드를 막았을 수 있습니다.",
    );
    if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopied(""), 5000);
  }

  return (
    <>
      <div className="my-class-detail-controls no-print">
        <span className="subtle">
          {hasItems ? `맞으면 ○, 틀리면 학생이 고른 번호, 안 풀었으면 ·${anyAbsent ? ", 듣기 미응시는 미" : ""}` : ""}
        </span>
        {hasItems ? (
          <label className="checkbox-row" style={{ margin: 0 }}>
            <input type="checkbox" checked={showItems} onChange={(e) => setShowItems(e.target.checked)} />
            <span>문항별 정오 보기</span>
          </label>
        ) : null}
        <button
          type="button"
          className="button small secondary"
          onClick={copyForExcel}
          title={`학생명 · 총점${areas.length ? ` · ${areas.join(" · ")}` : ""} 순으로 탭으로 나눠 복사합니다. 엑셀에 바로 붙여넣을 수 있습니다.`}
        >
          엑셀 붙여넣기용 복사
        </button>
        {copied ? (
          <span className="summary-copied" role="status">
            {copied}
          </span>
        ) : null}
      </div>

      <div className="table-scroll summary-scroll my-class-scroll">
        <table className="admin-table summary-table">
          <thead>
            <tr>
              <th className="sticky-col">학생</th>
              <th>
                석차 <span className="th-max">({cohortCount}명 중)</span>
              </th>
              <th>
                점수 <span className="th-max">({fmtScore(max)})</span>
              </th>
              <th>표준점수</th>
              {areas.map((area) => {
                const m = maxima.get(area);
                return (
                  <th key={area}>
                    {area}
                    {m !== undefined ? <span className="th-max"> ({fmtScore(m)})</span> : null}
                  </th>
                );
              })}
              <th>오답·무응답</th>
              <th>학부모 열람</th>
              {itemsOn
                ? questions.map((q) => (
                    <th key={q.no} className={`q-head${q.essay ? " essay" : ""}`} title={q.area ? `${q.no}번 · ${q.area}` : `${q.no}번`}>
                      {q.no}
                    </th>
                  ))
                : null}
            </tr>
            {itemsOn ? (
              <>
                <tr className="q-meta">
                  <th className="sticky-col">정답</th>
                  <th colSpan={fixedCols} />
                  {questions.map((q) => (
                    <th key={q.no} className="q-head">
                      {q.answer}
                    </th>
                  ))}
                </tr>
                <tr className="q-meta">
                  <th className="sticky-col">정답률 · 우리 반</th>
                  <th colSpan={fixedCols} />
                  {questions.map((q) => {
                    const r = group.classRates[q.no] ?? 0;
                    return (
                      <th key={q.no} className={`q-head ${rateClass(r)}`} title={`${q.no}번 우리 반 정답률 ${r}%`}>
                        {r}
                      </th>
                    );
                  })}
                </tr>
                <tr className="q-meta">
                  <th className="sticky-col">정답률 · 전체</th>
                  <th colSpan={fixedCols} />
                  {questions.map((q) => (
                    <th key={q.no} className={`q-head ${rateClass(q.rate)}`} title={`${q.no}번 응시생 전체 정답률 ${q.rate}%`}>
                      {q.rate}
                    </th>
                  ))}
                </tr>
              </>
            ) : null}
          </thead>
          <tbody>
            {group.students.map((s) => {
              const areaByName = new Map(s.areas.map((a) => [a.area, a]));
              const itemByNo = new Map(s.items.map((it) => [it.no, it]));
              return (
                <tr key={s.reportId}>
                  <td className="sticky-col">
                    <Link href={`/r/${s.token}`} target="_blank" rel="noreferrer" className="summary-name">
                      {s.studentName}
                    </Link>
                    <span className="subtle summary-sub">
                      {[s.school, s.className].filter(Boolean).join(" · ")}
                      {s.listeningAbsent ? <em className="summary-absent"> 듣기 미응시</em> : null}
                    </span>
                  </td>
                  <td>{s.rank}</td>
                  <td>
                    <strong>{fmtScore(s.raw)}</strong>
                  </td>
                  <td>{fmtScore(s.standardScore)}</td>
                  {areas.map((area) => {
                    const a = areaByName.get(area);
                    return (
                      <td
                        key={area}
                        className={a ? (a.estimated ? "estimated" : rateClass(a.rate)) : ""}
                        title={a?.estimated ? "듣기 미응시 — 본 학생들의 평균 적용" : undefined}
                      >
                        {a ? (
                          <>
                            {fmtScore(a.earned)}
                            {a.estimated ? <span className="subtle"> 평균</span> : null}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                    );
                  })}
                  <td>
                    {s.wrongCount}
                    {s.blankCount > 0 ? <span className="subtle"> · 무응답 {s.blankCount}</span> : null}
                  </td>
                  <td>{s.viewCount > 0 ? `${s.viewCount}회` : "아직"}</td>
                  {itemsOn
                    ? questions.map((q) => {
                        const it = itemByNo.get(q.no);
                        if (!it) {
                          return <td key={q.no} className="q blank" title={`${q.no}번 결과 없음`}>·</td>;
                        }
                        const kind = it.absent ? "absent" : q.essay ? "essay" : it.correct ? "ok" : it.marked ? "no" : "blank";
                        const title = it.absent
                          ? `${q.no}번 듣기 미응시 — 채점하지 않음`
                          : q.essay
                            ? `${q.no}번 서술형 ${it.earned}/${q.point}점`
                            : it.correct
                              ? `${q.no}번 정답`
                              : it.marked
                                ? `${q.no}번 ${it.marked} 선택 (오답)`
                                : `${q.no}번 무응답`;
                        return (
                          <td key={q.no} className={`q ${kind}`} title={title}>
                            {it.absent ? "미" : q.essay ? fmtScore(it.earned) : it.correct ? "○" : it.marked || "·"}
                          </td>
                        );
                      })
                    : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {hasItems && hardest.length > 0 ? (
        <div className="my-class-hardest">
          <p className="eyebrow">우리 반이 많이 틀린 문항</p>
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
                <small>전체 {cohortRate.get(q.no) ?? 0}%</small>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}
