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
    id: "2026-10-28-report-refresh",
    date: "2026-10-28",
    title: "스캔을 나눠서 할 때 성적표는 이렇게 됩니다",
    items: [
      {
        heading: "나중에 검수한 답안은 성적표에 저절로 반영되지 않습니다",
        body:
          "성적표는 만든 순간의 답안으로 평균·석차·표준점수·정답률을 계산해 저장해 둔 것입니다. 1차 스캔으로 성적표를 만든 뒤 2차 스캔을 검수해도, 먼저 만든 성적표의 평균과 석차는 그대로 남습니다.",
      },
      {
        heading: "‘성적표 생성’을 다시 누르면 한 번에 맞춰집니다",
        body:
          "새 학생의 성적표는 새로 만들고, 먼저 만든 성적표는 제자리에서 새 평균·석차로 갱신합니다(버튼에 ‘새로 n장 · 갱신 m장’으로 미리 보입니다). 링크·담임 의견·발송 기록은 그대로입니다. 학생 본인의 점수와 정오는 바뀌지 않습니다.",
      },
      {
        heading: "이미 보낸 링크는 열 때마다 최신 내용을 보여 줍니다",
        body:
          "갱신한 뒤에는 다시 보낼 필요가 없습니다. 다만 갱신 전에 이미 열어 본 학부모는 예전 숫자를 본 것이므로, 발송 뒤에 크게 바뀌는 상황은 피해 주세요.",
      },
      {
        heading: "권장 순서",
        body:
          "성적표 생성과 발송은 마지막 스캔의 검수가 끝난 뒤에 하는 것이 가장 깔끔합니다. 부득이 먼저 만들었다면 마지막 배치 검수 뒤 ‘성적표 갱신’을 한 번 눌러 모든 학생의 성적표를 같은 기준으로 맞춰 주세요.",
        href: "/guide#reports",
        linkLabel: "가이드의 성적표 생성 단계 보기",
      },
    ],
  },
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
