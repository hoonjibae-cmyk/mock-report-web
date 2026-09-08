"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  /** 구글 로그인이 이 배포에 설정되어 있는가 */
  googleReady: boolean;
  /** 구글에서 되돌아오며 실려 온 오류 */
  initialError?: string;
}

export default function LoginForm({ googleReady, initialError = "" }: Props) {
  const router = useRouter();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);
  // 직원은 구글로 들어온다. 아이디·비밀번호는 구글이나 인사 연동이 멈췄을 때
  // 쓰는 문이라 평소에는 접어 둔다 — 두 방법을 나란히 놓으면 어느 쪽이 정식인지
  // 흐려지고, 직원이 있지도 않은 비밀번호를 찾게 된다.
  const [showPassword, setShowPassword] = useState(!googleReady);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "로그인에 실패했습니다.");
      router.replace("/admin");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "로그인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  if (!showPassword) {
    return (
      <div className="login-form">
        <a className="button google-login full" href="/api/auth/google/start">
          <span className="google-mark" aria-hidden="true">G</span>
          구글 계정으로 로그인
        </a>
        <p className="login-hint">업무용 구글 계정으로 들어오시면 됩니다. 별도 비밀번호는 없습니다.</p>
        {error ? <p className="form-error">{error}</p> : null}
        <button type="button" className="login-alt" onClick={() => setShowPassword(true)}>
          아이디·비밀번호로 로그인
        </button>
      </div>
    );
  }

  return (
    <form className="login-form" onSubmit={submit}>
      {googleReady ? (
        <button type="button" className="login-alt top" onClick={() => setShowPassword(false)}>
          ← 구글 계정으로 로그인
        </button>
      ) : null}
      <label htmlFor="username">아이디</label>
      <input
        id="username"
        type="text"
        autoComplete="username"
        value={username}
        onChange={(event) => setUsername(event.target.value)}
        placeholder="아이디"
        required
      />
      <label htmlFor="password">비밀번호</label>
      <input
        id="password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="비밀번호"
        required
      />
      {error ? <p className="form-error">{error}</p> : null}
      <button className="button primary full" type="submit" disabled={loading}>
        {loading ? "확인 중…" : "로그인"}
      </button>
    </form>
  );
}
