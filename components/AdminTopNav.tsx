"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AcademyLogo from "@/components/AcademyLogo";
import { EXAM_TYPE_LABELS, type ExamType } from "@/lib/omr-types";
import { APP_VERSION } from "@/lib/version";

export interface NavUser {
  username: string;
  displayName: string;
  role: "admin" | "user";
}

/** 'OMR 시험' 하위에 펼쳐지는 시험 유형 순서 */
const EXAM_TYPE_ORDER: ExamType[] = ["mock", "saturday", "monthly", "placement", "inclass"];

interface Tab {
  href: string;
  label: string;
  exact?: boolean;
  adminOnly?: boolean;
  /** 이 경로에 있을 때도 상위 항목을 활성·펼침으로 본다 */
  alsoUnder?: string[];
  children?: Array<{ href: string; label: string; type?: ExamType }>;
}

const TABS: Tab[] = [
  { href: "/admin", label: "홈", exact: true },
  {
    href: "/admin/omr",
    label: "OMR 시험",
    // 국영수 엑셀 업로드도 이제 'OMR 시험 > 국영수 모의고사' 아래에 속한다
    alsoUnder: ["/admin/mock"],
    children: [
      { href: "/admin/omr", label: "전체" },
      ...EXAM_TYPE_ORDER.map((type) => ({
        href: `/admin/omr?type=${type}`,
        label: EXAM_TYPE_LABELS[type],
        type,
      })),
    ],
  },
  {
    href: "/admin/reports",
    label: "웹 리포트",
    children: [
      { href: "/admin/reports", label: "전체" },
      ...EXAM_TYPE_ORDER.map((type) => ({
        href: `/admin/reports?type=${type}`,
        label: EXAM_TYPE_LABELS[type],
        type,
      })),
    ],
  },
  { href: "/admin/users", label: "계정 관리", adminOnly: true },
  { href: "/admin/settings", label: "설정", adminOnly: true },
];

/** 관리자 화면 공용 헤더 + 좌측 메뉴 */
export default function AdminTopNav({ user }: { user: NavUser }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const activeType = params.get("type");

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  /** 지금 이 영역 안에 있는가(하위 메뉴를 펼칠지 판단) */
  function isOpen(tab: Tab): boolean {
    if (pathname.startsWith(tab.href)) return true;
    return (tab.alsoUnder ?? []).some((prefix) => pathname.startsWith(prefix));
  }

  return (
    <>
      <header className="admin-header">
        <div className="brand-lockup">
          <AcademyLogo />
          <div>
            <strong>OMR 리포트</strong>
            <span>
              목동유쌤영어학원 · {user.role === "admin" ? "관리자" : "일반 사용자"} · v{APP_VERSION}
            </span>
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

      {/* 좌측 세로 메뉴. 좁은 화면에서는 CSS가 다시 가로 탭으로 되돌린다. */}
      <nav className="admin-side" aria-label="관리자 메뉴">
        <p className="eyebrow">MENU</p>
        {TABS.filter((tab) => !tab.adminOnly || user.role === "admin").map((tab) => {
          const open = isOpen(tab);
          const active = tab.exact ? pathname === tab.href : open;
          return (
            <div key={tab.href} className="admin-side-group">
              <Link
                href={tab.href}
                className={active ? "active" : ""}
                aria-current={active ? "page" : undefined}
              >
                {tab.label}
              </Link>
              {/* 해당 영역에 들어와 있을 때만 시험 유형을 펼친다 */}
              {tab.children && open ? (
                <div className="admin-subnav">
                  {tab.children.map((child) => {
                    // '전체'는 type 파라미터가 없을 때만 활성
                    const on = child.type ? activeType === child.type : !activeType;
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={on ? "active" : ""}
                        aria-current={on ? "page" : undefined}
                      >
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>
    </>
  );
}
