import { bold, clip, escapeHtml, fmtInt, fmtPct, fmtRub, header, italic, link, packMessages, paragraphs, quote, stat } from "./format";
import { storeBuyoutFromFunnel } from "@/lib/seller-hub/buyout";
import { buildStockAnalytics } from "@/lib/seller-hub/stock-analytics";
import { isActionableTask } from "@/lib/seller-hub/task-engine/lifecycle";
import { compareByPriority } from "@/lib/seller-hub/task-engine/priority";
import { taskDisplayTitle } from "@/lib/seller-hub/task-engine/story";
import type { SellerTask } from "@/lib/seller-hub/task-engine/types";
import type { SellerProductEvent } from "@/lib/seller-hub/event-engine/types";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";

/**
 * Тексты ответов Telegram-помощника: «Сводка», «Задачи», «События», «Планы», «Поручения», «Отзывы». Только чтение настоящих данных кабинета, ничего не выдумано.
 * Все данные проходят экранирование, поэтому сообщение не ломается от символов в названиях товаров.
 */

const SEV_ICON = { critical: "🔴", important: "🟠", opportunity: "🟢" } as const;
const EV_ICON = { critical: "🔴", important: "🟠", info: "🔹" } as const;

export type PlanRow = { title: string; reviewAfterDays?: number | null; state: { status?: string; acceptedAt?: string; pausedAt?: string; scheduledStartAt?: string; resolvedAt?: string } | null };
export type OrderRow = { title: string; status: string; nextRunAt: string | null };

const MSK = 3 * 3_600_000;
const pad = (n: number) => String(n).padStart(2, "0");

/** «сегодня 15:00», «завтра 09:30» или «23.11 09:30» по Москве. */
export function whenMsk(iso: string | null | undefined, nowMs: number): string {
  const t = Date.parse(iso ?? "");
  if (!Number.isFinite(t)) return "—";
  const d = new Date(t + MSK);
  const day = (ms: number) => new Date(ms + MSK).toISOString().slice(0, 10);
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  if (day(t) === day(nowMs)) return `сегодня ${time}`;
  if (day(t) === day(nowMs + 86_400_000)) return `завтра ${time}`;
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)} ${time}`;
}

export function ago(iso: string, nowMs: number): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const min = Math.max(0, Math.round((nowMs - t) / 60_000));
  if (min < 1) return "только что";
  if (min < 60) return `${min} мин назад`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} ч назад`;
  const days = Math.round(h / 24);
  return days === 1 ? "вчера" : `${days} дн. назад`;
}

const actionable = (tasks: SellerTask[], nowMs: number) => tasks.filter((t) => isActionableTask(t, nowMs)).sort(compareByPriority);

