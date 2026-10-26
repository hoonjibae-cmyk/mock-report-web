// 새 기능 안내 팝업 — 관리자 화면에 들어오면 한 번 띄운다.
//
// '확인'은 이번 브라우저 세션 동안만 닫고(다음에 다시 들어오면 또 보인다),
// '다시 보지 않기'는 이 브라우저에서 영영 닫는다. 둘 다 브라우저 저장소라 기기가
// 바뀌면 다시 보일 수 있다 — 안내는 그래도 되는 정보다.
//
// 새 안내를 띄우려면 ANNOUNCEMENTS 맨 앞에 항목을 더하고 id를 새로 짓는다.
// 가장 최근(date) 것 하나만 보인다.

export interface AnnouncementItem {
  heading: string;
  body: string;
  href?: string;
  linkLabel?: string;
}

export interface Announcement {
  /** 저장소에 남는 열쇠 — 날짜와 내용으로 짓는다. 같은 id는 다시 띄우지 않는다 */
  id: string;
  /** YYYY-MM-DD */
  date: string;
  title: string;
  items: AnnouncementItem[];
}

export const ANNOUNCEMENTS: Announcement[] = [
  {
    id: "2026-10-26-student-history",
    date: "2026-10-26",
    title: "새로 생긴 기능을 안내해 드립니다",
    items: [
      {
        heading: "‘학생별 이력’ 메뉴가 생겼습니다",
        body:
          "왼쪽 메뉴의 ‘학생별 이력’에서 학생 이름이나 수험번호로 찾으면, 그 학생이 OMR 리포트로 본 시험이 담임이 바뀌기 전 것까지 유형별로 모두 나옵니다. 성적 추이 그래프가 붙고, 시험 제목을 누르면 성적표가 PIN 없이 열립니다. 담임 선생님은 제 학생을, 총괄은 모든 학생을 찾을 수 있습니다.",
        href: "/admin/students",
        linkLabel: "학생별 이력 열어 보기",
      },
      {
        heading: "사용 가이드에 ‘발송 전 성적표 미리 확인하기’가 추가되었습니다",
        body:
          "학부모에게 보내기 전에 결과 요약에서 학생 이름을 눌러 실제 성적표를 확인하는 방법을 화면 캡처와 함께 정리했습니다. 직원 계정은 PIN 없이 바로 열립니다.",
        href: "/guide#preview",
        linkLabel: "가이드에서 보기",
      },
    ],
  },
];

/** 브라우저 저장소 열쇠 */
export const DISMISSED_KEY = "ys_announce_dismissed";
export const SEEN_KEY = "ys_announce_seen";

/** 저장소의 JSON 문자열 → id 목록. 깨져 있으면 빈 목록 */
export function parseIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/** 지금 띄울 안내 — 가장 최근 것 중 닫지 않은 것. 없으면 null */
export function pickAnnouncement(
  dismissed: readonly string[],
  seen: readonly string[],
  list: readonly Announcement[] = ANNOUNCEMENTS,
): Announcement | null {
  const latest = [...list].sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!latest) return null;
  if (dismissed.includes(latest.id) || seen.includes(latest.id)) return null;
  return latest;
}
