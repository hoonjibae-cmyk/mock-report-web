// 주관식 손글씨 전사 — 잘라낸 답안 칸 이미지를 글자로 옮긴다.
//
// 일반 문서 OCR이 어려운 이유는 "글자가 어디 있는지" 찾는 단계인데, 우리는
// 답안지 네 모서리 마커로 원근을 보정하고 칸 좌표를 알고 있어 그 문제가 없다.
// 여기로 오는 이미지는 이미 반듯하게 펴진 답안 칸 하나뿐이다.
//
// 전사는 채점이 아니다. 학생이 쓴 글자를 그대로 옮기기만 하고, 맞고 틀림은
// 판단하지 않는다. 철자 오류를 '고쳐서' 읽으면 채점이 무너지기 때문이다.

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { resolveAiModel, DEFAULT_AI_MODEL, type AiModelId } from "@/lib/ai-models";

const TranscriptSchema = z.object({
  /** 학생이 쓴 그대로. 아무것도 없으면 빈 문자열 */
  text: z.string(),
  /** 글자를 알아보기 어려웠는가 — true면 사람이 반드시 확인해야 한다 */
  unclear: z.boolean(),
});

export interface Transcript {
  text: string;
  unclear: boolean;
}

/**
 * 답안이 어느 글자로 쓰일지.
 *
 * 한글은 초성·중성·종성이 한 블록으로 합쳐지고 구별할 음절이 2,000자를 넘어
 * 영문보다 훨씬 어렵다. 어느 쪽인지 미리 알려 주면 후보가 줄어 오독이 준다.
 *
 * 주의: 여기서 알려 주는 것은 **글자 종류**까지다. 정답 문장 자체를 알려 주면
 * 모델이 그쪽으로 끌려가 틀린 답을 맞은 답으로 읽는다 — 그건 절대 하지 않는다.
 */
export type ExpectedScript = "latin" | "hangul" | "mixed";

/** 정답 문장에서 글자 종류를 추론한다(정답을 입력해 둔 경우에만 쓸 수 있다) */
export function scriptOf(samples: string[]): ExpectedScript | null {
  const text = samples.join(" ");
  const hangul = (text.match(/[가-힣]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  if (hangul === 0 && latin === 0) return null;
  if (hangul === 0) return "latin";
  if (latin === 0) return "hangul";
  return "mixed";
}

const SCRIPT_HINT: Record<ExpectedScript, string> = {
  latin: "이 답안은 영문으로 쓰여 있습니다. 한글로 읽지 마십시오.",
  hangul: "이 답안은 한글로 쓰여 있습니다. 영문으로 읽지 마십시오.",
  mixed: "이 답안에는 영문과 한글이 섞여 있을 수 있습니다.",
};

export class TranscribeNotConfiguredError extends Error {
  constructor() {
    super(
      "OPENAI_API_KEY가 설정되어 있지 않아 주관식 전사를 할 수 없습니다. " +
        "Vercel → Settings → Environment Variables 에서 추가한 뒤 다시 배포해 주세요.",
    );
    this.name = "TranscribeNotConfiguredError";
  }
}

const SYSTEM = `당신은 손으로 쓴 시험 답안을 글자로 옮기는 전사자입니다. 채점자가 아닙니다.

반드시 지킬 원칙:
- 학생이 쓴 그대로 옮깁니다. 철자가 틀렸으면 틀린 그대로, 문법이 어색하면 어색한 그대로 옮깁니다. 절대 고치지 않습니다.
- 고쳐서 옮기면 채점이 무너집니다. 'foward'를 'forward'로 바로잡는 순간 틀린 답이 맞은 답이 됩니다.
- 지우거나 그은 글자는 옮기지 않습니다. 학생이 최종적으로 남긴 것만 옮깁니다.
- 칸이 비어 있으면 text를 빈 문자열로 둡니다.
- 이미지에 인쇄된 문항 번호, 안내 문구('서술 1' 등), 밑줄 안내선은 답안이 아니므로 옮기지 않습니다.
- 글자를 확실히 알아볼 수 없으면 unclear를 true로 둡니다. 추측해서 채워 넣지 말고, 읽히는 만큼만 옮긴 뒤 표시하십시오.
- 여러 줄에 걸쳐 썼으면 한 줄로 이어 붙이되 단어 사이 공백은 유지합니다.`;

/**
 * 답안 칸 이미지 한 장을 전사한다.
 *
 * 실패하면 예외를 던지지 않고 unclear=true인 빈 결과를 돌려준다 — 한 장이
 * 실패했다고 60명 전사가 통째로 멈추면 안 되고, 실패한 것은 어차피 사람이
 * 봐야 하는 대상이기 때문이다.
 */
export async function transcribeEssay(
  jpeg: Buffer,
  hint: { question: number; prompt?: string; script?: ExpectedScript | null } = { question: 0 },
  requestedModel: AiModelId = DEFAULT_AI_MODEL,
): Promise<Transcript> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new TranscribeNotConfiguredError();

  const client = new OpenAI({ apiKey });
  const model = resolveAiModel(requestedModel);
  const dataUrl = `data:image/jpeg;base64,${jpeg.toString("base64")}`;

  try {
    const response = await client.responses.parse({
      model,
      input: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                `${hint.question}번 답안 칸입니다.`,
                hint.script ? SCRIPT_HINT[hint.script] : null,
                "학생이 쓴 글자를 그대로 옮겨 주세요.",
              ]
                .filter(Boolean)
                .join(" "),
            },
            { type: "input_image", image_url: dataUrl, detail: "high" },
          ],
        },
      ],
      text: { format: zodTextFormat(TranscriptSchema, "transcript") },
    });

    const parsed = response.output_parsed;
    if (!parsed) return { text: "", unclear: true };
    return { text: (parsed.text ?? "").trim(), unclear: Boolean(parsed.unclear) };
  } catch (error) {
    console.warn(`주관식 전사 실패(${hint.question}번)`, error);
    return { text: "", unclear: true };
  }
}

/**
 * 여러 장을 전사한다. 한 번에 다 보내면 느리고, 하나씩 보내면 더 느리므로
 * 적당히 나눠 동시에 보낸다.
 */
export async function transcribeMany(
  items: Array<{
    key: string;
    jpeg: Buffer;
    question: number;
    prompt?: string;
    script?: ExpectedScript | null;
  }>,
  requestedModel: AiModelId = DEFAULT_AI_MODEL,
  concurrency = 6,
): Promise<Map<string, Transcript>> {
  const out = new Map<string, Transcript>();
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map((item) =>
        transcribeEssay(
          item.jpeg,
          { question: item.question, prompt: item.prompt, script: item.script },
          requestedModel,
        ),
      ),
    );
    batch.forEach((item, index) => out.set(item.key, results[index]));
  }
  return out;
}
