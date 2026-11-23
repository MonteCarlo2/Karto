import type { SupabaseClient } from "@supabase/supabase-js";
import { askHubModel, extractJson } from "@/lib/seller-hub/llm";
import { KB_ARTICLES } from "./index";
import { applyKbPatches, unknownNumbers, validateKbPatch, type KbPatch, type WbFact } from "./wb-help-parse";

/**
 * Обработка ленты изменений справки Wildberries нейросетью. Всё, что она написала, проверяется программой:
 * каждое число должно быть в первоисточнике, правка нашей статьи может менять только числа. Не прошло проверку: не публикуется.
 */

/** Какие наши статьи опираются на какие статьи справки. Новая статья справки, которой здесь нет, пересказывается автоматически. */
export const WB_HELP_MAP: Record<string, string[]> = {
  "A-34": ["w-price-quarantine"],
  "A-338": ["w-price-basics"],
  "A-55": ["w-price-basics"],
  "A-323": ["w-promo-official", "w-promo"],
  "A-1380": ["w-wbp-basics", "w-ads-types"],
  "A-1382": ["w-wbp-budget"],
  "A-1430": ["w-wbp-budget"],
  "A-526": ["w-rating-product"],
  "A-525": ["w-rating", "w-rating-product"],
  "A-13": ["w-report-weekly", "w-report"],
  "A-14": ["w-report-weekly", "w-report"],
  "A-225": ["w-balance-payout"],
  "A-311": ["w-payout"],
  "A-1589": ["w-payout", "w-balance-payout"],
  "A-269": ["w-models"],
  "A-270": ["w-dbw"],
  "A-107": ["w-dbs"],
  "A-959": ["w-edbs"],
  "A-549": ["w-edbs"],
  "A-345": ["w-cc"],
  "A-463": ["w-sizes"],
  "A-221": ["w-sizes", "w-logistics"],
  "A-31": ["w-supply-steps"],
  "A-36": ["w-supply-steps"],
  "A-103": ["w-supply-steps"],
  "A-38": ["w-supply-steps"],
  "A-40": ["w-returns-warehouse"],
  "A-1610": ["w-block-faq"],
  "A-65": ["w-banned"],
  "A-414": ["w-first-sale"],
  "A-378": ["w-start-how"],
  "A-416": ["w-start-how"],
  "A-111": ["w-commission"],
  "A-20": ["w-commission"],
  "A-341": ["w-taxes"],
  "A-102": ["w-returns"],
  "A-253": ["w-returns"],
  "A-1978": ["w-returns"],
  "A-540": ["w-defect"],
  "A-2001": ["w-logistics"],
  "A-2002": ["w-logistics"],
  "A-2035": ["w-logistics"],
  "A-2037": ["w-fbw", "w-logistics"],
  "A-1559": ["w-fbw"],
  "A-1539": ["w-fbw", "w-trouble-fines"],
  "A-71": ["w-trouble-fines"],
  "A-9": ["w-fbs"],
  "A-12": ["w-fbs"],
  "A-511": ["w-fbs"],
  "A-121": ["w-delivery-rating"],
  "A-1676": ["w-reviews-honest"],
  "A-1674": ["w-reviews-honest", "w-rating"],
  "A-164": ["w-card-title"],
  "A-124": ["w-card-photo"],
  "A-306": ["w-card-marking"],
  "A-1860": ["w-card-marking"],
  "A-1468": ["w-api-tokens"],
  "A-552": ["w-api-tokens"],
  "A-1600": ["w-api-tokens"],
  "A-254": ["w-card-attrs"],
  "A-330": ["w-card-attrs"],
  "A-1633": ["w-search-official"],
};

export type KbAutoArticle = { title: string; summary: string; body: string; keywords: string[] };

const FORBIDDEN = /[$]|джем|\bjam\b|openrouter/i;
const MAX_NEW_PER_RUN = 5;
const MAX_UPDATES_PER_RUN = 10;

const SYSTEM_NEW = `Ты редактор базы знаний для продавцов Wildberries (небольшие магазины, 1–3 человека). Тебе дают текст статьи из официальной справки Wildberries. Перескажи её простым русским языком, чтобы продавец понял, что делать.
ПРАВИЛА
- Только факты из переданного текста. Ничего не добавляй от себя: ни чисел, ни сроков, ни советов, которых нет в тексте.
- Каждое число, срок, процент и сумму переноси точно как в тексте.
- Не упоминай подписку «Джем» и другие платные подписки; такие фрагменты пропускай.
- Пиши коротко, без вступлений и воды. Без длинного тире, используй двоеточие или запятую.
- Разметка тела: «## Заголовок раздела», пустая строка между абзацами, «- пункт», «1. шаг», «**жирное**» для названий кнопок и разделов, «> Важно: текст» для предупреждений, таблица строками «| ячейка | ячейка |» (первая строка заголовок, без строки-разделителя).
- Тело от 900 до 3500 знаков, 3–6 разделов. Начни с одного абзаца сути без заголовка.
- Верни только JSON: {"title": "короткое понятное название", "summary": "одно-два предложения, о чём статья", "keywords": ["слова, которыми ищет продавец", ...до 8], "body": "текст в разметке"}`;

