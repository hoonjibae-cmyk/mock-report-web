"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  examId: string;
  examDate: string | null;
  canEdit: boolean;
  /** 처음부터 입력칸을 연 채로 — 응시일이 비어 발송 화면이 막힌 자리에서 */
  openByDefault?: boolean;
  onSaved?: (examDate: string | null) => void;
}

/**
 * 시험일 고치기 — 시험을 만든 뒤에도 응시일을 넣거나 바꾼다.
 * 알림톡의 '응시일'과 목록·새로 만드는 성적표의 머리글에 바로 쓰인다.
 */
export default function ExamDateEditor({ examId, examDate, canEdit, openByDefault = false, onSaved }: Props) {
  const router = useRouter();
  const [saved, setSaved] = useState<string | null>(examDate);
  const [open, setOpen] = useState(openByDefault && canEdit);
  const [value, setValue] = useState(examDate ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/admin/omr/exams/${examId}/date`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examDate: value || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "시험일을 저장하지 못했습니다.");
      const next: string | null = data.examDate ?? null;
      setSaved(next);
      setOpen(false);
      setMessage(next ? `시험일을 ${next}로 저장했습니다.` : "시험일을 비웠습니다.");
      onSaved?.(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "시험일을 저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="exam-date-editor">
      <span className="exam-date-current">
        시험일 <strong>{saved ?? "없음"}</strong>
      </span>
      {canEdit && !open ? (
        <button
          type="button"
          className="button tiny ghost"
          onClick={() => {
            setValue(saved ?? "");
            setOpen(true);
            setMessage("");
          }}
        >
          {saved ? "고치기" : "시험일 넣기"}
        </button>
      ) : null}
      {open ? (
        <span className="exam-date-form">
          <input
            type="date"
            value={value}
            aria-label="시험일"
            disabled={busy}
            onChange={(e) => setValue(e.target.value)}
          />
          <button type="button" className="button tiny primary" disabled={busy} onClick={() => void save()}>
            {busy ? "저장 중…" : "저장"}
          </button>
          <button type="button" className="button tiny ghost" disabled={busy} onClick={() => setOpen(false)}>
            취소
          </button>
        </span>
      ) : null}
      {error ? <span className="form-error">{error}</span> : null}
      {message ? <span className="subtle">{message}</span> : null}
    </div>
  );
}