export function summaryText(snapshot: SellerCatalogSnapshot | null, tasks: SellerTask[], nowMs: number): string[] {
  if (!snapshot) return [`${header("📊", "Данные кабинета ещё не загружены")}\n\nПодключите кабинет Wildberries в разделе «Кабинет и API», и здесь появится сводка.`];
  const a = snapshot.analytics;
  const days = a?.daily?.length ?? 0;
  const buyout = storeBuyoutFromFunnel(snapshot.funnel);
  const acts = actionable(tasks, nowMs);
  const crit = acts.filter((t) => t.severity === "critical").length;
  const age = snapshot.syncedAt ? ago(snapshot.syncedAt, nowMs) : "";
  const sub = [days ? `за ${days} дн.` : "", age ? `обновлено ${age}` : ""].filter(Boolean).join(" · ");
  const blocks = [header("📊", "Сводка по магазину", sub)];

  // Сегодня и вчера: день по Москве, данные из того же снимка, что и на сайте.
  const dayPoint = (ms: number) => a?.daily?.find((d) => (d.date ?? "").slice(0, 10) === MSK_DAY(ms));
  const today = dayPoint(nowMs);
  const yesterday = dayPoint(nowMs - 86_400_000);
  if (today || yesterday) {
    const lines = [bold("Сегодня и вчера")];
    if (today) lines.push(stat("🛒", "Сегодня", `${fmtInt(today.orders)} шт`, `на ${fmtRub(today.revenue)}`));
    if (yesterday) lines.push(stat("🗓", "Вчера", `${fmtInt(yesterday.orders)} шт`, `на ${fmtRub(yesterday.revenue)}`));
    blocks.push(lines.join("\n"));
  }

  const money: string[] = [bold(days ? `За ${days} дн.` : "За период")];
  if (a) {
    money.push(stat("💰", "Оборот", fmtRub(a.revenueTotal)));
    money.push(stat("🛒", "Заказов", fmtInt(a.ordersTotal), a.avgOrderValue != null ? `(чек ${fmtRub(a.avgOrderValue)})` : undefined));
  }
  if (buyout) money.push(stat("✅", "Выкуп", fmtPct(buyout.percent), `(${fmtInt(buyout.buyouts)} из ${fmtInt(buyout.completed)})`));
  const spend = (snapshot.adsStats?.campaigns ?? []).reduce((sum, c) => sum + (c.spend || 0), 0);
  const adSum = (snapshot.adsStats?.campaigns ?? []).reduce((sum, c) => sum + (c.orderSum || 0), 0);
  if (spend > 0) money.push(stat("📣", "Реклама", fmtRub(spend), adSum > 0 ? `(ДРР ${fmtPct((spend / adSum) * 100, 1)})` : undefined));
  if (snapshot.finance?.available && snapshot.finance.balance != null) money.push(stat("🏦", "На счёте", fmtRub(snapshot.finance.balance)));
  if (money.length > 1) blocks.push(money.join("\n"));

  const work: string[] = [];
  if (snapshot.orders) work.push(`📦 Заказы FBS (со склада продавца): ${bold(fmtInt(snapshot.orders.newCount))} новых ждут сборки, ${bold(fmtInt(snapshot.orders.inDelivery))} уже переданы в доставку (за последние дни)`);
  if (snapshot.comms) work.push(`💬 Ждут вашего ответа: ${bold(fmtInt(snapshot.comms.unansweredFeedbacks))} отзывов, ${bold(fmtInt(snapshot.comms.unansweredQuestions))} вопросов`);
  const stock = buildStockAnalytics(snapshot.stocksReport, snapshot.items);
  if (stock && stock.summary.out + stock.summary.low > 0) work.push(`⚠️ Заканчивается: ${bold(fmtInt(stock.summary.out + stock.summary.low))} ${stock.summary.out > 0 ? `(закончились: ${fmtInt(stock.summary.out)})` : ""}`.trim());
  work.push(`📌 Задач в работе: ${bold(fmtInt(acts.length))}${crit > 0 ? `, из них срочных ${bold(fmtInt(crit))}` : ""}`);
  blocks.push(`${bold("Что требует внимания сейчас")}\n${quote(work.join("\n"))}`);
  return packMessages(blocks);
}

export function tasksText(tasks: SellerTask[], nowMs: number, openUrl: string): string[] {
  const acts = actionable(tasks, nowMs);
  if (acts.length === 0) return [`${header("📌", "Задачи", "всё спокойно")}\n\n✅ Срочного нет: задач, требующих действий, сейчас нет.`];
  const shown = acts.slice(0, 7);
  const rows = shown.map((t) => {
    const product = t.productTitle ? `\n${italic(clip(t.productTitle, 70))}` : "";
    return `${SEV_ICON[t.severity]} ${bold(clip(taskDisplayTitle(t), 100))}${product}`;
  });
  const more = acts.length > shown.length ? italic(`И ещё ${fmtInt(acts.length - shown.length)} в KARTO`) : "";
  return packMessages([header("📌", `Задачи в работе: ${fmtInt(acts.length)}`, "сначала самое важное"), ...rows, more, `👉 ${link("Открыть задачи в KARTO", openUrl)}`]);
}

const MSK_DAY = (ms: number) => new Date(ms + MSK).toISOString().slice(0, 10);

/** Метка дня для группы событий: «Сегодня», «Вчера» или дата. */
function dayLabel(iso: string, nowMs: number): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "Раньше";
  if (MSK_DAY(t) === MSK_DAY(nowMs)) return "Сегодня";
  if (MSK_DAY(t) === MSK_DAY(nowMs - 86_400_000)) return "Вчера";
  const d = new Date(t + MSK);
  return `${d.getUTCDate()} ${["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"][d.getUTCMonth()]}`;
}

/** События группами по дням: у каждого заголовок, время, товар и пояснение цитатой. Заголовок дня идёт вместе с первым событием, чтобы не остаться один при переносе. */
export function eventBlocks(events: SellerProductEvent[], nowMs: number, limit = 6): { blocks: string[]; total: number; shown: number } {
  const fresh = events.filter((e) => e.kind !== "sync_completed").sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const shown = fresh.slice(0, limit);
  const blocks: string[] = [];
  let current = "";
  for (const e of shown) {
    const label = dayLabel(e.createdAt, nowMs);
    const when = Date.parse(e.createdAt);
    const time = Number.isFinite(when) ? `${pad(new Date(when + MSK).getUTCHours())}:${pad(new Date(when + MSK).getUTCMinutes())}` : "";
    const meta = [time ? `🕒 ${time}` : "", ago(e.createdAt, nowMs), e.productTitle ? clip(e.productTitle, 60) : ""].filter(Boolean).join(" · ");
    const detail = e.detail ? quote(paragraphs(clip(e.detail, 200), 2)) : "";
    const row = [`${EV_ICON[e.severity]} ${bold(clip(e.title, 100))}\n${italic(meta)}`, detail].filter(Boolean).join("\n\n");
    blocks.push(label !== current ? `🗓 ${bold(label)}\n\n${row}` : row);
    current = label;
  }
  return { blocks, total: fresh.length, shown: shown.length };
}

