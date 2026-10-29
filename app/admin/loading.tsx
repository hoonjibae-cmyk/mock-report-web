import { Suspense } from "react";
import AdminTopNav from "@/components/AdminTopNav";

/**
 * 관리자 화면의 로딩 뼈대 — 메뉴를 누르자마자 보인다.
 *
 * 관리자 페이지는 모두 서버에서 자료를 모은 뒤 그려지는데, 그동안 아무것도
 * 보이지 않으면 눌린 건지 알 수 없다. 이 뼈대가 있으면 Next가 메뉴 링크를
 * 미리 받아 두었다가 누르는 순간 바로 바꿔 보이고, 자료가 오면 그 자리에 채운다.
 * 메뉴는 실제 것과 같은 모양으로 두되 계정 칸과 관리자 전용 항목은 비워 둔다.
 */
export default function AdminLoading() {
  return (
    <div className="admin-shell">
      <Suspense fallback={null}>
        <AdminTopNav skeleton />
      </Suspense>
      <section className="panel admin-skeleton" aria-busy="true" aria-live="polite">
        <div className="skeleton-line w30" />
        <div className="skeleton-line w60" />
        <div className="skeleton-block" />
        <div className="skeleton-line w45" />
        <div className="skeleton-line w80" />
        <div className="skeleton-line w70" />
        <p className="subtle">불러오는 중…</p>
      </section>
    </div>
  );
}
