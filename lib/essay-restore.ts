/**
 * 보관된 원본 스캔으로 손글씨 칸 이미지를 다시 만든다.
 *
 * 업로드 때 손글씨 칸 이미지 저장이 실패한 답안지(예전 버전의 한글 파일명 등)는 손글씨를
 * 읽을 수 없다. 원본 스캔이 보관함에 남아 있으면(보관 7일) 그 원본을 판독 엔진에 다시
 * 보내 칸 이미지를 새로 받는다. 다시 올리면 검수를 처음부터 해야 하지만, 여기서는
 * 수험번호·답안·검수 상태·학생 맞춤을 건드리지 않고 이미지만 채운다.
 *
 * 원본도 보관되지 않았으면(같은 저장 실패) 만들 수 없다 — 그 답안지는 따로 알려 준다.
 */
import { readScans } from "@/lib/omr-api";
import { sheetSpecFor } from "@/lib/omr-exams";
import { downloadScanFile, updateScan, uploadEssayCrop, uploadScanPreview, type OmrScan } from "@/lib/omr-scans";
import type { OmrExam } from "@/lib/omr-types";
import { missingEssayKeys, sameSheet } from "@/lib/essay-restore-rules";
import { hashTag } from "@/lib/scan-identity";
import { rereadGroups } from "@/lib/schedule-read";

export interface RestoreResult {
  /** 손글씨 칸 이미지를 다시 만든 답안지 수 */
  restored: number;
  /** 원본이 보관되어 있지 않아 다시 만들 수 없는 답안지(파일명) */
  noOriginal: string[];
  /** 원본은 있었지만 쓰지 못한 답안지와 그 이유 */
  failed: Array<{ filename: string; reason: string }>;
  /** 시간이 모자라 다음 요청으로 넘긴 답안지 수 */
  pending: number;
}

export const EMPTY_RESTORE: RestoreResult = { restored: 0, noOriginal: [], failed: [], pending: 0 };

function contentTypeFor(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  return "image/jpeg";
}

/**
 * scans 가운데 손글씨를 아직 읽지 않았는데 칸 이미지도 없는 답안지를 원본에서 다시 만든다.
 * deadline(밀리초 시각)을 넘기면 새 원본은 시작하지 않고 pending 으로 남긴다.
 *
 * 원본 파일 하나씩 엔진에 보낸다. 같은 이름의 파일을 한 번에 보내면 엔진의 임시 폴더에서
 * 서로를 덮어쓴다(여러 사람의 스캐너가 같은 이름을 붙인다).
 */
export async function restoreEssayImages(
  exam: OmrExam,
  scans: OmrScan[],
  essayKeys: string[],
  deadline: number,
): Promise<RestoreResult> {
  const result: RestoreResult = { restored: 0, noOriginal: [], failed: [], pending: 0 };
  const targets = scans.filter((scan) => missingEssayKeys(scan, essayKeys).length > 0);
  if (targets.length === 0) return result;

  const { groups, missing } = rereadGroups(targets);
  result.noOriginal = missing;
  const spec = sheetSpecFor(exam);
  const fail = (rows: OmrScan[], reason: string) => {
    for (const scan of rows) result.failed.push({ filename: scan.filename, reason });
  };

  for (const group of groups) {
    const rows = targets.filter((scan) => scan.scanPath === group.path);
    if (Date.now() > deadline) {
      result.pending += rows.length;
      continue;
    }
    const buffer = await downloadScanFile(group.path);
    if (!buffer) {
      fail(rows, "보관된 원본을 찾지 못했습니다(보관 기간 7일이 지났을 수 있습니다)");
      continue;
    }

    let read: Awaited<ReturnType<typeof readScans>>;
    try {
      read = await readScans(
        spec,
        [new File([new Uint8Array(buffer)], group.uploadName, { type: contentTypeFor(group.uploadName) })],
        { essayCrops: true },
      );
    } catch (error) {
      fail(rows, `판독 서버가 원본을 읽지 못했습니다 — ${error instanceof Error ? error.message : "오류"}`);
      continue;
    }

    for (const scan of rows) {
      const fresh = read.results.find((row) => row.filename === scan.filename);
      if (!fresh) {
        fail([scan], "보관된 원본에서 이 쪽을 찾지 못했습니다");
        continue;
      }
      // 예전에는 같은 이름의 파일이 보관함에서 서로를 덮어썼다 — 다른 학생의 원본일 수 있다
      const check = sameSheet(
        { studentIdBubbles: scan.studentIdBubbles, answers: scan.answers },
        fresh,
        exam.numQuestions,
      );
      if (!check.same) {
        fail([scan], `보관된 원본이 이 답안지와 달라 쓰지 않았습니다 — ${check.reason}`);
        continue;
      }

      const tag = hashTag(scan.contentHash);
      const crops = { ...scan.essayCrops };
      let added = 0;
      for (const key of missingEssayKeys(scan, essayKeys)) {
        const base64 = fresh.essay_crops_base64?.[key];
        if (!base64) continue;
        const path = await uploadEssayCrop(exam.id, scan.filename, Number(key), Buffer.from(base64, "base64"), tag);
        if (path) {
          crops[key] = path;
          added += 1;
        }
      }
      // 미리보기도 없었으면 함께 채운다 — 채점 화면에서 답안지 전체를 볼 수 있게
      let previewPath: string | undefined;
      if (!scan.previewPath && fresh.preview_jpeg_base64) {
        previewPath =
          (await uploadScanPreview(exam.id, scan.filename, Buffer.from(fresh.preview_jpeg_base64, "base64"), tag)) ??
          undefined;
      }

      if (added === 0) {
        if (previewPath) await updateScan(scan.id, { previewPath });
        fail([scan], "손글씨 칸 이미지를 다시 저장하지 못했습니다");
        continue;
      }
      await updateScan(scan.id, { essayCrops: crops, ...(previewPath ? { previewPath } : {}) });
      result.restored += 1;
    }
  }
  return result;
}
