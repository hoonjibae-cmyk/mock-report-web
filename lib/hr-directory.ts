// 인사 프로그램(HR-Manager) 창구.
//
// 환경변수: HR_API_URL(예: https://hr.yussam.com), HR_API_KEY

import type { HrStaff } from "@/lib/hr-sync";

/** 이 프로그램의 이름 — 인사 쪽 lib/app-access.ts 의 열쇠와 같아야 한다 */
const APP_KEY = "omr-report";

export class HrNotConfiguredError extends Error {
  constructor() {
    super(
      "인사 프로그램 연동이 설정되어 있지 않습니다. " +
        "Vercel → Settings → Environment Variables 에서 HR_API_URL과 HR_API_KEY를 추가한 뒤 " +
        "다시 배포해 주세요.",
    );
    this.name = "HrNotConfiguredError";
  }
}

export function hrConfigured(): boolean {
  return Boolean(process.env.HR_API_URL && process.env.HR_API_KEY);
}

function hrBase(): string {
  const url = process.env.HR_API_URL;
  if (!url || !process.env.HR_API_KEY) throw new HrNotConfiguredError();
  return url.replace(/\/$/, "");
}

function hrHeaders(): Record<string, string> {
  return { "x-api-key": process.env.HR_API_KEY ?? "" };
}

export interface HrStaffResult {
  items: HrStaff[];
  /** 인사 쪽이 어떤 부서를 기준으로 골랐는지 — 명단이 이상할 때 먼저 볼 값 */
  departments: string[];
  updatedAt: string;
}

/**
 * 대상 부서 재직자 명단.
 *
 * 실패하면 예외를 던진다. **빈 명단으로 바꿔 돌려주면 안 된다** — 부르는 쪽이
 * 그것을 '전원 퇴사'로 읽고 모두를 잠글 수 있다(planSync가 한 번 더 막지만,
 * 여기서부터 거짓말을 하지 않는 편이 맞다).
 */
export async function fetchHrStaff(): Promise<HrStaffResult> {
  const res = await fetch(`${hrBase()}/api/directory/app-users?app=${APP_KEY}`, {
    headers: hrHeaders(),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let detail = body.slice(0, 200);
    try {
      const parsed = JSON.parse(body) as { error?: string };
      if (parsed.error) detail = parsed.error;
    } catch {
      // JSON이 아니면 원문을 짧게 쓴다
    }
    throw new Error(`인사 명부를 불러오지 못했습니다 (${res.status}) ${detail}`.trim());
  }

  const data = (await res.json()) as {
    items?: unknown;
    departments?: unknown;
    updatedAt?: unknown;
  };
  const items = Array.isArray(data.items) ? data.items : [];
  return {
    items: items.map((raw) => {
      const row = raw as Record<string, unknown>;
      return {
        empNo: String(row.empNo ?? "").trim(),
        name: String(row.name ?? "").trim(),
        department: String(row.department ?? "").trim(),
        // 인사 쪽이 업무용 구글메일(workEmail)을 email 이름으로 실어 보낸다.
        email: String(row.email ?? "").trim().toLowerCase(),
        role: row.role === "admin" ? "admin" : "user",
        slackLinked: row.slackLinked === true,
      } satisfies HrStaff;
    }).filter((staff) => staff.empNo && staff.name),
    departments: Array.isArray(data.departments) ? data.departments.map(String) : [],
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : new Date().toISOString(),
  };
}

export interface NotifyResult {
  delivered: boolean;
  /** 'no-slack' 이면 아직 슬랙에 가입하지 않은 것 — 다음에 다시 보낸다 */
  reason?: string;
  error?: string;
}

/**
 * 인사 프로그램을 통해 직원에게 슬랙 DM을 보낸다.
 *
 * 슬랙 토큰과 직원 ↔ 슬랙 아이디는 인사 프로그램만 안다. 여기에 또 두면
 * 사람이 슬랙을 새로 만들거나 퇴사할 때마다 두 곳을 맞춰야 한다.
 *
 * 실패해도 예외를 던지지 않는다 — 안내 한 건이 안 갔다고 동기화 전체를
 * 멈출 이유가 없고, 못 보낸 사람은 다음에 다시 시도한다.
 */
export async function notifyStaff(empNo: string, text: string): Promise<NotifyResult> {
  try {
    const res = await fetch(`${hrBase()}/api/slack/notify`, {
      method: "POST",
      headers: { ...hrHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ empNo, text }),
      signal: AbortSignal.timeout(20_000),
    });
    const data = (await res.json().catch(() => ({}))) as NotifyResult;
    return {
      delivered: data.delivered === true,
      reason: data.reason,
      error: data.error,
    };
  } catch (error) {
    return {
      delivered: false,
      reason: "network",
      error: error instanceof Error ? error.message : "슬랙 안내를 보내지 못했습니다.",
    };
  }
}
