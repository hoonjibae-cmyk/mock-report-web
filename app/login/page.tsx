import { redirect } from "next/navigation";
import AcademyLogo from "@/components/AcademyLogo";
import LoginForm from "@/components/LoginForm";
import { getCurrentUser } from "@/lib/auth";
import { slackLoginConfigured } from "@/lib/slack-auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getCurrentUser()) redirect("/admin");
  const { error } = await searchParams;
  const slackReady = slackLoginConfigured();

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
        <p>
          {slackReady
            ? "학원 슬랙 계정으로 로그인해 주세요."
            : "관리자 또는 등록된 일반 사용자 계정으로 로그인해 주세요."}
        </p>
        <LoginForm slackReady={slackReady} initialError={error ?? ""} />
      </section>
    </main>
  );
}
