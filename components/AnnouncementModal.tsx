"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  DISMISSED_KEY,
  SEEN_KEY,
  parseIds,
  pickAnnouncement,
  type Announcement,
} from "@/lib/announcements";

function readIds(storage: Storage | null, key: string): string[] {
  try {
    return parseIds(storage?.getItem(key));
  } catch {
    return [];
  }
}

function remember(storage: Storage | null, key: string, id: string) {
  try {
    const ids = readIds(storage, key);
    if (!ids.includes(id)) storage?.setItem(key, JSON.stringify([...ids, id]));
  } catch {
    // 저장소를 못 쓰는 브라우저(시크릿 창 등)면 이번만 닫는다
  }
}

/**
 * 새 기능 안내 팝업 — 관리자 화면 어디로 들어오든 한 번 띄운다.
 *
 *   확인          이번 브라우저 세션 동안 닫는다(sessionStorage)
 *   다시 보지 않기  이 브라우저에서 영영 닫는다(localStorage)
 *
 * 화면이 그려진 뒤에 저장소를 읽으므로 서버 렌더링과 어긋나지 않는다.
 */
export default function AnnouncementModal() {
  const [open, setOpen] = useState<Announcement | null>(null);
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const local = typeof window !== "undefined" ? window.localStorage : null;
    const session = typeof window !== "undefined" ? window.sessionStorage : null;
    let dismissed: string[] = [];
    let seen: string[] = [];
    try {
      dismissed = readIds(local, DISMISSED_KEY);
      seen = readIds(session, SEEN_KEY);
    } catch {
      // 저장소를 못 읽으면 보여 준다
    }
    setOpen(pickAnnouncement(dismissed, seen));
  }, []);

  useEffect(() => {
    if (!open) return;
    okRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close("seen");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function close(how: "seen" | "dismissed") {
    if (!open) return;
    if (how === "dismissed") remember(window.localStorage, DISMISSED_KEY, open.id);
    else remember(window.sessionStorage, SEEN_KEY, open.id);
    setOpen(null);
  }

  if (!open) return null;

  return (
    <div className="announce-backdrop" onClick={() => close("seen")}>
      <div
        className="announce-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="announce-title"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="eyebrow">WHAT&apos;S NEW · {open.date}</p>
        <h2 id="announce-title">{open.title}</h2>
        <ol className="announce-items">
          {open.items.map((item) => (
            <li key={item.heading}>
              <strong>{item.heading}</strong>
              <p>{item.body}</p>
              {item.href ? (
                <Link href={item.href} className="announce-link" onClick={() => close("seen")}>
                  {item.linkLabel ?? "열어 보기"} →
                </Link>
              ) : null}
            </li>
          ))}
        </ol>
        <div className="announce-actions">
          <button type="button" className="button ghost" onClick={() => close("dismissed")}>
            다시 보지 않기
          </button>
          <button type="button" className="button primary" ref={okRef} onClick={() => close("seen")}>
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
