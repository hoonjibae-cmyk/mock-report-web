/**
 * 두 글의 차이 — 검수 중 고친 내역을 "어디를 고쳤는지"로 보여 주기 위한 것.
 *
 * 앞 문장을 통째로 지우고 뒷 문장을 통째로 새로 적은 것처럼 보이면, 500자 총평에서
 * 띄어쓰기 하나 고친 것을 사람이 찾을 수 없다. 글자 단위로 견주어 같은 부분은
 * 그대로 두고 지운 글자·넣은 글자만 표시한다.
 *
 * 앞뒤로 같은 부분을 먼저 잘라내므로 보통의 수정(몇 글자)은 순식간에 끝난다.
 * 중간 부분이 너무 길면(두 글 모두 통째로 바뀐 경우) 글자 단위 비교를 포기하고
 * 중간을 통째로 바뀐 것으로 본다 — 그때는 어차피 "다 바뀌었다"가 답이다.
 */

export interface DiffOp {
  type: "same" | "del" | "ins";
  text: string;
}

/** 이보다 크면 글자 단위 비교를 하지 않는다 (n × m) */
const MAX_CELLS = 2_000_000;

function push(ops: DiffOp[], type: DiffOp["type"], text: string) {
  if (!text) return;
  const last = ops[ops.length - 1];
  if (last && last.type === type) last.text += text;
  else ops.push({ type, text });
}

/** 글자(코드포인트) 단위 차이. 결과는 앞에서부터 순서대로 읽으면 두 글이 모두 복원된다 */
export function diffChars(before: string, after: string): DiffOp[] {
  const a = Array.from(before);
  const b = Array.from(after);

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const ops: DiffOp[] = [];
  push(ops, "same", a.slice(0, start).join(""));

  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  if (midA.length === 0 || midB.length === 0 || midA.length * midB.length > MAX_CELLS) {
    push(ops, "del", midA.join(""));
    push(ops, "ins", midB.join(""));
  } else {
    // 최장 공통 부분열(LCS) — 표를 채우고 뒤에서부터 거슬러 올라온다
    const n = midA.length;
    const m = midB.length;
    const w = m + 1;
    const table = new Uint16Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        table[i * w + j] =
          midA[i] === midB[j]
            ? table[(i + 1) * w + j + 1] + 1
            : Math.max(table[(i + 1) * w + j], table[i * w + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (midA[i] === midB[j]) {
        push(ops, "same", midA[i]);
        i++;
        j++;
      } else if (table[(i + 1) * w + j] >= table[i * w + j + 1]) {
        push(ops, "del", midA[i]);
        i++;
      } else {
        push(ops, "ins", midB[j]);
        j++;
      }
    }
    push(ops, "del", midA.slice(i).join(""));
    push(ops, "ins", midB.slice(j).join(""));
  }

  push(ops, "same", a.slice(endA).join(""));
  return ops;
}

/**
 * 슬랙 한 줄용 — 바뀐 자리 앞뒤 몇 글자만 보여 준다.
 *
 *   “…학습이 꾸준 합니다.” → “…학습이 꾸준합니다.”
 *
 * 바뀐 곳이 여기저기 흩어져 있으면 첫 번째 자리만 보이고 "외 n곳"을 붙인다.
 */
export function describeChange(before: string, after: string, context = 12, max = 80): string {
  const ops = diffChars(before, after);
  const changed = ops.map((op, i) => (op.type === "same" ? -1 : i)).filter((i) => i >= 0);
  if (changed.length === 0) return `“${squash(before, max)}” → “${squash(after, max)}”`;

  const render = (from: number, to: number): { b: string; a: string; cutHead: boolean; cutTail: boolean } => {
    const head = ops.slice(0, from).map((o) => o.text).join("");
    const tail = ops.slice(to + 1).map((o) => o.text).join("");
    // 지운 것·넣은 것 양쪽에 같은 앞뒤 문맥을 붙인다(문맥은 같은 글자이므로 어느 쪽 글이든 같다)
    const headCtx = Array.from(head).slice(-context).join("");
    const tailCtx = Array.from(tail).slice(0, context).join("");
    const mid = ops.slice(from, to + 1);
    const b = headCtx + mid.filter((o) => o.type !== "ins").map((o) => o.text).join("") + tailCtx;
    const a = headCtx + mid.filter((o) => o.type !== "del").map((o) => o.text).join("") + tailCtx;
    return { b, a, cutHead: Array.from(head).length > context, cutTail: Array.from(tail).length > context };
  };

  let from = changed[0];
  let to = changed[changed.length - 1];
  let extra = 0;
  let r = render(from, to);
  if (Array.from(r.b).length > max || Array.from(r.a).length > max) {
    // 흩어진 수정 — 첫 번째 자리(지움+넣음이 붙어 있으면 둘 다)만 보인다
    to = from;
    if (ops[from + 1] && ops[from + 1].type !== "same") to = from + 1;
    extra = countHunks(ops) - 1;
    r = render(from, to);
  }
  const wrap = (s: string) => `“${r.cutHead ? "…" : ""}${squash(s, max)}${r.cutTail ? "…" : ""}”`;
  return `${wrap(r.b)} → ${wrap(r.a)}${extra > 0 ? ` 외 ${extra}곳` : ""}`;
}

/** 서로 떨어진 수정 자리의 수 — 지움과 넣음이 붙어 있으면 한 자리 */
function countHunks(ops: readonly DiffOp[]): number {
  let n = 0;
  let inHunk = false;
  for (const op of ops) {
    if (op.type === "same") inHunk = false;
    else if (!inHunk) {
      n++;
      inHunk = true;
    }
  }
  return n;
}

function squash(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ");
  const chars = Array.from(t);
  return chars.length > max ? `${chars.slice(0, max).join("")}…` : t;
}
