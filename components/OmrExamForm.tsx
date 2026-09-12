"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  EXAM_TYPE_LABELS,
  MOCK_SUBJECTS,
  FIXED_ID_DIGITS,
  USER_QUESTION_COUNT,
  defaultPerColumn,
  defaultSheetTitle,
  type ExamType,
  type MockSubject,
} from "@/lib/omr-types";

const TYPE_DEFAULTS: Record<ExamType, { q: number; subjectLabel: string; period: string }> = {
  mock: { q: 45, subjectLabel: "영어 영역", period: "3" },
  saturday: { q: 45, subjectLabel: "영어 영역", period: "" },
  monthly: { q: 25, subjectLabel: "", period: "" },
  placement: { q: 30, subjectLabel: "", period: "" },
  inclass: { q: 20, subjectLabel: "", period: "" },
};

function subjectDefaults(subject: MockSubject) {
  return MOCK_SUBJECTS.find((s) => s.value === subject) ?? MOCK_SUBJECTS[2];
}

export default function OmrExamForm() {
  const router = useRouter();
  const params = useSearchParams();
  // 좌측 하위 메뉴에서 '+ 새 시험'을 누르면 그 유형이 미리 골라져 있다
  const preset = params.get("type");
  const initialType: ExamType =
    preset && preset in EXAM_TYPE_LABELS ? (preset as ExamType) : "monthly";

  const [type, setType] = useState<ExamType>(initialType);
  // 국영수 모의고사는 과목마다 시험지가 달라 답안지를 따로 만든다
  const [mockSubject, setMockSubject] = useState<MockSubject>("english");
  const [numQuestions, setNumQuestions] = useState(
    initialType === "mock"
      ? MOCK_SUBJECTS.find((s) => s.value === "english")!.questions
      : TYPE_DEFAULTS[initialType].q,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function onType(next: ExamType) {
    setType(next);
    setNumQuestions(
      next === "mock" ? subjectDefaults(mockSubject).questions : TYPE_DEFAULTS[next].q,
    );
  }

  function onMockSubject(next: MockSubject) {
    setMockSubject(next);
    setNumQuestions(subjectDefaults(next).questions);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(event.currentTarget);
    const payload = {
      examType: type,
      title: String(fd.get("title") || "").trim(),
      subject: String(fd.get("subject") || ""),
      examDate: String(fd.get("examDate") || ""),
      numQuestions: Number(fd.get("numQuestions")),
      numChoices: Number(fd.get("numChoices")),
      // 학원 전체가 출결번호 5자리를 쓴다 — 화면에서 고르지 않는다.
      idDigits: FIXED_ID_DIGITS,
      omrStyle: String(fd.get("omrStyle") || "exam"),
      perColumn: Number(fd.get("perColumn")) || undefined,
      sheetTitle: String(fd.get("sheetTitle") || "").trim(),
      essayCount: Number(fd.get("essayCount")) || 0,
      period: String(fd.get("period") || ""),
      subjectLabel: String(fd.get("subjectLabel") || ""),
      useTeacherComment: fd.get("useTeacherComment") === "on",
    };
    try {
      const res = await fetch("/api/admin/omr/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "시험을 만들지 못했습니다.");
      router.push(`/admin/omr?type=${type}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "시험 생성 중 오류가 발생했습니다.");
      setLoading(false);
    }
  }

  const isMock = type === "mock";
  const subjectDefault = subjectDefaults(mockSubject);
  const defaults = isMock
    ? { q: subjectDefault.questions, subjectLabel: subjectDefault.subjectLabel, period: subjectDefault.period }
    : TYPE_DEFAULTS[type];
  const fixedCount = !USER_QUESTION_COUNT[type];
  const sheetTitleDefault = defaultSheetTitle(type);
  // '15 · 15 · 15' 처럼 열이 어떻게 나뉘는지 그대로 보여 준다 — 숫자 하나만
  // 적혀 있으면 마지막 열이 휑해지는지 아닌지 알 수 없다.
  const columnSplit = (() => {
    const per = defaultPerColumn(type);
    const sizes: number[] = [];
    for (let left = numQuestions; left > 0; left -= per) sizes.push(Math.min(per, left));
    return sizes.join(" · ") + `  (${sizes.length}열)`;
  })();

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div className="brand-lockup">
          <div>
            <strong>새 시험 만들기</strong>
            <span>OMR 답안지 · 성적표</span>
          </div>
        </div>
        <Link className="button ghost" href="/admin/omr">← 목록</Link>
      </header>

      <form className="panel upload-form" onSubmit={submit}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">NEW EXAM</p>
            <h2>시험 정보</h2>
            <p className="subtle">답안지 구성과 성적표 유형이 여기서 결정됩니다.</p>
          </div>
        </div>

        {error ? <p className="form-error block">{error}</p> : null}

        <label>
          <span>시험 유형</span>
          <select value={type} onChange={(e) => onType(e.target.value as ExamType)}>
            {(Object.keys(EXAM_TYPE_LABELS) as ExamType[]).map((key) => (
              <option key={key} value={key}>{EXAM_TYPE_LABELS[key]}</option>
            ))}
          </select>
        </label>

        {isMock ? (
          <label>
            <span>과목 * (국어 · 영어 · 수학은 답안지를 각각 따로 만듭니다)</span>
            <select value={mockSubject} onChange={(e) => onMockSubject(e.target.value as MockSubject)}>
              {MOCK_SUBJECTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label} — {s.questions}문항 · {s.period}교시
                </option>
              ))}
            </select>
            <small className="hint">
              한 회차를 다 치르려면 국어 · 영어 · 수학 시험을 각각 만들어 답안지를 3종 출력하세요.
            </small>
          </label>
        ) : null}

        <label>
          <span>시험 제목 *</span>
          <input
            name="title"
            required
            placeholder={isMock ? `예: 3월 전국 모의고사 · ${subjectDefault.label}` : "예: 4월 월말평가 · 영어"}
          />
          <small className="hint">목록과 성적표에 쓰는 이름입니다. 회차를 알아볼 수 있게 적어 주세요.</small>
        </label>

        {/*
          답안지 제목을 시험 제목과 나눠 둔 이유 — 토요모의고사처럼 미리 뽑아
          두고 몇 주에 걸쳐 쓰는 답안지가 있기 때문이다. 목록에서 찾으려면 시험
          제목에 '9월 11일'을 적어야 하지만, 그 날짜가 종이에 찍히면 다음 주에
          그 종이를 못 쓴다.
        */}
        <label>
          <span>답안지 제목</span>
          <input
            // 유형을 바꾸면 그 유형의 기본값으로 다시 채워지도록 key를 묶는다
            key={`sheet-title-${type}`}
            name="sheetTitle"
            defaultValue={sheetTitleDefault}
            placeholder="비우면 시험 제목이 그대로 찍힙니다"
          />
          <small className="hint">
            {sheetTitleDefault
              ? "답안지를 미리 넉넉히 뽑아 두고 여러 회차에 나눠 쓸 수 있도록, 날짜가 없는 이름을 기본값으로 넣었습니다. 바꾸셔도 됩니다."
              : "종이에 찍히는 제목입니다. 비워 두면 위의 시험 제목을 그대로 씁니다."}
          </small>
        </label>

        <div className="form-row">
          <label>
            <span>문항 수{fixedCount ? " (유형 고정)" : ""}</span>
            <input
              name="numQuestions"
              type="number"
              min={1}
              max={120}
              value={numQuestions}
              onChange={(e) => setNumQuestions(Number(e.target.value))}
              readOnly={fixedCount}
            />
          </label>
          <label>
            <span>보기 수</span>
            <input name="numChoices" type="number" min={2} max={8} defaultValue={5} />
          </label>
        </div>

        <div className="form-row">
          {/*
            수험번호는 학생 출결번호이고 학원 전체가 5자리로 쓴다. 시험마다
            다르게 정할 수 있게 두면, 같은 학생의 번호가 시험마다 다른 자리수로
            찍혀 성적표를 학생과 이어 붙이지 못한다. 그래서 고정한다.
          */}
          <label className="fixed-field">
            <span>수험번호 자리수</span>
            <strong>5자리 (학생 출결번호)</strong>
          </label>
          <label>
            <span>문항 열당 개수</span>
            <input
              // 유형을 바꾸면 그 유형의 기본값으로 다시 채워진다
              key={`per-column-${type}`}
              name="perColumn"
              type="number"
              min={5}
              max={30}
              defaultValue={defaultPerColumn(type)}
            />
            <small className="hint">
              한 열에 담는 문항 수입니다. {numQuestions}문항을 {defaultPerColumn(type)}개씩 나누면{" "}
              {columnSplit}이 됩니다.
            </small>
          </label>
        </div>

        <div className="form-row">
          <label>
            <span>서술형(주관식) 문항 수</span>
            <input name="essayCount" type="number" min={0} max={20} defaultValue={0} />
            <small className="hint">0이면 객관식만. 1 이상이면 답안지 오른쪽에 손기입 칸이 추가됩니다.</small>
          </label>
        </div>

        <div className="form-row">
          <label>
            <span>답안지 스타일</span>
            <input type="hidden" name="omrStyle" value="exam" />
            <input value="수능형(가로) · 고정" readOnly disabled />
          </label>
          <label>
            <span>시험일</span>
            <input name="examDate" type="date" />
          </label>
        </div>

        <div className="form-row">
          <label>
            <span>교시(선택)</span>
            <input key={`p-${type}-${mockSubject}`} name="period" defaultValue={defaults.period} placeholder="예: 3" />
          </label>
          <label>
            <span>영역 표기(선택)</span>
            <input
              key={`s-${type}-${mockSubject}`}
              name="subjectLabel"
              defaultValue={defaults.subjectLabel}
              placeholder="예: 영어 영역"
            />
          </label>
        </div>

        {isMock ? (
          <input type="hidden" name="subject" value={mockSubject} />
        ) : (
          <label>
            <span>과목(선택)</span>
            <input name="subject" placeholder="예: english" />
          </label>
        )}

        <label className="checkbox-row">
          <input type="checkbox" name="useTeacherComment" />
          <span>담임 의견 사용 (성적표에 담임 코멘트 포함)</span>
        </label>

        <button className="button primary full" type="submit" disabled={loading}>
          {loading ? "생성 중…" : "시험 만들기"}
        </button>
      </form>
    </div>
  );
}
