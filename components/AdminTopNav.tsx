"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import AcademyLogo from "@/components/AcademyLogo";

export interface NavUser {
  username: string;
  displayName: string;
  role: "admin" | "user";
}

const TABS: Array<{ href: string; label: string; exact?: boolean; adminOnly?: boolean }> = [
  { href: "/admin", label: "홈", exact: true },
  { href: "/admin/omr", label: "OMR 시험" },
  { href: "/admin/mock", label: "국영수 모의고사" },
  { href: "/admin/reports", label: "웹 리포트" },
  { href: "/admin/users", label: "계정 관리", adminOnly: true },
];

/** 관리자 화면 공용 상단 헤더 + 탭 내비게이션 */
export default function AdminTopNav({ user }: { user: NavUser }) {
  const router = useRouter();
  const pathname = usePathname();

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <>
      <header className="admin-header">
        <div className="brand-lockup">
          <AcademyLogo />
          <div>
            <strong>OMR 리포트</strong>
            <span>목동유쌤영어학원 · {user.role === "admin" ? "관리자" : "일반 사용자"}</span>
          </div>
        </div>
        <div className="account-summary">
          <div>
            <strong>{user.displayName}</strong>
            <span>{user.username}</span>
          </div>
          <button className="button ghost" onClick={logout}>로그아웃</button>
        </div>
      </header>

      <nav className="admin-tabs">
        {TABS.filter((tab) => !tab.adminOnly || user.role === "admin").map((tab) => {
          const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
          return (
            <Link key={tab.href} href={tab.href} className={active ? "active" : ""}>
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
