"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import AdminTopNav, { type NavUser } from "@/components/AdminTopNav";
import FilterBar, { type FilterGroup } from "@/components/FilterBar";
import {
  EXAM_TYPE_LABELS,
  MOCK_SUBJECTS,
  mockSubjectOf,
  type ExamType,
  type OmrExam,
} from "@/lib/omr-types";

interface Props {
  initialExams: OmrExam[];
  setupError: string;
  /** 좌측 하위 메뉴에서 고른 시험 유형(없으면 전체) */
  activeType: ExamType | null;
  /** OMR_API_URL이 이 배포 환경에 설정되어 있는가 */
  omrServiceReady: boolean;
  canCreate: boolean;
  canDelete: boolean;
  currentUser: NavUser;
}

export default function OmrDashboard({
  initialExams,
  setupError,
  activeType,
  omrServiceReady,
  canCreate,
  canDelete,
  currentUser,
}: Props) {
  const [exams, setExams] = useState<OmrExam[]>(initialExams);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(setupError);
  // 필터는 그룹마다 복수 선택, 그룹끼리는 AND
  const [types, setTypes] = useState<string[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [authors, setAuthors] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("recent");

  const isMock = activeType === "mock";
  // 좌측 하위 메뉴에서 고른 유형이 먼저 걸리고, 그 안에서 필터가 다시 좁힌다
  const typeExams = useMemo(
    () => (activeType ? exams.filter((exam) => exam.examType === activeType) : exams),
    [exams, activeType],
  );

  const keyDone = (exam: OmrExam) =>
    Object.keys(exam.answerKey ?? {}).length >= exam.numQuestions;

  /** 필터 후보는 지금 보고 있는 범위(typeExams)에서 뽑는다 */
  const authorOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const exam of typeExams) {
      const name = exam.createdByName?.trim() || "알 수 없음";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, label: value, count }));
  }, [typeExams]);

  const typeOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const exam of exams) counts.set(exam.examType, (counts.get(exam.examType) ?? 0) + 1);
    return (Object.keys(EXAM_TYPE_LABELS) as ExamType[]).map((key) => ({
      value: key,
      label: EXAM_TYPE_LABELS[key],
      count: counts.get(key) ?? 0,
    }));
  }, [exams]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = typeExams.filter((exam) => {
      if (types.length > 0 && !types.includes(exam.examType)) return false;
      if (subjects.length > 0) {
        const subject = mockSubjectOf(exam.subject)?.value;
        if (!subject || !subjects.includes(subject)) return false;
      }
      if (authors.length > 0 && !authors.includes(exam.createdByName?.trim() || "알 수 없음")) {
        return false;
      }
      if (states.length > 0) {
        const state = keyDone(exam) ? "done" : "todo";
        if (!states.includes(state)) return false;
      }
      if (query && !`${exam.title} ${exam.examDate ?? ""}`.toLowerCase().includes(query)) {
        return false;
      }
      return true;
    });

    const sorted = [...rows];
    sorted.sort((a, b) => {
      switch (sort) {
        case "oldest":
          return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
        case "title":
          return a.title.localeCompare(b.title, "ko");
        case "examDate":
          // 시험일 없는 항목은 뒤로
          return (b.examDate ?? "").localeCompare(a.examDate ?? "");
        case "author":
          return (a.createdByName ?? "").localeCompare(b.createdByName ?? "", "ko");
        default:
          return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
      }
    });
    return sorted;
  }, [typeExams, types, subjects, authors, states, search, sort]);

  const filterGroups: FilterGroup[] = [
    // 좌측 메뉴에서 이미 유형을 골랐다면 유형 필터는 숨긴다(중복)
    ...(activeType
      ? []
      : [{ key: "type", label: "유형", options: typeOptions, selected: types, onChange: setTypes }]),
    ...(isMock
      ? [
          {
            key: "subject",
            label: "과목",
            options: MOCK_SUBJECTS.map((s) => ({
              value: s.value,
              label: s.label,
              count: typeExams.filter((e) => mockSubjectOf(e.subject)?.value === s.value).length,
            })),
            selected: subjects,
            onChange: setSubjects,
          },
        ]
      : []),
    { key: "author", label: "만든 사람", options: authorOptions, selected: authors, onChange: setAuthors },
    {
      key: "state",
      label: "정답",
      options: [
        { value: "done", label: "입력 완료", count: typeExams.filter(keyDone).length },
        { value: "todo", label: "미완료", count: typeExams.filter((e) => !keyDone(e)).length },
      ],
      selected: states,
      onChange: setStates,
    },
  ];

  function resetFilters() {
    setTypes([]);
    setSubjects([]);
    setAuthors([]);
    setStates([]);
    setSearch("");
  }

  const heading = activeType ? EXAM_TYPE_LABELS[activeType] : "시험 목록";
  const newExamHref = activeType ? `/admin/omr/new?type=${activeType}` : "/admin/omr/new";

  async function remove(id: string, title: string) {
    if (!window.confirm(`'${title}' 시험을 삭제할까요?`)) return;
    setBusy(id);
    setError("");
    try {
      const res = await fetch(`/api/admin/omr/exams/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "삭제하지 못했습니다.");
      setExams((prev) => prev.filter((exam) => exam.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제 중 오류가 발생했습니다.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="admin-shell">
      <AdminTopNav user={currentUser} />

      {error ? <p className="form-error block">{error}</p> : null}

      {!omrServiceReady ? (
        <p className="form-error block">
          <strong>답안지 서비스가 연결되지 않았습니다.</strong> 이 배포 환경에{" "}
          <code>OMR_API_URL</code>이 없어서 답안지 PDF 출력과 스캔 판독이 동작하지 않습니다. Vercel →
          Settings → Environment Variables 에서 <code>OMR_API_URL</code>·<code>OMR_API_KEY</code>를
          Production · Preview · Development 세 곳 모두에 추가한 뒤 다시 배포해 주세요.
        </p>
      ) : null}

      {/* 국영수 모의고사는 전국 채점 엑셀로 성적표를 만드는 길도 함께 제공한다 */}
      {isMock ? (
        <div className="panel" style={{ marginBottom: 20 }}>
          <div className="section-heading wrap">
            <div>
              <p className="eyebrow">국영수 모의고사</p>
              <h2>진행 방법 두 가지</h2>
              <p className="subtle">
                학원에서 직접 보는 시험은 <strong>OMR</strong>로, 전국 모의고사 채점 결과를 받았다면{" "}
                <strong>엑셀</strong>로 올리면 전국 비교·AI 총평 성적표가 나옵니다.
              </p>
            </div>
            <div className="toolbar" style={{ flexWrap: "wrap" }}>
              {canCreate ? (
                <>
                  <Link className="button primary" href={newExamHref}>+ OMR 시험 만들기</Link>
                  <Link className="button secondary" href="/admin/mock">전국 엑셀 올리기</Link>
                </>
              ) : null}
            </div>
          </div>
          <p className="subtle" style={{ margin: 0 }}>
            OMR은 <strong>국어 · 영어 · 수학 과목마다 답안지를 따로</strong> 만듭니다(문항 수와
            교시가 다릅니다). 시험 만들기에서 과목을 고르면 기본값이 자동으로 잡힙니다.
          </p>
        </div>
      ) : null}

      <div className="panel">
        <div className="section-heading wrap">
          <div>
            <p className="eyebrow">OMR EXAMS</p>
            <h2>{heading}</h2>
            <p className="subtle">
              답안지 출력 → 정답 입력 → 스캔 판독 → 검수 → 성적표 순서로 진행합니다.
              {activeType ? ` · ${visible.length}개` : ""}
            </p>
          </div>
          {canCreate && !isMock ? (
            <Link className="button primary" href={newExamHref}>+ 새 시험</Link>
          ) : null}
        </div>

        {typeExams.length > 0 ? (
          <FilterBar
            groups={filterGroups}
            sort={{
              value: sort,
              onChange: setSort,
              options: [
                { value: "recent", label: "만든 날짜 ↓" },
                { value: "oldest", label: "만든 날짜 ↑" },
                { value: "examDate", label: "시험일 ↓" },
                { value: "title", label: "제목" },
                { value: "author", label: "만든 사람" },
              ],
            }}
            search={{ value: search, onChange: setSearch, placeholder: "시험 제목 검색" }}
            resultLabel={`${visible.length} / ${typeExams.length}개`}
            onReset={resetFilters}
          />
        ) : null}

        {visible.length === 0 ? (
          <p className="subtle">
            {typeExams.length > 0
              ? "조건에 맞는 시험이 없습니다. 필터를 조정하거나 초기화해 보세요."
              : activeType
                ? `아직 만든 ${EXAM_TYPE_LABELS[activeType]}가 없습니다. “새 시험”으로 시작하세요.`
                : "아직 만든 시험이 없습니다. “새 시험”으로 시작하세요."}
          </p>
        ) : (
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>유형</th>
                  <th>제목</th>
                  <th>구성</th>
                  <th>만든 사람</th>
                  <th>만든 날짜</th>
                  <th>작업</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((exam) => (
                  <tr key={exam.id}>
                    <td>
                      <span className="status-chip active">{EXAM_TYPE_LABELS[exam.examType]}</span>
                      {mockSubjectOf(exam.subject) ? (
                        <span>{mockSubjectOf(exam.subject)?.label}</span>
                      ) : null}
                    </td>
                    <td>
                      <strong>{exam.title}</strong>
                      {exam.examDate ? <span>{exam.examDate}</span> : null}
                      <span title={`시험 ID ${exam.id}`}>ID {exam.id.slice(0, 8)}</span>
                    </td>
                    <td>
                      {exam.numQuestions}문항 · {exam.numChoices}지 ·{" "}
                      {exam.omrStyle === "exam" ? "수능형" : "기본형"}
                      <span>
                        {(() => {
                          const filled = Object.keys(exam.answerKey ?? {}).length;
                          return filled >= exam.numQuestions
                            ? `정답 완료`
                            : filled > 0
                              ? `정답 ${filled}/${exam.numQuestions}`
                              : "정답 미입력";
                        })()}
                      </span>
                    </td>
                    <td>{exam.createdByName?.trim() || "—"}</td>
                    <td>{exam.createdAt ? exam.createdAt.slice(0, 10) : ""}</td>
                    <td>
                      <div className="link-actions">
                        <a
                          className="button tiny primary"
                          href={`/api/admin/omr/exams/${exam.id}/sheet`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          답안지 PDF
                        </a>
                        <Link className="button tiny secondary" href={`/admin/omr/${exam.id}/key`}>
                          정답 입력
                        </Link>
                        <Link className="button tiny secondary" href={`/admin/omr/${exam.id}/scans`}>
                          스캔 · 검수
                        </Link>
                        <Link className="button tiny secondary" href={`/admin/omr/${exam.id}/reports`}>
                          성적표
                        </Link>
                        {exam.useTeacherComment ? (
                          <Link className="button tiny secondary" href={`/admin/omr/${exam.id}/comments`}>
                            담임 의견
                          </Link>
                        ) : null}
                        {canDelete ? (
                          <button
                            className="button tiny danger"
                            disabled={busy === exam.id}
                            onClick={() => remove(exam.id, exam.title)}
                          >
                            삭제
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
