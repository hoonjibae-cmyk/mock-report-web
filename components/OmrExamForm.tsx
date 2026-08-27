"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { EXAM_TYPE_LABELS, USER_QUESTION_COUNT, type ExamType } from "@/lib/omr-types";

const TYPE_DEFAULTS: Record<ExamType, { q: number; subjectLabel: string; period: string }> = {
  mock: { q: 45, subjectLabel: "영어 영역", period: "3" },
  saturday: { q: 45, subjectLabel: "영어 영역", period: "" },
  monthly: { q: 25, subjectLabel: "", period: "" },
  placement: { q: 30, subjectLabel: "", period: "" },
  inclass: { q: 20, subjectLabel: "", period: "" },
};

export default function OmrExamForm() {
  const router = useRouter();
  const [type, setType] = useState<ExamType>("monthly");
  const [numQuestions, setNumQuestions] = useState(TYPE_DEFAULTS.monthly.q);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function onType(next: ExamType) {
    setType(next);
    setNumQuestions(TYPE_DEFAULTS[next].q);
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
      router.push("/admin/omr");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "시험 생성 중 오류가 발생했습니다.");
      setLoading(false);
    }
  }

  const defaults = TYPE_DEFAULTS[type];
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

        <label>
          <span>시험 제목 *</span>
          <input name="title" required placeholder="예: 4월 월말평가 · 영어" />
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
            <input name="period" defaultValue={defaults.period} placeholder="예: 3" />
          </label>
          <label>
            <span>영역 표기(선택)</span>
            <input name="subjectLabel" defaultValue={defaults.subjectLabel} placeholder="예: 영어 영역" />
          </label>
        </div>

        <label>
          <span>과목(선택)</span>
          <input name="subject" placeholder="예: english" />
        </label>

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
