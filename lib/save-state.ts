/**
 * 저장 상태 표시 — "지금 화면의 내용이 서버에 있는가"를 한 칩으로.
 *
 * 저장 버튼을 눌렀는데 아무 반응이 없으면 사람은 두 번 누르거나 저장된 줄 알고
 * 떠난다. 그래서 버튼 옆에 늘 상태를 적는다: 저장 중 / 저장 실패 / 저장 안 된
 * 변경 있음 / 몇 시에 저장됨 / 변경 없음. 우선순위는 위에서 아래다 — 실패는
 * 그 뒤에 고쳤더라도 다시 저장할 때까지 보여야 한다.
 */
export interface LastSave {
  ok: boolean;
  /** "14:02" */
  at: string;
  /** 성공·실패 설명 */
  text: string;
}

export type SaveState =
  | { kind: "saving"; label: string }
  | { kind: "failed"; label: string }
  | { kind: "dirty"; label: string }
  | { kind: "saved"; label: string }
  | { kind: "clean"; label: string };

export function saveStateOf(input: { saving: boolean; dirty: boolean; lastSave: LastSave | null }): SaveState {
  if (input.saving) return { kind: "saving", label: "저장 중…" };
  if (input.lastSave && !input.lastSave.ok) return { kind: "failed", label: `저장 실패 — ${input.lastSave.text}` };
  if (input.dirty) return { kind: "dirty", label: "저장되지 않은 변경이 있습니다" };
  if (input.lastSave) return { kind: "saved", label: `${input.lastSave.at} 저장됨 · ${input.lastSave.text}` };
  return { kind: "clean", label: "변경 없음" };
}

/** "14:02" — 저장 시각 표기 */
export function clockLabel(date: Date = new Date()): string {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
