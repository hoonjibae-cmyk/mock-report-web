import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loginUrlFor } from "@/lib/login-next";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await getCurrentUser())) {
    // 가려던 곳(proxy.ts 가 적어 둔 경로)을 실어 보낸다 — 로그인하면 거기로 돌아간다
    const requested = (await headers()).get("x-requested-path");
    redirect(loginUrlFor(requested));
  }
  return children;
}