const SYSTEM_UPDATE = `Ты редактор базы знаний для продавцов Wildberries. В официальной справке Wildberries изменилась статья. Тебе дают факты «было → стало» и строки из наших статей, где могут стоять старые числа.
ЗАДАЧА
1) summary: одно-два предложения простым языком, что изменилось для продавца. Только то, что есть в фактах. Числа точно как в фактах.
2) patches: точечные замены в наших статьях. Каждая замена: articleId, find (точный короткий фрагмент из переданной строки нашей статьи, до 200 знаков, со старым числом), replace (тот же фрагмент, где изменены ТОЛЬКО числа на новые из «стало»). Слова, знаки и разметку не меняй. Если уверенной замены нет, верни пустой список.
Верни только JSON: {"summary": "...", "patches": [{"articleId": "...", "find": "...", "replace": "..."}]}`;

/** Проверка пересказа новой статьи. Возвращает причину отказа или null. */
export function validateAutoArticle(a: KbAutoArticle, source: string, sourceTitle: string): string | null {
  if (a.title.length < 8 || a.title.length > 110) return "название не той длины";
  if (a.summary.length < 20 || a.summary.length > 320) return "описание не той длины";
  if (a.body.length < 600 || a.body.length > 6000) return "текст не той длины";
  if (!/^## /m.test(a.body)) return "нет разделов";
  const all = `${a.title}\n${a.summary}\n${a.body}`;
  if (FORBIDDEN.test(all)) return "запрещённое слово";
  if (/\[\[|\]\(/.test(a.body)) return "ссылки и вставки не разрешены";
  if ((a.body.match(/\*\*/g) ?? []).length % 2) return "непарное выделение";
  const unknown = unknownNumbers(all, `${sourceTitle}\n${source}`);
  if (unknown.length > 0) return `числа нет в справке: ${unknown.slice(0, 5).join(", ")}`;
  return null;
}

function parseAuto(text: string): KbAutoArticle | null {
  const o = extractJson(text) as Record<string, unknown> | null;
  if (!o || typeof o.title !== "string" || typeof o.summary !== "string" || typeof o.body !== "string") return null;
  const keywords = Array.isArray(o.keywords) ? o.keywords.map(String).map((k) => k.trim().slice(0, 40)).filter(Boolean).slice(0, 8) : [];
  return { title: o.title.trim(), summary: o.summary.trim(), body: o.body.replace(/\r/g, "").replace(/ — /g, ": ").trim(), keywords };
}

type ArticleRow = { help_id: string; title: string; source_text: string; auto_status: string };
type ChangeRow = { id: string; help_id: string; kind: string; title: string; facts: WbFact[]; patches: KbPatch[]; summary: string | null };

async function generateAuto(db: SupabaseClient, row: ArticleRow): Promise<"published" | "rejected" | "retry"> {
  let parsed: KbAutoArticle | null = null;
  let reason: string | null = null;
  // Вторая попытка получает причину отказа первой: чаще всего это длина или число, которого нет в справке.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { text } = await askHubModel({
        system: SYSTEM_NEW,
        user: JSON.stringify({ nazvanie: row.title, tekst: row.source_text.slice(0, 9000), ...(reason ? { zamechanie_k_proshloy_popytke: `${reason}${parsed ? `; длина текста была ${parsed.body.length} знаков` : ""}` } : {}) }),
        maxTokens: 3200,
        timeoutMs: 80_000,
      });
      parsed = parseAuto(text);
    } catch {
      return "retry";
    }
    reason = parsed ? validateAutoArticle(parsed, row.source_text, row.title) : "ответ не разобран";
    if (!reason) break;
  }
  const status = reason ? "rejected" : "published";
  await db.from("seller_hub_kb_wb_articles").update({ auto_article: reason ? null : parsed, auto_status: status, auto_note: reason ? `${reason}${parsed ? ` (${parsed.body.length} знаков)` : ""}` : null }).eq("help_id", row.help_id);
  return status;
}

/** Строки наших статей, где встречается хотя бы одно число из «было»: только их показываем модели. */
function candidateLines(body: string, facts: WbFact[]): string[] {
  const nums = new Set(facts.flatMap((f) => [...(f.was ?? "").matchAll(/\d[\d  ]*(?:[.,]\d+)?/g)].map((m) => m[0].trim())).filter((n) => n.length >= 2));
  if (nums.size === 0) return [];
  return body.split("\n").filter((l) => [...nums].some((n) => l.includes(n))).slice(0, 12).map((l) => l.slice(0, 400));
}

