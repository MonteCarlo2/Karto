import { askHubModel, extractJson } from "./llm";

/**
 * Релевантность поисковых запросов рекламы товару. Кандидаты в минус-фразы определены по статистике (клики без заказов),
 * но статистика не знает смысла: запрос может быть нужным, просто ещё не конвертировал. Нейросеть различает:
 * - irrelevant: запрос про другой товар или другую потребность, его стоит добавить в минус-фразы;
 * - relevant: запрос по смыслу подходит товару, в минус добавлять нельзя, причину ищите в цене, ставке, карточке;
 * - unclear: из названия товара не ясно, решает продавец.
 */

export type RelevanceVerdict = "irrelevant" | "relevant" | "unclear";
export type QueryRelevance = { query: string; verdict: RelevanceVerdict; reason: string };

export const RELEVANCE_PROTOCOL_VERSION = "r2";

const SYSTEM = `Ты эксперт по рекламе на Wildberries. Тебе дают товар и список поисковых запросов, по которым реклама товара получила клики, но не получила заказов. Для каждого запроса реши, подходит ли он товару по смыслу.

Определения:
- irrelevant: покупатель, который вводит этот запрос, ищет другой товар или другую потребность (другой тип товара, другой материал, размер, назначение, бренд, который товару не соответствует). Такие запросы стоит добавить в минус-фразы.
- relevant: по смыслу товар подходит под запрос. Отсутствие заказов тут объясняется ценой, ставкой, позицией, фото или тем, что мало времени. В минус-фразы такие запросы добавлять НЕЛЬЗЯ.
- unclear: по названию и описанию нельзя уверенно решить.

Правила:
- Опирайся на название, категорию и описание товара. Не придумывай свойств, которых в них нет.
- Общие запросы одним словом (например, «кашпо» для «Основа для кашпо») обычно relevant: они описывают товарный тип.
- Если запрос шире или уже товара, но покупатель мог бы его купить, это relevant или unclear, а не irrelevant.
- Если запрос уточняет свойство, которого нет в описании (подвесное, уличное, большое, цвет), но тип товара тот же, это unclear, а не irrelevant: товар мог бы подойти, продавец решит сам.
- irrelevant ставь только при явном несоответствии типа товара или потребности, которое можешь назвать одной фразой.
- Не склоняйся к irrelevant, чтобы список выглядел решительным: лишняя минус-фраза отнимает показы.

Ответ только JSON: {"results":[{"query":"...","verdict":"irrelevant|relevant|unclear","reason":"коротко"}]}. По одному объекту на каждый запрос, в том же порядке.`;

export function parseRelevance(text: string, queries: string[]): QueryRelevance[] | null {
  const data = extractJson(text) as { results?: unknown } | null;
  if (!data || !Array.isArray(data.results)) return null;
  const byQuery = new Map<string, QueryRelevance>();
  for (const item of data.results) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const query = String(o.query ?? "").trim();
    const verdict = o.verdict;
    if (!query || (verdict !== "irrelevant" && verdict !== "relevant" && verdict !== "unclear")) continue;
    byQuery.set(query.toLowerCase(), { query, verdict, reason: String(o.reason ?? "").trim().slice(0, 200) });
  }
  // Запрос без ответа модели считаем неясным: решение остаётся за продавцом.
  return queries.map((q) => byQuery.get(q.trim().toLowerCase()) ?? { query: q, verdict: "unclear" as const, reason: "модель не дала ответа" });
}

export async function judgeQueryRelevance(input: {
  title: string;
  category?: string | null;
  description?: string | null;
  queries: string[];
}): Promise<{ results: QueryRelevance[]; costUsd: number }> {
  const queries = input.queries.map((q) => q.trim()).filter(Boolean).slice(0, 30);
  if (queries.length === 0) return { results: [], costUsd: 0 };
  const user = [
    `Товар: ${input.title.trim()}`,
    input.category ? `Категория: ${input.category.trim()}` : null,
    input.description ? `Описание: ${input.description.trim().slice(0, 1200)}` : null,
    `Запросы без заказов:\n${queries.map((q, i) => `${i + 1}. ${q}`).join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const { text, costUsd } = await askHubModel({ system: SYSTEM, user, maxTokens: 1200 });
  const results = parseRelevance(text, queries);
  if (!results) throw new Error("Модель вернула ответ, который не удалось разобрать");
  return { results, costUsd };
}
