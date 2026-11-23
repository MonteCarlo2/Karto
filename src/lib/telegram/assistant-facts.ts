import { bold, clip, escapeHtml, fmtInt, fmtPct, fmtRub, header, italic, link, packMessages, quote, stat } from "./format";
import { ago, eventBlocks } from "./assistant-text";
import { mdToTelegramHtml } from "./assistant-render";
import { richTelegramHtml } from "./rich-text";
import { KB_ARTICLES } from "@/lib/seller-hub/knowledge";
import { searchSections } from "@/lib/seller-hub/knowledge/search";
import { analyticsText, productLine, promosText, type RenderCtx } from "./assistant-render";
import type { ChatBlock } from "@/lib/seller-hub/agent/chat";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";

/**
 * Точные ответы на частые вопросы про цифры магазина: заказы сегодня и вчера, акции, воронка, кто даёт оборот, реклама, остатки, цена и остаток товара.
 * Считаются из данных кабинета без нейросети: быстро, и число всегда настоящее. Работают и тогда, когда агент недоступен.
 */

export type FactIntent = "fbs_new" | "today" | "yesterday" | "promos" | "funnel" | "top" | "ads" | "stock" | "product" | "plans" | "news_today" | "news_yesterday" | "news_week" | "wb_yesterday" | "wb_today" | "wb_week";

const MSK = 3 * 3_600_000;
const mskDay = (ms: number) => new Date(ms + MSK).toISOString().slice(0, 10);

/** Определяет вопрос про цифры. Только короткие и однозначные формулировки: длинные рассуждения и советы разбирает агент. */
export function detectFactIntent(raw: string): FactIntent | null {
  const t = raw.toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N} ]+/gu, " ").replace(/\s+/g, " ").trim();
  const words = t.split(" ").filter(Boolean).length;
  if (!t || words > 9) return null;
  // Объяснения и советы («что такое ДРР», «как снизить ДРР», «почему падают заказы») отвечает агент, а не готовая выдача цифр.
  if (/^(что такое|что значит|что означает|как (снизить|уменьшить|улучшить|повысить|увеличить|работает|считается|считать|рассчитать|понять|правильно)|почему|зачем|объясни|можно ли|нужно ли|стоит ли)(?![а-я])/.test(t)) return null;
  // Новости и изменения: «что нового сегодня», «новости за неделю», «что Wildberries изменил вчера».
  if (/(новост|событи|что нового|что произошло|что случилось|измени(л|ли|лось|лась|лся)(?![а-я])|что измен|что поменял|поменял(и|ось)?(?![а-я])|изменени)/.test(t)) {
    const wb = /(wb|вайлдб|wildberries|вб|маркетплейс)/.test(t);
    const day = /вчера/.test(t) ? "yesterday" : /(сегодня|за сутки|за день|за последний день|за последние сутки)/.test(t) ? "today" : "week";
    return (wb ? `wb_${day}` : `news_${day}`) as FactIntent;
  }
  // «Покажи новые FBS-заказы», «сколько заказов ждут сборки»: только то, что нужно сделать сейчас.
  if (!/^(как|что нажать|где|куда)(?![а-я])/.test(t) && (/(нов[а-я]*|необработан[а-я]*|несобран[а-я]*|ждущ[а-я]*|ждут|к сборке|на сборку).{0,25}(заказ|фбс|fbs)|(заказ[а-я]*|фбс|fbs).{0,25}(нов[а-я]*|необработан[а-я]*|ждут|к сборке|на сборку|сборк[а-я]*)/.test(t))) return "fbs_new";
  if (/(?<![а-я])план/.test(t) && !/(составь|создай|сделай|придумай|построй|нужен|хочу)/.test(t)) return "plans";
  if (/(заказ|продаж|выручк|оборот|сводк).*(вчера)|(вчера).*(заказ|продаж|выручк|оборот)/.test(t)) return "yesterday";
  if (/(заказ|продаж|выручк|оборот).*(сегодня|сейчас)|(сегодня|сейчас).*(заказ|продаж|выручк|оборот)|(сводк|итог)\w*.{0,25}(сегодня|дня)|сегодняшн/.test(t)) return "today";
  if (/(акци|распродаж)/.test(t)) return "promos";
  if (/(воронк|конверси)/.test(t)) return "funnel";
  if (/((кто|что|какие|какой|какая|топ).{0,30}(оборот|выручк|продает|лучш|основн))|(основн\w+.{0,20}оборот)|топ товар|лучш\w+ товар/.test(t)) return "top";
  if (/(реклам|кампани|дрр)/.test(t)) return "ads";
  if (/(остат|заканчива|закончил|мало (на )?склад)/.test(t) && !/(цен|стоит)/.test(t)) return "stock";
  if (/(цен[аыуе]|стоит|стоимост|сколько стоит|остаток|в наличии)/.test(t)) return "product";
  return null;
}

