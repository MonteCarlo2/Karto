import { getNormalizedOpenRouterApiKey, getOpenRouterRequestHeaders } from "@/lib/openrouter-headers";
import { openRouterFetch } from "@/lib/openrouter-fetch";
import { isOpenRouterModelRoutingError } from "@/lib/openrouter-default-models";
import { measureText, textMetricsForPrompt } from "./card-text-metrics";
import { TEXT_SYSTEM_PROMPT } from "./card-text-prompt";
import { applyTextCaps, buildTextResult, parseTextJson, textContentHash, type TextResult } from "./card-text-score";

/** Оценка названия и описания карточки через OpenRouter. Только чтение: ничего в WB не меняется. */

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const TIMEOUT_MS = 45_000;
const FALLBACK_MODEL = "openai/gpt-4o-mini";

export function resolveCardTextModel(): string {
  return (process.env.OPENROUTER_CARD_TEXT_MODEL || "").trim() || "google/gemini-2.5-flash";
}

export type TextInput = {
  title: string;
  description: string | null | undefined;
  category?: string | null;
  brand?: string | null;
  characteristicNames?: string[] | null;
};

type Spend = { usd: number };

function friendlyNetworkError(e: unknown): Error {
  const text = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  if (/timeout|aborted|fetch failed|ECONN|ENOTFOUND|EAI_AGAIN|proxy/i.test(text) && !/OpenRouter \d{3}/.test(text)) {
    return new Error("OpenRouter не отвечает: проверьте прокси и интернет (OPENROUTER_PROXY) и ключ. Оценка не выполнена, деньги не списаны.");
  }
  return e instanceof Error ? e : new Error(text);
}

async function ask(model: string, user: string, spend: Spend): Promise<string> {
  const response = await openRouterFetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: getOpenRouterRequestHeaders("KARTO card text"),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      model,
      temperature: 0,
      seed: 7,
      max_tokens: 2200,
      usage: { include: true },
      messages: [
        { role: "system", content: TEXT_SYSTEM_PROMPT },
        { role: "user", content: user },
      ],
    }),
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    const error = new Error(`OpenRouter ${response.status}: ${errText.slice(0, 240)}`) as Error & { routing?: boolean };
    error.routing = isOpenRouterModelRoutingError(response.status, errText);
    throw error;
  }
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>; usage?: { cost?: number } };
  if (typeof data.usage?.cost === "number") spend.usd += data.usage.cost;
  const content = data.choices?.[0]?.message?.content;
  return (Array.isArray(content) ? content.map((p) => p?.text ?? "").join("") : (content ?? "")).trim();
}

export async function evaluateCardText(input: TextInput): Promise<TextResult> {
  if (!getNormalizedOpenRouterApiKey()) throw new Error("Ключ OpenRouter не настроен.");
  const title = input.title.trim();
  if (!title) throw new Error("У карточки нет названия");
  const metrics = measureText({ title, description: input.description });
  const user = [
    `Название: ${title}`,
    input.category ? `Категория в карточке: ${input.category.trim()}` : null,
    input.brand ? `Бренд: ${input.brand.trim()}` : null,
    input.characteristicNames && input.characteristicNames.length > 0 ? `Заполненные характеристики: ${input.characteristicNames.slice(0, 40).join(", ")}` : null,
    textMetricsForPrompt(metrics),
    `Описание:\n${(input.description ?? "").trim().slice(0, 5500) || "описания нет"}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const spend: Spend = { usd: 0 };
  let model = resolveCardTextModel();
  let text: string;
  try {
    text = await ask(model, user, spend);
  } catch (e) {
    if ((e as { routing?: boolean }).routing && model !== FALLBACK_MODEL) {
      model = FALLBACK_MODEL;
      text = await ask(model, user, spend);
    } else {
      throw friendlyNetworkError(e);
    }
  }
  let raw = parseTextJson(text);
  if (!raw) raw = parseTextJson(await ask(model, user, spend).catch((e) => { throw friendlyNetworkError(e); }));
  if (!raw) throw new Error("Модель вернула ответ, который не удалось разобрать");
  raw = applyTextCaps(raw, metrics);
  return buildTextResult(raw, { metrics, title, description: input.description, model, costUsd: Math.round(spend.usd * 1e6) / 1e6 });
}

/** Оценка с проверкой: если название и описание не менялись с прошлой оценки, платный вызов не делаем. */
export async function evaluateCardTextCached(input: TextInput, previous: TextResult | null, force = false): Promise<{ result: TextResult; reused: boolean }> {
  if (!force && previous && previous.contentHash === textContentHash(input.title, input.description)) return { result: previous, reused: true };
  return { result: await evaluateCardText(input), reused: false };
}
