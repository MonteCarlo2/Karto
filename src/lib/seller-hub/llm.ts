import { getNormalizedOpenRouterApiKey, getOpenRouterRequestHeaders } from "@/lib/openrouter-headers";
import { openRouterFetch } from "@/lib/openrouter-fetch";
import { isOpenRouterModelRoutingError } from "@/lib/openrouter-default-models";

/**
 * Общий вызов текстовой модели через OpenRouter для функций Seller Hub (температура 0, фиксированный seed, учёт стоимости).
 * Только чтение: ничего в кабинете маркетплейса не меняет.
 */

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const FALLBACK_MODEL = "openai/gpt-4o-mini";

export function defaultHubModel(): string {
  return (process.env.OPENROUTER_HUB_MODEL || "").trim() || "google/gemini-2.5-flash";
}

export function friendlyLlmError(e: unknown): Error {
  const text = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  if (/timeout|aborted|fetch failed|ECONN|ENOTFOUND|EAI_AGAIN|proxy/i.test(text) && !/OpenRouter \d{3}/.test(text)) {
    return new Error("OpenRouter не отвечает: проверьте прокси и интернет (OPENROUTER_PROXY) и ключ. Проверка не выполнена, деньги не списаны.");
  }
  return e instanceof Error ? e : new Error(text);
}

export type HubSource = { title: string; url: string };

async function once(model: string, system: string, user: string, maxTokens: number, timeoutMs: number, web = false): Promise<{ text: string; costUsd: number; sources: HubSource[]; truncated: boolean }> {
  const response = await openRouterFetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: getOpenRouterRequestHeaders("KARTO seller hub"),
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model,
      temperature: 0,
      seed: 7,
      max_tokens: maxTokens,
      // Рассуждение модели съедает лимит ответа и обрезает JSON: для структурного разбора держим его минимальным.
      reasoning: { effort: "low" },
      usage: { include: true },
      // Поиск в интернете: OpenRouter сам находит страницы и прикладывает цитаты с адресами.
      ...(web ? { plugins: [{ id: "web", max_results: 5 }] } : {}),
      messages: [
        { role: "system", content: system },
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
  const data = (await response.json()) as { choices?: Array<{ finish_reason?: string; message?: { content?: string | Array<{ text?: string }>; annotations?: Array<{ type?: string; url_citation?: { url?: string; title?: string } }> } }>; usage?: { cost?: number } };
  const content = data.choices?.[0]?.message?.content;
  if (process.env.DEBUG_AI) console.log(`[llm] ${model} finish=${data.choices?.[0]?.finish_reason} max=${maxTokens} len=${typeof content === "string" ? content.length : "arr"}`);
  return {
    truncated: data.choices?.[0]?.finish_reason === "length",
    text: (Array.isArray(content) ? content.map((p) => p?.text ?? "").join("") : (content ?? "")).trim(),
    costUsd: typeof data.usage?.cost === "number" ? data.usage.cost : 0,
    sources: (data.choices?.[0]?.message?.annotations ?? []).flatMap((a) => (a.type === "url_citation" && a.url_citation?.url && /^https?:\/\//.test(a.url_citation.url) ? [{ title: (a.url_citation.title || a.url_citation.url).slice(0, 120), url: a.url_citation.url }] : [])).filter((s, i, arr) => arr.findIndex((x) => x.url === s.url) === i).slice(0, 5),
  };
}

/**
 * Модели агента по ролям. Выбраны по замеру на 13 разборах (scripts/agent-ai-benchmark.ts): аналитик и проверяющий от разных разработчиков,
 * чтобы не повторять одни и те же ошибки. Меняются переменными SELLER_HUB_AGENT_ANALYST_MODEL / SELLER_HUB_AGENT_REVIEWER_MODEL.
 */
export const AGENT_MODELS = { analyst: "openai/gpt-5.6-luna", reviewer: "anthropic/claude-haiku-5.5", chat: "anthropic/claude-haiku-5.5" } as const;
/** chat: ответы в чате агента (вопросы, сводки, действия); план по товару остаётся на analyst. Меняется переменной SELLER_HUB_CHAT_MODEL. */
export function agentModel(role: "analyst" | "reviewer" | "chat"): string {
  const env = role === "analyst" ? process.env.SELLER_HUB_AGENT_ANALYST_MODEL : role === "chat" ? process.env.SELLER_HUB_CHAT_MODEL : process.env.SELLER_HUB_AGENT_REVIEWER_MODEL;
  return (env || "").trim() || AGENT_MODELS[role];
}

/** Один запрос к модели с запасной моделью при ошибке маршрутизации и понятным сообщением при сбое сети. */
export async function askHubModel(input: { system: string; user: string; maxTokens?: number; timeoutMs?: number; model?: string; web?: boolean }): Promise<{ text: string; costUsd: number; model: string; sources: HubSource[] }> {
  if (!getNormalizedOpenRouterApiKey()) throw new Error("Ключ OpenRouter не настроен.");
  const model = input.model ?? defaultHubModel();
  /**
   * Ответ модели обычно приходит за 5–10 секунд, но иногда соединение с провайдером «залипает» (замер 06.11.2026: около трети попыток).
   * Поэтому без явного таймаута первая попытка короткая, а при сбое сети или тайм-ауте сразу идёт вторая, свежим соединением.
   * Повтор безопасен: незавершённый запрос не оплачивается.
   */
  const timeouts = input.timeoutMs != null ? [input.timeoutMs] : [18_000, 24_000];
  try {
    let last: unknown;
    for (const timeoutMs of timeouts) {
      try {
        let r = await once(model, input.system, input.user, input.maxTokens ?? 1500, timeoutMs, input.web);
        // Ответ оборвался на лимите (модель потратила часть бюджета на рассуждение): повторяем с вдвое большим запасом, а не отдаём обрезанный текст.
        if (r.truncated) {
          const more = await once(model, input.system, input.user, Math.min(16_000, (input.maxTokens ?? 1500) * 2 + 1500), timeoutMs, input.web).catch(() => null);
          if (more && more.text) r = { ...more, costUsd: r.costUsd + more.costUsd };
        }
        return { ...r, model };
      } catch (err) {
        last = err;
        const text = err instanceof Error ? `${err.name} ${err.message}` : String(err);
        const transient = /timeout|aborted|fetch failed|ECONN|socket|EAI_AGAIN/i.test(text) && !/OpenRouter \d{3}/.test(text);
        if (!transient) throw err;
      }
    }
    throw last;
  } catch (e) {
    if ((e as { routing?: boolean }).routing && model !== FALLBACK_MODEL) {
      const r = await once(FALLBACK_MODEL, input.system, input.user, input.maxTokens ?? 1500, input.timeoutMs ?? 45_000, input.web).catch((err) => {
        throw friendlyLlmError(err);
      });
      return { ...r, model: FALLBACK_MODEL };
    }
    throw friendlyLlmError(e);
  }
}

/** Достаёт первый JSON-объект из ответа модели. */
export function extractJson(text: string): unknown | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}
