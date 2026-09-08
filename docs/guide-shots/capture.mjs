import { chromium } from "playwright";

// 어느 화면을, 무엇만 잘라서 찍을지. selector 는 그 단계에서 설명하는 부분만 담는다.
const SHOTS = [
  // 화면 전체(.admin-shell)를 찍되, 긴 화면은 설명에 필요한 윗부분까지만 자른다.
  { s: "overview", out: "overview.png", sel: ".admin-shell" },
  { s: "1",  out: "step-1.png", sel: ".admin-shell" },
  { s: "3",  out: "step-3.png", sel: ".admin-shell", clipRows: 780 },
  { s: "4",  out: "step-4.png", sel: ".admin-shell", clipRows: 620 },
  { s: "5",  out: "step-5.png", sel: ".panel", nth: -1, clipRows: 620 },
  { s: "6",  out: "step-6.png", sel: ".admin-shell", clipRows: 700 },
  { s: "7",  out: "step-7.png", sel: ".admin-shell", clipRows: 760 },
  { s: "8",  out: "step-8.png", sel: ".admin-shell", clipRows: 900 },
  { s: "9",  out: "step-9.png", sel: ".admin-shell", clipRows: 1250 },
];

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });

// 화면에 없는 서버를 부르는 곳은 그럴듯한 답으로 대신한다 — 오류 문구가 사진에 남지 않게.
await page.route("**/api/**", async (route) => {
  const url = route.request().url();
  if (url.includes("/messages")) {
    return route.fulfill({ json: {
      ok: true,
      examTitle: "9월 토요모의고사",
      examDateText: "2026년 9월 12일",
      setup: { messagingConfigured: true, directoryConfigured: true, directoryError: null,
               siteUrl: "https://report.yussam.com", siteUrlReady: true, examDateNotice: null },
      counts: { parent: { ready: 8, alreadySent: 0, blocked: 1 }, student: { ready: 6, alreadySent: 0, blocked: 3 } },
      targets: ["강여울","김하늘","박새롬","이바다","정푸른","최다솜","한소리","윤가온"].map((n, i) => ({
        reportId: `r-${i}`, token: `t${i}`, studentName: n, studentKey: `1030${i+1}`, className: "중2 코어",
        parent: { type: "parent", phoneMasked: "010-****-12" + (34 + i), blocked: i === 7 ? "학부모 연락처가 없습니다" : null, history: null },
        student: { type: "student", phoneMasked: i < 6 ? "010-****-56" + (78 + i) : null, blocked: i < 6 ? null : "학생 연락처가 없습니다", history: null },
      })),
    }});
  }
  if (url.includes("/scans/review")) {
    return route.fulfill({ json: {
      total: 10, reviewed: 8, autoReady: 0, directoryUsed: true,
      needsPerson: [
        { id: "scan-9",  filename: "토요모의고사_스캔_09.jpg",
          reasons: [{ code: "noStudentId", label: "수험번호를 읽지 못했습니다 — 직접 입력해 주세요." }] },
        { id: "scan-10", filename: "토요모의고사_스캔_10.jpg",
          reasons: [{ code: "uncertainQuestions", label: "표기가 흐린 문항이 있습니다.", questions: [12, 27, 33] }] },
      ],
    }});
  }
  if (url.includes("/reports")) {
    // 이름이 이미 채워진 모습으로 — 빨간 빈칸은 '아직 안 한 일'처럼 보여 설명에 방해가 된다
    const suggestions = {};
    ["강여울","김하늘","박새롬","이바다","정푸른","최다솜","한소리","윤가온"].forEach((n, i) => {
      suggestions[`1030${i + 1}`] = { name: n, school: "목운중 2" };
    });
    return route.fulfill({ json: { ok: true, suggestions, existingReports: 8 } });
  }
  if (url.includes("/warmup")) return route.fulfill({ json: { ok: true, ready: true } });
  return route.fulfill({ json: { ok: true } });
});

for (const shot of SHOTS) {
  await page.goto(`http://localhost:3000/shots-tmp?s=${shot.s}`, { waitUntil: "networkidle" });
  // Next 개발 서버가 띄우는 동그란 배지 — 설명서 사진에 남으면 안 된다
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.waitForTimeout(700);
  const path = `public/guide/${shot.out}`;
  if (shot.full) {
    await page.screenshot({ path, fullPage: true });
  } else {
    const all = page.locator(shot.sel);
    const count = await all.count();
    const idx = shot.nth === undefined ? 0 : shot.nth < 0 ? count - 1 : shot.nth;
    const target = all.nth(Math.max(0, Math.min(idx, count - 1)));
    const box = await target.boundingBox();
    if (!box) { console.log(`!! ${shot.out}: 대상을 못 찾음 (${shot.sel}, ${count}개)`); continue; }
    const height = shot.clipRows ? Math.min(box.height, shot.clipRows) : box.height;
    await page.screenshot({ path, clip: { x: box.x, y: box.y, width: box.width, height } });
  }
  console.log(`${shot.out} 저장`);
}
await browser.close();
