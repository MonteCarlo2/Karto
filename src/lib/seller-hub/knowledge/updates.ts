import { KB_CATEGORIES } from "./categories";
import { KB_ARTICLES, registerKbArticle } from "./index";
import type { KbArticle, KbCategory } from "./types";

/** Автообновления базы знаний с сервера: что пришло из ежедневной сверки со справкой Wildberries. */
export type KbFeedItem = { id: string; kind: "new" | "updated"; title: string; summary: string | null; facts: Array<{ was: string | null; now: string | null }>; date: string; articleIds: string[]; helpUrl: string };
export type KbUpdates = { autoArticles: KbArticle[]; patches: Record<string, Array<{ find: string; replace: string }>>; renames: Array<{ from: string; to: string }>; checkedAt: string | null; feed: KbFeedItem[] };

export const KB_AUTO_CATEGORY: KbCategory = { id: "w-auto", branch: "wb", title: "Новое в справке WB", hint: "Свежие статьи Wildberries в пересказе", icon: "Sparkles" };

const original = new Map<string, string>();
const originalMeta = new Map<string, { title: string; summary: string }>();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
let checkedAt: string | null = null;

/** Когда последний раз успешно сверялись со справкой Wildberries. */
export const kbCheckedAt = (): string | null => checkedAt;

/**
 * Накладывает обновления на базу знаний в памяти: добавляет пересказанные статьи и меняет цифры в наших.
 * Повторный вызов безопасен: правки всегда считаются от исходного текста. Возвращает true, если что-то изменилось.
 */
export function applyKbUpdates(u: KbUpdates): boolean {
  let changed = false;
  for (const a of u.autoArticles) if (registerKbArticle(a)) changed = true;
  if (u.autoArticles.length > 0 && !KB_CATEGORIES.some((c) => c.id === KB_AUTO_CATEGORY.id)) {
    KB_CATEGORIES.push(KB_AUTO_CATEGORY);
    changed = true;
  }
  if (u.checkedAt !== checkedAt) {
    checkedAt = u.checkedAt;
    changed = true;
  }
  // Переименования (например, новое название модели продаж) меняем целым словом во всех статьях про Wildberries.
  const renames = (u.renames ?? []).map((r) => ({ re: new RegExp(`(?<![A-Za-z0-9])${escapeRe(r.from)}(?![A-Za-z0-9])`, "g"), to: r.to }));
  for (const article of KB_ARTICLES) {
    const base = original.get(article.id) ?? article.body;
    const meta = originalMeta.get(article.id) ?? { title: article.title, summary: article.summary };
    let next = base;
    for (const p of u.patches[article.id] ?? []) if (next.split(p.find).length === 2) next = next.replace(p.find, p.replace);
    let title = meta.title;
    let summary = meta.summary;
    if (article.branch === "wb") {
      for (const r of renames) {
        next = next.replace(r.re, r.to);
        title = title.replace(r.re, r.to);
        summary = summary.replace(r.re, r.to);
      }
    }
    if (next !== article.body || title !== article.title || summary !== article.summary) {
      original.set(article.id, base);
      originalMeta.set(article.id, meta);
      article.body = next;
      article.title = title;
      article.summary = summary;
      changed = true;
    }
  }
  return changed;
}
