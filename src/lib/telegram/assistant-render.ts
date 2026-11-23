import { PLACE, bold, clip, escapeHtml, fmtInt, fmtPct, fmtRub, header, italic, link, packMessages, stat } from "./format";
import { eventsText, tasksText, reviewsText, ago, whenMsk } from "./assistant-text";
import { richTelegramMessages } from "./rich-text";
import { buildStockAnalytics } from "@/lib/seller-hub/stock-analytics";
import { kbArticle } from "@/lib/seller-hub/knowledge";
import type { ChatBlock, ChatMessage } from "@/lib/seller-hub/agent/chat";
import type { SellerProductEvent } from "@/lib/seller-hub/event-engine/types";
import type { SellerTask } from "@/lib/seller-hub/task-engine/types";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";

/**
 * Оформление ответа агента для Telegram. Текст модели превращается в безопасный HTML (только наши теги, всё остальное экранируется),
 * а карточки (товары, задачи, события, статьи, цифры из аналитики) собираются из настоящих данных кабинета, а не из слов модели.
 */

const MD_LINK = /\[([^\]\n]+)\]\((?:https?:\/\/|\/)[^)\s]*\)/g;

/** Markdown-подобный текст модели в HTML Telegram: **жирный**, *курсив*, `код`, списки, заголовки. Всё остальное экранируется. */
export function mdToTelegramHtml(raw: string): string {
  const lines = String(raw ?? "")
    .replace(MD_LINK, "$1")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => {
      const heading = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
      if (heading) return `**${heading[1]}**`;
      const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
      if (bullet) return `• ${bullet[1]}`;
      return line;
    });
  let html = escapeHtml(lines.join("\n"));
  html = html
    .replace(/\*\*([^*\n]+?)\*\*/g, "<b>$1</b>")
    .replace(/__([^_\n]+?)__/g, "<b>$1</b>")
    .replace(/(^|[\s(])\*([^*\n]+?)\*(?=[\s).,;:!?]|$)/g, "$1<i>$2</i>")
    .replace(/`([^`\n]+?)`/g, "<code>$1</code>");
  // Остатки разметки, у которой не нашлось пары, показываем без символов-«мусора».
  return html.replace(/\*\*/g, "").replace(/(?<![\w<])\*(?![\w>])/g, "");
}

export type RenderCtx = {
  snapshot: SellerCatalogSnapshot | null;
  events: SellerProductEvent[];
  tasks: SellerTask[];
  nowMs: number;
  url: string;
  /** Показывать источники под ответом: только когда вопрос про правила, штрафы или деньги. */
  showSources?: boolean;
};

const dayShort = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", "");

export function productLine(snapshot: SellerCatalogSnapshot | null, nmId: string): string | null {
  const item = snapshot?.items.find((i) => String(i.externalId) === String(nmId));
  if (!item) return null;
  const price = item.discountedPrice ?? item.price ?? null;
  const stock = (item.stockFbo ?? 0) + (item.stockFbs ?? 0);
  const funnel = snapshot?.funnel?.byNm?.[String(nmId)];
  const lines = [`🛍 ${bold(clip(item.title, 90))}`, italic(`арт. ${item.vendorCode || nmId}`)];
  const facts: string[] = [];
  if (price != null) facts.push(`💰 Цена — ${bold(fmtRub(price))}${item.discountPercent ? ` (скидка ${fmtPct(item.discountPercent)})` : ""}`);
  if (item.stockFbo != null || item.stockFbs != null) facts.push(`📦 Остаток — ${bold(`${fmtInt(stock)} шт`)}`);
  if (funnel) facts.push(`🛒 Заказов за период — ${bold(fmtInt(funnel.orders))}`);
  if (funnel?.feedbackRating) facts.push(`⭐ Рейтинг — ${bold(funnel.feedbackRating.toLocaleString("ru-RU"))}`);
  return `${lines.join("\n")}${facts.length ? `\n\n${facts.join("\n")}` : ""}`;
}

const PCT_BAR = (value: number, max: number) => {
  const filled = max > 0 ? Math.max(0, Math.min(8, Math.round((value / max) * 8))) : 0;
  return "▰".repeat(filled) + "▱".repeat(8 - filled);
};

export function analyticsText(b: Extract<ChatBlock, { type: "analytics" }>, ctx: RenderCtx): string | null {
  const s = ctx.snapshot;
  if (!s) return null;
  if (b.view === "trend" || b.view === "summary") {
    const a = s.analytics;
    if (!a?.daily?.length) return null;
    const days = a.daily.slice(-Math.min(b.days, 14));
    const maxOrders = Math.max(...days.map((d) => d.orders), 0);
    const rows = days.map((d) => `${escapeHtml(dayShort(d.date))}  ${PCT_BAR(d.orders, maxOrders)}  ${fmtInt(d.orders)} шт · ${escapeHtml(fmtRub(d.revenue))}`);
    const total = [stat("🛒", "Заказов", fmtInt(a.ordersTotal)), stat("💰", "Оборот", fmtRub(a.revenueTotal))].join("\n");
    return `${header("📈", "Заказы по дням", `последние ${days.length} дн.`)}\n\n<pre>${rows.join("\n")}</pre>\n\n${bold(`Итого за ${a.daily.length} дн.`)}\n${total}`;
  }
  if (b.view === "funnel") {
    const rows = Object.values(s.funnel?.byNm ?? {});
    if (rows.length === 0) return null;
    const sum = (f: (r: (typeof rows)[number]) => number | null) => rows.reduce((acc, r) => acc + (f(r) ?? 0), 0);
    const open = sum((r) => r.selected.openCount);
    const cart = sum((r) => r.selected.cartCount);
    const orders = sum((r) => r.selected.orderCount);
    const buy = sum((r) => r.selected.buyoutCount);
    const pct = (a: number, c: number) => (c > 0 ? fmtPct((a / c) * 100, 1) : "—");
    const steps = [
      `👀 Перешли в карточку — ${bold(fmtInt(open))}`,
      `🛒 В корзину — ${bold(fmtInt(cart))}\n      ↳ ${pct(cart, open)} от просмотров`,
      `🧾 Заказали — ${bold(fmtInt(orders))}\n      ↳ ${pct(orders, cart)} от корзины`,
      `✅ Выкупили — ${bold(fmtInt(buy))}\n      ↳ ${pct(buy, orders)} от заказов`,
    ];
    return `${header("🔻", "Воронка продаж")}\n\n${steps.join("\n\n")}`;
  }
  if (b.view === "products") {
    const rows = Object.entries(s.funnel?.byNm ?? {})
      .map(([nm, r]) => ({ nm, orders: r.selected.orderCount ?? r.orders, sum: r.selected.orderSum ?? 0 }))
      .sort((x, y) => y.sum - x.sum || y.orders - x.orders)
      .slice(0, 5);
    if (rows.length === 0) return null;
    const total = Object.values(s.funnel?.byNm ?? {}).reduce((acc, r) => acc + (r.selected.orderSum ?? 0), 0);
    const list = rows.map((r, i) => {
      const item = s.items.find((x) => String(x.externalId) === r.nm);
      const share = total > 0 ? ` · ${fmtPct((r.sum / total) * 100)} оборота` : "";
      return `${PLACE[i] ?? `${i + 1}.`} ${bold(clip(item?.title ?? r.nm, 70))}\n${italic(`${fmtRub(r.sum)} · ${fmtInt(r.orders)} шт${share}`)}`;
    });
    return `${header("🏆", "Кто даёт оборот", "топ товаров за период")}\n\n${list.join("\n\n")}`;
  }
  if (b.view === "ads") {
    const st = s.adsStats;
    if (!st?.campaigns?.length) return null;
    const names = new Map((s.ads?.campaigns ?? []).map((c) => [String(c.id), c.name || `Кампания ${c.id}`]));
    const rows = st.campaigns.slice(0, 6).map((c) => `📣 ${bold(clip(names.get(c.advertId) ?? `Кампания ${c.advertId}`, 50))}\n${italic(`расход ${fmtRub(c.spend)} · заказов ${fmtInt(c.orders)} · ДРР ${c.orderSum > 0 ? fmtPct((c.spend / c.orderSum) * 100, 1) : "—"}`)}`);
    return `${header("📣", "Реклама", `${dayShort(st.dateFrom)} — ${dayShort(st.dateTo)}`)}\n\n${rows.join("\n\n")}`;
  }
  if (b.view === "stock") {
    const stock = buildStockAnalytics(s.stocksReport, s.items);
    if (!stock) return null;
    const low = stock.rows.filter((r) => r.status === "out" || r.status === "low").slice(0, 6);
    if (low.length === 0) return `${header("📦", "Остатки")}\n\n✅ Товаров с коротким запасом нет.`;
    return `${header("📦", "Заканчивается", "что пора пополнить")}\n\n${low.map((r) => `${r.status === "out" ? "🔴" : "🟠"} ${bold(clip(r.title, 60))}\n${italic(r.status === "out" ? "закончился" : `хватит на ${r.saleRateDays != null ? Math.round(r.saleRateDays) : "?"} дн.`)}`).join("\n\n")}`;
  }
  return null;
}

export function promosText(s: SellerCatalogSnapshot | null, nowMs: number): string | null {
  const list = (s?.promotions ?? []).filter((p) => !p.endAt || Date.parse(p.endAt) >= nowMs).slice(0, 6);
  if (list.length === 0) return `${header("🏷", "Акции", "календарь пуст")}\n\nБлижайших акций в календаре нет.`;
  const rows = list.map((p) => `🏷 ${bold(clip(p.name, 70))}\n${italic(`📅 ${p.startAt ? dayShort(p.startAt) : "?"} — ${p.endAt ? dayShort(p.endAt) : "?"}${p.participatingSkuCount != null ? ` · ваших товаров ${fmtInt(p.participatingSkuCount)}` : ""}`)}`);
  return `${header("🏷", "Акции Wildberries", "ближайшие")}\n\n${rows.join("\n\n")}`;
}

/** Блоки ответа агента в сообщения Telegram. Блоки-действия (цена, поручение, план) не показываются: менять что-то можно только на сайте. */
export function renderBlocks(blocks: ChatBlock[] | undefined, ctx: RenderCtx): string[] {
  const out: string[] = [];
  for (const b of blocks ?? []) {
    try {
      if (b.type === "product") {
        const line = productLine(ctx.snapshot, b.nmId);
        if (line) out.push(line);
      } else if (b.type === "products") {
        const lines = b.nmIds.slice(0, 6).map((nm) => productLine(ctx.snapshot, nm)).filter((x): x is string => Boolean(x));
        if (lines.length) out.push(header("🛍", clip(b.title, 90)), ...lines);
      } else if (b.type === "tasks") {
        out.push(...tasksText(ctx.tasks, ctx.nowMs, ctx.url));
      } else if (b.type === "task") {
        out.push(`📌 ${bold(clip(b.title, 120))}`);
      } else if (b.type === "article") {
        const a = kbArticle(b.id);
        out.push(`${header("📖", clip(b.title, 120))}\n\n${escapeHtml(clip(a?.summary ?? b.summary, 500))}`);
      } else if (b.type === "events") {
        const since = ctx.nowMs - b.days * 86_400_000;
        out.push(...eventsText(ctx.events.filter((e) => Date.parse(e.createdAt) >= since && (!b.group || e.group === b.group)), ctx.nowMs, ctx.url));
      } else if (b.type === "info") {
        if (b.kind === "reviews") out.push(...reviewsText(ctx.snapshot, ctx.url));
        else if (b.kind === "promos") {
          const t = promosText(ctx.snapshot, ctx.nowMs);
          if (t) out.push(t);
        } else if (b.kind === "supplies" && ctx.snapshot?.supplies) out.push(`${header("🚚", "Поставки")}\n\n${stat("📂", "Открыто", fmtInt(ctx.snapshot.supplies.openCount))}\n${stat("✅", "Закрыто", fmtInt(ctx.snapshot.supplies.closedCount))}`);
      } else if (b.type === "analytics") {
        const t = analyticsText(b, ctx);
        if (t) out.push(t);
      }
    } catch (error) {
      console.warn("[telegram] блок ответа не собрался:", b.type, error instanceof Error ? error.message : String(error));
    }
  }
  return out;
}

/** Действие, которое агент подготовил в ответе: карточка с кнопками «Подтвердить» и «Отмена». */
export type AnswerAction = { action: import("./action-exec").TgAction; html: string };

export type TelegramAnswer = { messages: string[]; keyboard: string[][] | null; placeholder?: string; actions?: AnswerAction[] };

/** Ответ агента целиком: текст, карточки, уточняющие вопросы с вариантами, источники. */
export function renderChatReply(msg: ChatMessage, ctx: RenderCtx): TelegramAnswer {
  const blocks: string[] = [];
  blocks.push(...richTelegramMessages(msg.text || ""));
  blocks.push(...renderBlocks(msg.blocks, ctx));
  const questions = msg.questions ?? [];
  if (questions.length > 0) blocks.push(`${header("❓", "Уточните")}\n\n${questions.map((q, i) => `${questions.length > 1 ? `${i + 1}. ` : ""}${escapeHtml(clip(q, 220))}`).join("\n\n")}`);
  if (msg.sources?.length && ctx.showSources) {
    const src = msg.sources.slice(0, 4).map((s) => `• ${link(clip(s.title, 70) || s.url, s.url)}`);
    blocks.push(`${italic("🔗 Источники")}\n${src.join("\n")}`);
  }
  const options = (msg.questionOptions?.[0] ?? []).map((o) => clip(o, 60)).filter(Boolean).slice(0, 6);
  const suggestions = (msg.suggestions ?? []).map((o) => clip(o, 60)).filter(Boolean).slice(0, 4);
  const pick = options.length ? options : suggestions;
  const keyboard = pick.length ? [...pick.map((o) => [o])] : null;
  return { messages: packMessages(blocks.length ? blocks : [escapeHtml("Не нашёл, что ответить. Спросите по-другому, например: «сколько заказов сегодня»")]), keyboard, placeholder: questions[0] ? clip(questions[0], 60) : undefined };
}

export { ago, whenMsk };
