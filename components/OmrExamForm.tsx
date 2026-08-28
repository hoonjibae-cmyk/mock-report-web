"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  EXAM_TYPE_LABELS,
  MOCK_SUBJECTS,
  USER_QUESTION_COUNT,
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
      idDigits: Number(fd.get("idDigits")),
      omrStyle: String(fd.get("omrStyle") || "exam"),
      perColumn: Number(fd.get("perColumn")) || undefined,
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
          <label>
            <span>수험번호 자리수</span>
            <input name="idDigits" type="number" min={3} max={9} defaultValue={5} />
          </label>
          <label>
            <span>문항 열당 개수</span>
            <input name="perColumn" type="number" min={5} max={30} defaultValue={20} />
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
