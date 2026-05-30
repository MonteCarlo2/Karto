import {
  getNormalizedOpenRouterApiKey,
  getOpenRouterRequestHeaders,
} from "@/lib/openrouter-headers";
import {
  buildAutoReplyPrompt,
  buildAutoReplyReviewPrompt,
  type GenerateReplyRequest,
} from "@/lib/auto-replies/reply-generation";
import {
  resolveAutoReplyReviewModel,
  resolveAutoReplyWriterModel,
} from "@/lib/auto-replies/ai-models";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 45_000;

export type AutoReplyPipelineStage = "dual" | "writer-only" | "local";

export function getAutoReplyWriterModel(): string {
  return resolveAutoReplyWriterModel();
}

export function getAutoReplyReviewModel(): string {
  return resolveAutoReplyReviewModel();
}

import { sanitizeAddressFormLeaks, containsForeignScript } from "@/lib/auto-replies/reply-postprocess";

function sanitizeModelOutput(text: string): string {
  return sanitizeAddressFormLeaks(
    text
      .replace(/^```[\w]*\n?/i, "")
      .replace(/\n?```$/i, "")
      .replace(/^["']|["']$/g, "")
      .trim()
  );
}

async function callOpenRouterChat(params: {
  model: string;
  system: string;
  user: string;
  temperature: number;
  maxTokens: number;
  title: string;
}): Promise<string> {
  const key = getNormalizedOpenRouterApiKey();
  if (!key) throw new Error("OPENROUTER_API_KEY не настроен");

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: getOpenRouterRequestHeaders(params.title),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      model: params.model,
      messages: [
        { role: "system", content: params.system },
        { role: "user", content: params.user },
      ],
      temperature: params.temperature,
      max_tokens: params.maxTokens,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`OpenRouter ${response.status}: ${errText.slice(0, 240)}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string | { text?: string }[] } }[];
  };

  let content = data?.choices?.[0]?.message?.content;
  if (Array.isArray(content)) {
    content = content
      .map((part) => (typeof part === "string" ? part : part?.text ?? ""))
      .join("");
  }

  const text = sanitizeModelOutput(String(content ?? ""));
  if (!text) throw new Error("Пустой ответ модели");
  return text;
}

/** Первая модель — черновик ответа. */
export async function generateAutoReplyDraftViaOpenRouter(
  input: GenerateReplyRequest
): Promise<string> {
  const { system, user } = buildAutoReplyPrompt(input);
  return callOpenRouterChat({
    model: getAutoReplyWriterModel(),
    system,
    user,
    temperature: input.revisionHint ? 0.5 : 0.65,
    maxTokens: 900,
    title: "KARTO Auto-Replies Writer",
  });
}

/** Вторая модель — проверка черновика и точечные правки. */
export async function reviewAutoReplyViaOpenRouter(
  input: GenerateReplyRequest,
  draftReply: string
): Promise<string> {
  const { system, user } = buildAutoReplyReviewPrompt(input, draftReply);
  return callOpenRouterChat({
    model: getAutoReplyReviewModel(),
    system,
    user,
    temperature: 0.25,
    maxTokens: 900,
    title: "KARTO Auto-Replies Review",
  });
}

function wordOverlapRatio(original: string, revised: string): number {
  const wordsA = new Set(
    original
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
      .filter((w) => w.length > 2)
  );
  const wordsB = revised
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((w) => w.length > 2);

  if (wordsB.length === 0) return 0;
  let shared = 0;
  for (const word of wordsB) {
    if (wordsA.has(word)) shared += 1;
  }
  return shared / wordsB.length;
}

/** Если ревьюер переписал слишком сильно — оставляем черновик первой модели. */
export function pickReviewedReply(draft: string, reviewed: string): string {
  const a = draft.trim();
  const b = reviewed.trim();
  if (!b) return a;
  if (a === b) return a;
  if (containsForeignScript(b) && !containsForeignScript(a)) return a;
  if (containsForeignScript(b) && containsForeignScript(a)) return a;

  const lenRatio = b.length / Math.max(a.length, 1);
  if (lenRatio < 0.45 || lenRatio > 1.85) return a;

  const overlap = wordOverlapRatio(a, b);
  if (overlap < 0.32) return a;

  return b;
}

/** Две модели подряд: генерация → проверка. При сбое ревью — черновик первой модели. */
export async function generateAutoReplyViaOpenRouter(
  input: GenerateReplyRequest
): Promise<{ reply: string; stage: AutoReplyPipelineStage }> {
  const draft = await generateAutoReplyDraftViaOpenRouter(input);

  try {
    const reviewed = await reviewAutoReplyViaOpenRouter(input, draft);
    return {
      reply: pickReviewedReply(draft, reviewed),
      stage: "dual",
    };
  } catch (e) {
    console.warn("[openrouter-auto-reply] Review stage fallback to draft:", e);
    return { reply: draft, stage: "writer-only" };
  }
}