export function eventsText(events: SellerProductEvent[], nowMs: number, openUrl: string): string[] {
  const { blocks, total, shown } = eventBlocks(events, nowMs);
  if (blocks.length === 0) return [`${header("🔔", "События", "тишина")}\n\nНовых событий пока нет.`];
  const more = total > shown ? italic(`И ещё ${fmtInt(total - shown)} в KARTO`) : "";
  return packMessages([header("🔔", "Последние события", `${fmtInt(total)} шт.`), ...blocks, more, `👉 ${link("Открыть события в KARTO", openUrl)}`]);
}

export function plansText(plans: PlanRow[], nowMs: number): string[] {
  const live = plans.filter((p) => p.state && p.state.acceptedAt && !p.state.resolvedAt);
  if (live.length === 0) return [`${header("🧭", "Планы", "пока пусто")}\n\nСейчас нет планов в работе. Создавать и принимать планы можно на сайте, в разделе «Агенты».`];
  const rows = live.slice(0, 8).map((p) => {
    const st = p.state!;
    const started = Date.parse(st.acceptedAt ?? "");
    const day = Number.isFinite(started) ? Math.max(1, Math.floor((nowMs - started) / 86_400_000) + 1) : null;
    const icon = st.pausedAt ? "⏸" : st.status === "scheduled" ? "⏰" : "▶️";
    const status = st.pausedAt ? "на паузе" : st.status === "scheduled" ? `стартует ${whenMsk(st.scheduledStartAt, nowMs)}` : day ? `идёт, ${day}-й день` : "идёт";
    // Когда подведём итог: день принятия плюс срок плана. На паузе срок сдвигается, поэтому дату не обещаем.
    const endMs = Number.isFinite(started) && p.reviewAfterDays && !st.pausedAt ? started + p.reviewAfterDays * 86_400_000 : null;
    const end = endMs ? italic(endMs > nowMs ? `итог подведём ${new Date(endMs + MSK).toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" })} (через ${Math.max(1, Math.ceil((endMs - nowMs) / 86_400_000))} дн.)` : "срок вышел, итог подводится") : "";
    return [`${icon} ${bold(clip(p.title, 100))}`, escapeHtml(status), end].filter(Boolean).join("\n");
  });
  return packMessages([header("🧭", `Планы в работе: ${fmtInt(live.length)}`), ...rows]);
}

export function ordersText(orders: OrderRow[], nowMs: number): string[] {
  const active = orders.filter((o) => o.status === "active");
  if (active.length === 0) return [`${header("🤖", "Поручения", "пока пусто")}\n\nАктивных поручений нет. Поручения создаются на сайте или в чате агента.`];
  const rows = active
    .sort((a, b) => Date.parse(a.nextRunAt ?? "") - Date.parse(b.nextRunAt ?? ""))
    .slice(0, 8)
    .map((o) => `🤖 ${bold(clip(o.title, 100))}\n${italic(o.nextRunAt ? `⏰ следующий запуск ${whenMsk(o.nextRunAt, nowMs)}` : "без расписания")}`);
  return packMessages([header("🤖", `Поручения агента: ${fmtInt(active.length)}`, "работают по расписанию"), ...rows]);
}

export function reviewsText(snapshot: SellerCatalogSnapshot | null, openUrl: string): string[] {
  const c = snapshot?.comms;
  if (!c) return [`${header("💬", "Отзывы и вопросы")}\n\nДанных пока нет: подключите кабинет и дождитесь загрузки.`];
  const total = c.unansweredFeedbacks + c.unansweredQuestions;
  const body = total === 0 ? "✅ Всё отвечено, ничего не ждёт." : [stat("⭐", "Отзывов без ответа", fmtInt(c.unansweredFeedbacks)), stat("❓", "Вопросов без ответа", fmtInt(c.unansweredQuestions))].join("\n");
  return packMessages([header("💬", "Отзывы и вопросы", total === 0 ? "порядок" : "ждут ответа"), body, `👉 ${link("Открыть отзывы в KARTO", openUrl)}`]);
}

