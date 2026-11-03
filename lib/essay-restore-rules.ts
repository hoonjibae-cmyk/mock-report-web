/**
 * 보관된 원본으로 손글씨 칸 이미지를 다시 만들 때의 규칙 — 서버 모듈 없이 시험할 수 있게 따로 둔다.
 *
 * 손글씨 칸 이미지는 업로드 때 판독 엔진이 잘라 준 것을 보관함에 넣어 둔다. 그 저장이
 * 실패하면(예전 버전의 한글 파일명 등) 손글씨를 읽을 수 없는데, 원본 스캔이 보관되어
 * 있으면 그 원본을 엔진에 다시 보내 칸 이미지를 새로 받을 수 있다. 수험번호·답안·검수
 * 상태는 건드리지 않고 이미지만 채운다.
 */
import { toChoices, type MarkValue } from "@/lib/omr-answers";

/** 손글씨를 아직 읽지 않았는데 칸 이미지도 없는 문항 — 다시 만들어야 읽을 수 있다 */
export function missingEssayKeys(
  scan: { essayAnswers?: Record<string, string>; essayCrops?: Record<string, string> },
  essayKeys: string[],
): string[] {
  return essayKeys.filter((key) => !(key in (scan.essayAnswers ?? {})) && !scan.essayCrops?.[key]);
}

export interface SheetCheck {
  same: boolean;
  /** 같다고 볼 수 없는 이유(사람이 읽을 말) */
  reason?: string;
}

/** 답안 비교에 필요한 최소 표기 문항 수 — 이보다 적으면 답만으로는 같은 종이인지 모른다 */
const MIN_COMPARED = 5;
/** 같은 종이로 볼 답안 일치율 — 검수 때 몇 문항 고쳤어도 통과하도록 */
const MIN_AGREEMENT = 0.8;

/**
 * 보관된 원본을 다시 읽은 결과가 이 답안지와 같은 종이인가.
 *
 * 예전 버전에서는 같은 이름의 파일이 보관함에서 서로를 덮어썼다. 그런 원본으로 칸
 * 이미지를 만들면 다른 학생의 손글씨가 이 학생에게 붙는다 — 이번에 고치려는 사고와
 * 똑같다. 그래서 업로드 때 읽은 수험번호 마킹과 답안을 다시 읽은 결과와 맞춰 본다.
 *   - 수험번호 마킹이 둘 다 온전한 숫자인데 다르면 다른 종이다.
 *   - 표기한 답이 5문항 이상이면 80% 이상 같아야 한다(검수 때 고친 몇 문항은 봐준다).
 *   - 수험번호가 맞지 않고 비교할 답도 적으면 판단하지 않는다(쓰지 않는다).
 */
export function sameSheet(
  stored: { studentIdBubbles: string | null; answers: Record<string, MarkValue> },
  reread: {
    student_id_bubbles?: string | null;
    answers?: Record<string, number | null>;
    selections?: Record<string, number[]>;
  },
  numQuestions: number,
): SheetCheck {
  const mine = (stored.studentIdBubbles ?? "").trim();
  const theirs = (reread.student_id_bubbles ?? "").trim();
  const complete = (id: string) => /^\d+$/.test(id);
  if (complete(mine) && complete(theirs) && mine !== theirs) {
    return { same: false, reason: `수험번호 마킹이 다릅니다(${mine} · ${theirs})` };
  }
  const idMatch = complete(mine) && complete(theirs) && mine === theirs;

  let compared = 0;
  let equal = 0;
  for (let q = 1; q <= numQuestions; q += 1) {
    const key = String(q);
    const a = [...toChoices(stored.answers?.[key])].sort((x, y) => x - y);
    const b = [...(reread.selections?.[key] ?? toChoices(reread.answers?.[key] ?? null))].sort((x, y) => x - y);
    if (a.length === 0 && b.length === 0) continue;
    compared += 1;
    if (a.length === b.length && a.every((value, i) => value === b[i])) equal += 1;
  }
  if (compared >= MIN_COMPARED && equal / compared < MIN_AGREEMENT) {
    return { same: false, reason: `표기한 답이 많이 다릅니다(${equal}/${compared} 일치)` };
  }
  if (!idMatch && compared < MIN_COMPARED) {
    return { same: false, reason: "같은 답안지인지 확인할 단서가 부족합니다" };
  }
  return { same: true };
}