const STOP = new Set(["цена", "цены", "цену", "на", "у", "меня", "сколько", "стоит", "стоимость", "остаток", "остатки", "шт", "штук", "штуки", "в", "наличии", "какая", "какой", "сейчас", "подскажи", "скажи", "мне", "товар", "товара", "для", "по", "и", "а", "это", "эта", "этот", "ли"]);

/** Слова для поиска товара: убираем служебные, числа и «л», «литров» оставляем: по ним различаются размеры. */
export function productQueryTokens(raw: string): string[] {
  return raw
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/(\d+)\s*(л|литр[а-я]*)(?![а-я])/g, "$1л")
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .split(" ")
    .filter((w) => w && !STOP.has(w) && (w.length > 1 || /\d/.test(w)));
}

/** Корень слова для поиска («строительное» ≈ «строительный»): первые 5 букв. */
const stem = (w: string) => (/^\d/.test(w) ? w : w.slice(0, Math.max(4, Math.min(6, w.length - 2))));

export function findProducts(snapshot: SellerCatalogSnapshot, raw: string, limit = 3): Array<{ nmId: string; score: number }> {
  const tokens = productQueryTokens(raw);
  if (tokens.length === 0) return [];
  const rows = snapshot.items
    .map((item) => {
      const hay = `${item.title} ${item.vendorCode ?? ""} ${item.brand ?? ""}`.toLowerCase().replace(/ё/g, "е").replace(/(\d+)\s*(л|литр[а-я]*)(?![а-я])/g, "$1л");
      const hits = tokens.filter((tok) => hay.includes(stem(tok))).length;
      return { nmId: String(item.externalId), score: hits / tokens.length };
    })
    .filter((r) => r.score >= 0.6)
    .sort((a, b) => b.score - a.score);
  const best = rows[0]?.score ?? 0;
  return rows.filter((r) => r.score >= best - 0.01).slice(0, limit);
}

