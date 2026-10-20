import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { getVisibleExam } from "@/lib/exam-access";
import { readScans, type ReadResultRow } from "@/lib/omr-api";
import { sheetSpecFor } from "@/lib/omr-exams";
import { downloadScanFile, listScans, updateScan } from "@/lib/omr-scans";
import { enrollmentOf, preferredSchedule } from "@/lib/placement-policy";
import {
  EMPTY_REREAD_SUMMARY,
  mergeScheduleFlags,
  rereadGroups,
  scheduleRead,
  type RereadSummary,
} from "@/lib/schedule-read";

export const runtime = "nodejs";
export const maxDuration = 300;

/** 한 번의 판독 요청에 넣는 파일 수 — 많이 넣을수록 한 번 끊기면 잃는 것이 크다 */
const READ_BATCH = 10;

function contentTypeFor(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  return "image/jpeg";
}

/** 답안지 QR의 배치 지문이 지금 설정과 다르면 선호 요일 칸 자체가 없는 종이다 */
function layoutMismatch(result: ReadResultRow): boolean {
  const sheet = (result.sheet_layout ?? "").trim();
  const expected = (result.expected_layout ?? "").trim();
  return Boolean(sheet && expected && sheet !== expected);
}

/**
 * 보관된 스캔 원본으로 선호 요일 칸만 다시 읽는다.
 *
 * 판독 결과의 선호 요일은 업로드 때 한 번 저장되고 끝이다. 선호 요일 칸이 생기기
 * 전에 올린 답안지, 판독 서버가 갱신되기 전에 올린 답안지는 그 값이 비어 있는데,
 * 다시 올리면 검수를 처음부터 해야 한다. 여기서는 수험번호·답안·검수 상태는
 * 건드리지 않고 선호 요일 값과 그 판독 플래그만 바꾼다.
 */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApi("createReports");
  if (auth.response) return auth.response;
  const { id } = await context.params;

  try {
    const exam = await getVisibleExam(id);
    if (!exam) return NextResponse.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });
    if (exam.examType !== "placement") {
      return NextResponse.json({ error: "선호 요일 칸은 반배치고사 답안지에만 있습니다." }, { status: 400 });
    }

    const scans = await listScans(id);
    if (scans.length === 0) {
      return NextResponse.json({ error: "다시 읽을 답안지가 없습니다." }, { status: 400 });
    }
    const { groups, missing } = rereadGroups(scans);

    const files: File[] = [];
    const unavailable = [...missing];
    for (const group of groups) {
      const buffer = await downloadScanFile(group.path);
      if (!buffer) {
        unavailable.push(...group.filenames);
        continue;
      }
      files.push(
        new File([new Uint8Array(buffer)], group.uploadName, { type: contentTypeFor(group.uploadName) }),
      );
    }

    const spec = sheetSpecFor(exam);
    const results: ReadResultRow[] = [];
    const problems: string[] = [];
    for (let i = 0; i < files.length; i += READ_BATCH) {
      // 미리보기·주관식 칸 이미지는 받지 않는다 — 선호 요일 칸만 보면 된다
      const read = await readScans(spec, files.slice(i, i + READ_BATCH), { preview: false });
      results.push(...read.results);
      problems.push(...(read.problems ?? []).map((problem) => problem.filename));
    }

    const byFilename = new Map(scans.map((scan) => [scan.filename, scan]));
    const summary: RereadSummary = { ...EMPTY_REREAD_SUMMARY };
    for (const result of results) {
      const scan = byFilename.get(result.filename);
      if (!scan) continue;
      if (layoutMismatch(result)) {
        summary.mismatched += 1;
        continue;
      }
      const value = preferredSchedule(result.preferred_schedule);
      const reviewFlags = mergeScheduleFlags(scan.reviewFlags, result.review_flags ?? []);
      // 재원 구분 칸도 같은 답안지에 있다 — 함께 다시 읽어 둔다
      await updateScan(scan.id, { preferredSchedule: value, enrollment: enrollmentOf(result.enrollment), reviewFlags });
      summary.updated += 1;
      summary[scheduleRead({ preferredSchedule: value, reviewFlags }).kind] += 1;
    }

    return NextResponse.json({
      ok: true,
      scans: await listScans(id),
      summary,
      unavailable,
      problems,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "선호 요일 다시 읽기 오류" },
      { status: 500 },
    );
  }
}
