import { WildberriesApiError } from "./client";

/**
 * Новости портала продавцов WB (официальный метод `GET /api/communications/v2/news`).
 * Работает с токеном любой категории. Только чтение. Лимит WB: 1 запрос в минуту (для обычного токена до 1 запроса в час).
 */

const COMMON_BASE = "https://common-api.wildberries.ru";
const TIMEOUT_MS = 30_000;

export type WbNewsItem = {
  id: number;
  header: string;
  /** Текст новости без разметки. */
  text: string;
  /** Дата публикации, ISO. */
  date: string;
  /** Рубрики и теги в том виде, как их отдаёт WB. */
  types: string[];
  tags: string[];
};

export type WbNewsResult = { loadedAt: string; items: WbNewsItem[]; /** Имена полей первой новости в ответе WB (для диагностики формата). */ rawKeys: string[] };

function normalizeToken(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new WildberriesApiError("API-токен не указан", 400);
  return trimmed.startsWith("Bearer ") ? trimmed.slice(7).trim() : trimmed;
}

const ENTITIES: Record<string, string> = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&laquo;": "«", "&raquo;": "»", "&ndash;": "–", "&mdash;": "—" };

/** Убирает HTML из текста новости: теги, ссылки, переносы. Остаётся читаемый текст. */
export function stripHtml(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m)
    .replace(/[ \t ]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

const names = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .map((v) => (typeof v === "string" ? v : v && typeof v === "object" && typeof (v as { name?: unknown }).name === "string" ? (v as { name: string }).name : ""))
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

/** Разбор ответа WB. Элементы без id, заголовка или даты пропускаются: без них новость не показать честно. */
export function parseWbNews(payload: unknown): WbNewsItem[] {
  const data = payload && typeof payload === "object" ? (payload as { data?: unknown }).data : undefined;
  const list = Array.isArray(data) ? data : Array.isArray(payload) ? payload : [];
  const out: WbNewsItem[] = [];
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = typeof r.id === "number" ? r.id : typeof r.id === "string" ? Number(r.id) : Number.NaN;
    const header = typeof r.header === "string" ? stripHtml(r.header) : typeof r.title === "string" ? stripHtml(r.title) : "";
    const date = typeof r.date === "string" ? r.date : "";
    if (!Number.isFinite(id) || !header || !Number.isFinite(Date.parse(date))) continue;
    out.push({
      id,
      header,
      text: typeof r.content === "string" ? stripHtml(r.content) : typeof r.text === "string" ? stripHtml(r.text) : "",
      date: new Date(date).toISOString(),
      types: names(r.types),
      tags: names(r.tags),
    });
  }
  return out;
}

/** Новости с даты `from` (ГГГГ-ММ-ДД) или начиная с номера `fromId` включительно, до 100 за запрос, от старых к новым. */
export async function fetchWbNews(token: string, start: { from: string } | { fromId: number }): Promise<WbNewsResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${COMMON_BASE}/api/communications/v2/news?${"fromId" in start ? `fromID=${start.fromId}` : `from=${encodeURIComponent(start.from)}`}`, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json", Authorization: `Bearer ${normalizeToken(token)}` },
      cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok) {
      throw new WildberriesApiError(
        res.status === 429 ? "WB ограничил запросы новостей (не чаще раза в минуту). Повторите позже." : res.status === 401 || res.status === 403 ? "Токен не принят WB при чтении новостей" : `WB не отдал новости (${res.status})`,
        res.status,
      );
    }
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      throw new WildberriesApiError("WB прислал новости в неожиданном виде", 502);
    }
    const rawList = payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data) ? ((payload as { data: unknown[] }).data) : [];
    const first = rawList[0];
    return { loadedAt: new Date().toISOString(), items: parseWbNews(payload), rawKeys: first && typeof first === "object" ? Object.keys(first as object) : [] };
  } catch (e) {
    if (e instanceof WildberriesApiError) throw e;
    if (e instanceof DOMException && e.name === "AbortError") throw new WildberriesApiError("WB не ответил вовремя", 504);
    throw new WildberriesApiError(e instanceof Error ? e.message : "Не удалось связаться с WB", 502);
  } finally {
    clearTimeout(timer);
  }
}