function dayText(snapshot: SellerCatalogSnapshot, dayKey: string, label: string, nowMs: number, partial: boolean): string {
  const point = snapshot.analytics?.daily?.find((d) => d.date.slice(0, 10) === dayKey);
  const fbs = snapshot.orders;
  const head = header("🛒", `Заказы ${label}`, partial ? "день ещё не закончился, цифры вырастут" : undefined);
  if (!point) return `${head}\n\nВ выгрузке нет данных за этот день.${fbs && label === "сегодня" ? `\n\n📦 Новых заказов на сборку: ${bold(fmtInt(fbs.newCount))}` : ""}`;
  const main = [stat("🛒", "Заказов", fmtInt(point.orders)), stat("💰", "На сумму", fmtRub(point.revenue))];
  if (point.orders > 0) main.push(stat("🧾", "Средний чек", fmtRub(point.revenue / point.orders)));
  const prevKey = mskDay(Date.parse(`${dayKey}T12:00:00Z`) - 86_400_000);
  const prev = snapshot.analytics?.daily?.find((d) => d.date.slice(0, 10) === prevKey);
  const blocks = [head, main.join("\n")];
  const side: string[] = [];
  if (prev) side.push(`📅 ${label === "сегодня" ? "Вчера" : "Днём ранее"}: ${fmtInt(prev.orders)} шт, ${fmtRub(prev.revenue)}`);
  if (label === "сегодня" && fbs) side.push(`📦 Новых заказов на сборку: ${bold(fmtInt(fbs.newCount))}`);
  if (label === "сегодня" && snapshot.comms) side.push(`💬 Без ответа: отзывов ${bold(fmtInt(snapshot.comms.unansweredFeedbacks))}, вопросов ${bold(fmtInt(snapshot.comms.unansweredQuestions))}`);
  if (side.length) blocks.push(quote(side.join("\n")));
  const synced = snapshot.syncedAt ? Date.parse(snapshot.syncedAt) : NaN;
  if (Number.isFinite(synced) && nowMs - synced > 3 * 3_600_000) blocks.push(italic("⚠️ Данные обновлялись давно, цифра может быть неточной."));
  return blocks.join("\n\n");
}

/** Ответ на частый вопрос про цифры. null: данных для ответа нет. */
/** События и новости за день или неделю. WB-вариант оставляет только то, что пришло от Wildberries: новости портала, тарифы, акции. */
function newsFact(intent: FactIntent, ctx: RenderCtx): string[] {
  const wbOnly = intent.startsWith("wb_");
  const period = intent.endsWith("yesterday") ? "yesterday" : intent.endsWith("today") ? "today" : "week";
  const today = mskDay(ctx.nowMs);
  const yesterday = mskDay(ctx.nowMs - 86_400_000);
  const fromWb = (e: RenderCtx["events"][number]) => e.group === "news" || e.kind.startsWith("news") || e.kind.startsWith("tariff") || e.kind.startsWith("promo") || e.kind === "access_lost";
  const rows = ctx.events.filter((e) => {
    const day = mskDay(Date.parse(e.createdAt));
    const inPeriod = period === "today" ? day === today : period === "yesterday" ? day === yesterday : ctx.nowMs - Date.parse(e.createdAt) < 7 * 86_400_000;
    return inPeriod && (!wbOnly || fromWb(e));
  });
  const label = period === "today" ? "сегодня" : period === "yesterday" ? "вчера" : "за неделю";
  if (rows.length === 0) return [`${header(wbOnly ? "🛍" : "🔔", wbOnly ? `Изменения Wildberries ${label}` : `События ${label}`)}\n\n${wbOnly ? "От Wildberries новостей и изменений нет." : "Событий нет."}`];
  const { blocks, total, shown } = eventBlocks(rows, ctx.nowMs, 12);
  const more = total > shown ? italic(`И ещё ${fmtInt(total - shown)} в KARTO`) : "";
  return packMessages([header(wbOnly ? "🛍" : "🔔", wbOnly ? `Что изменил Wildberries ${label}` : `События ${label}`, `${fmtInt(total)} шт.`), ...blocks, more, `👉 ${link("Открыть события в KARTO", ctx.url)}`]);
}

/** Ответ из базы знаний KARTO по вопросу: раздел статьи, который лучше всего подходит. null: подходящего нет. */
export function kbFact(text: string): string[] | null {
  const hit = searchSections(KB_ARTICLES, text, 2)[0];
  if (!hit || hit.score < 12) return null;
  const head = header("📖", clip(hit.article.title, 120), hit.heading ? clip(hit.heading, 100) : undefined);
  return packMessages([head, richTelegramHtml(clip(hit.snippet, 900)) || mdToTelegramHtml(clip(hit.snippet, 900)), italic("Из базы знаний KARTO")]);
}

