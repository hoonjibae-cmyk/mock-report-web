import { redirect } from "next/navigation";
import AcademyLogo from "@/components/AcademyLogo";
import LoginForm from "@/components/LoginForm";
import { getCurrentUser } from "@/lib/auth";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/admin");

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand-lockup centered">
          <AcademyLogo />
          <div>
            <strong>목동유쌤영어학원</strong>
            <span>OMR 리포트</span>
          </div>
        </div>
        <h1>계정 로그인</h1>
        <p>관리자 또는 등록된 일반 사용자 계정으로 로그인해 주세요.</p>
        <LoginForm />
      </section>
    </main>
  );
}
