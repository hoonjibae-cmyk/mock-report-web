"use client";

import { FormEvent, useState } from "react";
import AcademyLogo from "@/components/AcademyLogo";

export default function PinGate({ token, phoneMasked }: { token: string; phoneMasked: string }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function unlock(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/report/${token}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "확인에 실패했습니다.");
      window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "확인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-shell report-gate-shell">
      <section className="login-card report-gate-card">
        <div className="brand-lockup centered">
          <AcademyLogo />
          <div><strong>목동유쌤영어학원</strong><span>개인 성적표</span></div>
        </div>
        <div className="lock-icon">••••</div>
        <h1>보호된 성적표입니다</h1>
        <p>학생 개인정보 보호를 위해 학부모 휴대전화 번호의 마지막 4자리를 입력해 주세요.</p>
        {phoneMasked ? <p className="phone-hint">등록 번호: {phoneMasked}</p> : null}
        <form className="login-form" onSubmit={unlock}>
          <label htmlFor="pin">휴대전화 뒤 4자리</label>
          <input id="pin" type="password" inputMode="numeric" maxLength={4} pattern="[0-9]{4}" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="0000" required />
          {error ? <p className="form-error">{error}</p> : null}
          <button className="button primary full" type="submit" disabled={loading || pin.length !== 4}>{loading ? "확인 중…" : "성적표 열기"}</button>
        </form>
      </section>
    </main>
  );
}