/** Заказ ещё не собран: не отменён, не подтверждён к сборке и не передан в доставку. */
const isNewFbs = (o: { supplierStatus?: string; wbStatus?: string }) => {
  const supplier = o.supplierStatus ?? "";
  const wb = o.wbStatus ?? "";
  return supplier !== "confirm" && supplier !== "complete" && !supplier.startsWith("cancel") && !wb.startsWith("cancel") && wb !== "declined_by_client" && wb !== "sold" && wb !== "sorted" && wb !== "ready_for_pickup";
};

/** Новые заказы FBS: число и список того, что надо собрать. Остальные статусы не показываем: вопрос был про новые. */
export function fbsNewText(s: SellerCatalogSnapshot, nowMs: number, url: string): string[] {
  const o = s.orders;
  if (!o) return [`${header("📦", "Новые заказы FBS")}\n\nДанных по заказам FBS пока нет. Подождите минуту после подключения кабинета.`];
  const fresh = (o.orders ?? []).filter(isNewFbs).sort((a, b) => Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? ""));
  const count = o.newCount;
  if (count === 0) return [`${header("📦", "Новые заказы FBS", "ждут сборки")}\n\n✅ Новых заказов нет: всё, что пришло, уже в работе.`];
  const head = header("📦", `Новые заказы FBS: ${fmtInt(count)}`, "ждут сборки");
  const rows = fresh.slice(0, 8).map((r) => {
    const item = r.nmId != null ? s.items.find((i) => String(i.externalId) === String(r.nmId)) : undefined;
    const when = r.createdAt ? ago(r.createdAt, nowMs) : "";
    const meta = [r.price != null ? fmtRub(r.price) : "", when].filter(Boolean).join(" · ");
    return `🛍 ${bold(clip(item?.title ?? r.article ?? `Заказ ${r.externalId}`, 70))}${meta ? `\n${italic(meta)}` : ""}`;
  });
  const more = count > rows.length ? italic(`И ещё ${fmtInt(count - rows.length)} в KARTO`) : "";
  return packMessages([head, ...rows, more, `👉 ${link("Открыть заказы в KARTO", url)}`]);
}

export function factText(intent: FactIntent, text: string, ctx: RenderCtx): string[] {
  if (intent.startsWith("news_") || intent.startsWith("wb_")) return newsFact(intent, ctx);
  const s = ctx.snapshot;
  if (!s) return [`${header("📊", "Данные кабинета ещё не загружены")}\n\nПодключите кабинет Wildberries на сайте, и я смогу отвечать на такие вопросы.`];
  const today = mskDay(ctx.nowMs);
  if (intent === "fbs_new") return fbsNewText(s, ctx.nowMs, ctx.url);
  switch (intent) {
    default:
      return [];
    case "today":
      return [dayText(s, today, "сегодня", ctx.nowMs, true)];
    case "yesterday":
      return [dayText(s, mskDay(ctx.nowMs - 86_400_000), "вчера", ctx.nowMs, false)];
    case "promos":
      return [promosText(s, ctx.nowMs) ?? `${header("🏷", "Акции")}\n\nДанных пока нет.`];
    case "funnel":
    case "top":
    case "ads":
    case "stock": {
      const view = intent === "top" ? "products" : intent;
      const t = analyticsText({ type: "analytics", view, days: 28 } as Extract<ChatBlock, { type: "analytics" }>, ctx);
      return [t ?? `${header("📭", "Данных пока нет")}\n\nЭтот отчёт Wildberries ещё не загружен или недоступен для вашего кабинета.`];
    }
    case "product": {
      const found = findProducts(s, text);
      if (found.length === 0) return [`${header("🔎", "Не нашёл такой товар")}\n\nНазовите его точнее: название, размер или артикул, например «цена на ведро 10 л».`];
      const lines = found.map((f) => productLine(s, f.nmId)).filter((x): x is string => Boolean(x));

      return packMessages([...(found.length > 1 ? [header("🔎", "Нашёл несколько подходящих товаров")] : []), ...lines]);
    }
  }
}

export { escapeHtml, clip, fmtPct };