export const HELP_TEXT = [
  header("🤖", "KARTO на связи", "Ваш помощник по Wildberries"),
  [
    `📊 ${bold("Знаю ваш магазин")}\nЗаказы, выручка, остатки, реклама, отзывы, задачи: отвечаю по свежим данным.`,
    `⚡ ${bold("Делаю по просьбе")}\nЦена и скидка, пауза и запуск рекламы, пополнение бюджета. Всегда показываю «было → станет» и жду вашего «Подтвердить». Большинство действий можно отменить.`,
    `🔔 ${bold("Сообщаю сам")}\nСрочные события, задачи, итоги планов, срок токена.`,
  ].join("\n\n"),
  `${bold("Попробуйте")}\n${quote(["«сколько заказов сегодня»", "«какая воронка», «кто даёт оборот»", "«подними цену на ведро на 3%»", "«останови рекламу», «пополни бюджет»"].map(escapeHtml).join("\n"))}`,
  italic("Кнопки внизу открывают быстрые разделы. /new — начать разговор заново."),
].join("\n\n");

export const MENU_KEYBOARD: { keyboard: string[][]; resize_keyboard: boolean; is_persistent: boolean; input_field_placeholder?: string } = {
  keyboard: [["📊 Сводка", "📌 Задачи", "🔔 События"], ["🧭 Планы", "🤖 Поручения", "💬 Отзывы"]],
  resize_keyboard: true,
  // Не закреплена: человек сам сворачивает и разворачивает кнопки, Telegram их не навязывает.
  is_persistent: false,
  input_field_placeholder: "Спросите о магазине или дайте команду",
};

export type Intent = "summary" | "tasks" | "events" | "plans" | "orders" | "reviews" | "help" | "unknown";

/** Понимает команды, кнопки и простые вопросы своими словами. Без нейросети: ответ всегда из настоящих данных. */
export function detectIntent(raw: string): Intent {
  const t = raw.toLowerCase().replace(/[ё]/g, "е").replace(/[^\p{L}\p{N}/ ]+/gu, " ").replace(/\s+/g, " ").trim();
  if (!t) return "unknown";
  if (/^\/(start|help|menu|помощь|меню)\b/.test(t) || /(помощь|что умеешь|что ты умеешь|меню|команды|help)/.test(t)) return "help";
  if (/^\/(today|summary|kpi|svodka)\b/.test(t) || /(сводк|(^| )дела( |$)|оборот|выручк|продаж|показател|выкуп|средний чек|на счете|баланс)/.test(t)) return "summary";
  if (/^\/(tasks|task)\b/.test(t) || /(задач|срочн|что (мне )?(делать|сделать))/.test(t)) return "tasks";
  if (/^\/(events|news)\b/.test(t) || /(событи|новост|что нового|что случилось|что произошло)/.test(t)) return "events";
  if (/^\/(plans|plan)\b/.test(t) || /(план)/.test(t)) return "plans";
  if (/^\/(orders|order)\b/.test(t) || /(поручени|расписани)/.test(t)) return "orders";
  if (/^\/(reviews|review)\b/.test(t) || /(отзыв|вопрос)/.test(t)) return "reviews";
  if (/(заказ)/.test(t)) return "summary";
  return "unknown";
}

/** Только то, что нажато кнопкой или набрано командой: такие запросы отвечают сразу по готовым данным без агента. */
export function strictIntent(raw: string): Intent | null {
  const t = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (/^\/(start|help|menu|помощь|меню)(@\w+)?$/.test(t)) return "help";
  if (/^\/(today|summary|kpi|svodka)(@\w+)?$/.test(t)) return "summary";
  if (/^\/(tasks|task)(@\w+)?$/.test(t)) return "tasks";
  if (/^\/(events|news)(@\w+)?$/.test(t)) return "events";
  if (/^\/(plans|plan)(@\w+)?$/.test(t)) return "plans";
  if (/^\/(orders|order)(@\w+)?$/.test(t)) return "orders";
  if (/^\/(reviews|review)(@\w+)?$/.test(t)) return "reviews";
  const labels: Record<string, Intent> = { "📊 сводка": "summary", "📌 задачи": "tasks", "🔔 события": "events", "🧭 планы": "plans", "🤖 поручения": "orders", "💬 отзывы": "reviews", "помощь": "help" };
  return labels[t] ?? null;
}

export const UNKNOWN_TEXT = `${bold("Пока так не умею")}\nСпросите про сводку, задачи, события, планы, поручения или отзывы, либо нажмите кнопку ниже. Например: «как дела» или «что с задачами».`;