async function describeUpdate(db: SupabaseClient, change: ChangeRow, newSource: string, applied: Map<string, Array<{ find: string; replace: string }>>): Promise<boolean> {
  // Переименования (articleId «*») программа нашла сама: сохраняем их при любом исходе.
  const renames = (change.patches ?? []).filter((p) => p.articleId === "*");
  const targets = (WB_HELP_MAP[change.help_id] ?? []).map((id) => KB_ARTICLES.find((a) => a.id === id)).filter((a): a is NonNullable<typeof a> => Boolean(a));
  const bodies = new Map(targets.map((a) => [a.id, applyKbPatches(a.body, applied.get(a.id) ?? [])]));
  const stati = targets.map((a) => ({ articleId: a.id, stroki: candidateLines(bodies.get(a.id)!, change.facts) })).filter((s) => s.stroki.length > 0);
  let parsed: { summary?: unknown; patches?: unknown };
  try {
    const { text } = await askHubModel({ system: SYSTEM_UPDATE, user: JSON.stringify({ statya_spravki: change.title, fakty: change.facts.slice(0, 12), nashi_stati: stati }), maxTokens: 900, timeoutMs: 50_000 });
    parsed = (extractJson(text) as { summary?: unknown; patches?: unknown } | null) ?? {};
  } catch {
    return false;
  }
  const factsText = change.facts.map((f) => `${f.was ?? ""}\n${f.now ?? ""}`).join("\n");
  let summary = typeof parsed.summary === "string" ? parsed.summary.trim().slice(0, 400) : "";
  if (!summary || FORBIDDEN.test(summary) || unknownNumbers(summary, `${factsText}\n${change.title}`).length > 0) summary = "В справке Wildberries изменились цифры. Что было и что стало, показано ниже.";
  const wasText = change.facts.map((f) => f.was ?? "").join("\n");
  const patches: KbPatch[] = [];
  for (const raw of Array.isArray(parsed.patches) ? (parsed.patches as unknown[]) : []) {
    const p = raw as Partial<KbPatch>;
    if (typeof p.articleId !== "string" || typeof p.find !== "string" || typeof p.replace !== "string") continue;
    const body = bodies.get(p.articleId);
    if (!body) continue;
    const patch = { articleId: p.articleId, find: p.find, replace: p.replace };
    if (validateKbPatch(patch, body, newSource) != null) continue;
    // Заменяемое число должно быть среди «было»: иначе это не про данное изменение.
    const oldNums = [...patch.find.matchAll(/\d[\d  ]*(?:[.,]\d+)?/g)].map((m) => m[0].trim());
    const newNums = [...patch.replace.matchAll(/\d[\d  ]*(?:[.,]\d+)?/g)].map((m) => m[0].trim());
    if (!oldNums.some((n, i) => n !== newNums[i] && wasText.includes(n))) continue;
    patches.push(patch);
    bodies.set(patch.articleId, applyKbPatches(body, [patch]));
    applied.set(patch.articleId, [...(applied.get(patch.articleId) ?? []), patch]);
  }
  const { error } = await db.from("seller_hub_kb_wb_changes").update({ summary, patches: [...renames, ...patches] }).eq("id", change.id);
  return !error;
}

/** Доделывает ленту: пересказывает новые статьи справки и описывает изменения. Безопасно запускать повторно. */
export async function processWbHelpPending(db: SupabaseClient): Promise<{ published: number; rejected: number; described: number }> {
  const out = { published: 0, rejected: 0, described: 0 };
  const { data: changes } = await db.from("seller_hub_kb_wb_changes").select("id, help_id, kind, title, facts, patches, summary").order("detected_at", { ascending: true }).limit(500);
  const all = (changes ?? []) as ChangeRow[];

  const newIds = [...new Set(all.filter((c) => c.kind === "new" && !WB_HELP_MAP[c.help_id]).map((c) => c.help_id))];
  // Пересказанная ранее статья справки изменилась: пересказываем заново (auto_status сброшен ниже).
  const updatedIds = [...new Set(all.filter((c) => c.kind === "updated" && c.summary == null && !WB_HELP_MAP[c.help_id]).map((c) => c.help_id))];
  if (updatedIds.length > 0) await db.from("seller_hub_kb_wb_articles").update({ auto_status: "none" }).in("help_id", updatedIds).eq("auto_status", "published");
  if (newIds.length + updatedIds.length > 0) {
    const { data: rows } = await db.from("seller_hub_kb_wb_articles").select("help_id, title, source_text, auto_status").in("help_id", [...newIds, ...updatedIds]).eq("auto_status", "none").limit(MAX_NEW_PER_RUN);
    for (const row of (rows ?? []) as ArticleRow[]) {
      const r = await generateAuto(db, row);
      if (r === "published") out.published += 1;
      if (r === "rejected") out.rejected += 1;
    }
  }

  const applied = new Map<string, Array<{ find: string; replace: string }>>();
  for (const c of all) for (const p of (c.patches ?? []).filter((x) => x.articleId !== "*")) applied.set(p.articleId, [...(applied.get(p.articleId) ?? []), p]);
  const pending = all.filter((c) => c.kind === "updated" && c.summary == null).slice(0, MAX_UPDATES_PER_RUN);
  for (const change of pending) {
    const { data: row } = await db.from("seller_hub_kb_wb_articles").select("source_text").eq("help_id", change.help_id).maybeSingle();
    if (await describeUpdate(db, change, (row?.source_text as string | undefined) ?? "", applied)) out.described += 1;
  }
  return out;
}
