import { ACTION_LABEL } from "./action-labels";
import type { ActionLogRow } from "./client-api";
import type { HubJournalEntry } from "./journal";
import type { OrderRun } from "./orders/types";
import type { Strategy, StrategyState } from "./agent/strategy";

/**
 * Единый журнал для страницы «Журнал»: действия в кабинете (серверный журнал), запуски поручений и записи, сохранённые в браузере.
 * Здесь только сборка и подсчёт. Все числа берутся из записей, ничего не выдумывается.
 */

export type JournalArea = "ads" | "prices" | "comms" | "stocks" | "orders" | "plans" | "other";
export type JournalTone = "ok" | "danger" | "test" | "info";
export type JournalIcon = "wallet" | "pause" | "play" | "ban" | "bid" | "plus" | "package-minus" | "package-plus" | "layout" | "gauge" | "truck" | "x-circle" | "tag" | "boxes" | "bell" | "flask" | "alert" | "flag" | "check" | "message" | "scroll";

/** Значок по смыслу действия: пополнение, пауза, ставка, цена и так далее. */
export function iconForAction(action: string): JournalIcon {
  const a = action.replace(/^autopilot_/, "");
  if (a.includes("deposit")) return "wallet";
  if (a === "ad_pause" || a === "pause") return "pause";
  if (a === "ad_start" || a === "start" || a === "resume") return "play";
  if (a.includes("minus")) return "ban";
  if (a.includes("bid")) return "bid";
  if (a === "ad_create") return "plus";
  if (a.includes("remove_nm")) return "package-minus";
  if (a.includes("add_nm")) return "package-plus";
  if (a.includes("placements")) return "layout";
  if (a.includes("daily_limit")) return "gauge";
  if (a.startsWith("supply")) return "truck";
  if (a === "order_cancel") return "x-circle";
  if (a === "price_update") return "tag";
  if (a === "stock_update") return "boxes";
  return "scroll";
}

export type JournalWho = "Вы" | "Агент" | "Поручение";

export type JournalItem = {
  id: string;
  at: string;
  area: JournalArea;
  icon: JournalIcon;
  title: string;
  /** Одна строка под заголовком: о чём именно (товар, кампания, сумма). */
  detail: string;
  tone: JournalTone;
  who: JournalWho;
  nmId?: string;
  orderId?: string;
  /** Строки «название: значение» для раскрытой записи. */
  facts: Array<{ label: string; value: string }>;
  /** Сумма пополнения рекламы, если запись о нём и оно прошло. */
  depositRub?: number;
  /** Запись о реальном изменении цены. */
  priceChange?: boolean;
};

export const AREA_LABEL: Record<JournalArea, string> = { ads: "Реклама", prices: "Цены", comms: "Отзывы", stocks: "Склад", orders: "Поручения", plans: "Планы", other: "Другое" };

const rub = (n: number) => `${Math.round(n).toLocaleString("ru-RU")} ₽`;
const friendly = (message: string) => (/fetch failed|network|timeout|ECONN/i.test(message) ? "связь оборвалась, действие не выполнено" : message);

export type JournalPlan = { id: string; title: string; nmId?: string | null; strategy?: Strategy | null; state?: StrategyState | null };

export type JournalSources = {
  actions: ActionLogRow[];
  /** Принятые планы: принятие, отметки шагов, пауза и итог становятся записями журнала. */
  plans?: JournalPlan[];
  runs: OrderRun[];
  local: HubJournalEntry[];
  /** nm → название товара. */
  titles: Map<string, string>;
  /** id кампании → название. */
  campaigns: Map<string, string>;
  /** id поручения → название. */
  orderTitles: Map<string, string>;
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

function fromAction(row: ActionLogRow, src: JournalSources): JournalItem {
  const r = (row.request && typeof row.request === "object" ? row.request : {}) as Record<string, unknown>;
  const nm = row.nm_id != null ? String(row.nm_id) : null;
  const product = nm ? src.titles.get(nm) ?? `товар ${nm}` : null;
  const campaignId = row.target_id != null ? String(row.target_id) : null;
  const campaign = campaignId ? src.campaigns.get(campaignId) ?? `кампания ${campaignId}` : null;
  const facts: JournalItem["facts"] = [];
  if (campaign) facts.push({ label: "Кампания", value: campaign });
  if (product) facts.push({ label: "Товар", value: nm ? `${product} (nm ${nm})` : product });
  const sum = num(r.sum);
  if (sum != null) facts.push({ label: "Сумма", value: rub(sum) });
  const bid = num(r.bid);
  if (bid != null) facts.push({ label: "Ставка", value: rub(bid) });
  const from = num(r.from);
  const to = num(r.to);
  if (from != null && to != null) facts.push({ label: "Цена до скидки", value: `${rub(from)} → ${rub(to)}` });
  const count = num(r.count);
  if (count != null) facts.push({ label: "Позиций", value: String(count) });
  const rule = typeof r.rule === "string" ? r.rule : "";
  const orderId = rule.startsWith("order:") ? rule.slice(6) : undefined;
  if (orderId) facts.push({ label: "По поручению", value: src.orderTitles.get(orderId) ?? "поручение" });
  const failed = row.result === "error";
  if (row.message) facts.push({ label: failed ? "Что ответил Wildberries" : "Комментарий", value: failed ? friendly(row.message) : row.message });
  const detailParts = [campaign, product, sum != null ? rub(sum) : null, from != null && to != null ? `${rub(from)} → ${rub(to)}` : null, bid != null ? `ставка ${rub(bid)}` : null].filter(Boolean) as string[];
  const area: JournalArea = row.agent;
  return {
    id: `a-${row.id}`,
    at: row.created_at,
    area,
    icon: iconForAction(row.action),
    title: ACTION_LABEL[row.action] ?? row.action,
    detail: failed && row.message ? `${detailParts.join(" · ")}${detailParts.length ? ". " : ""}Не выполнено: ${friendly(row.message)}` : detailParts.join(" · "),
    tone: failed ? "danger" : row.result === "ok" ? "ok" : "info",
    who: orderId ? "Поручение" : row.initiator === "agent" ? "Агент" : "Вы",
    ...(nm ? { nmId: nm } : {}),
    ...(orderId ? { orderId } : {}),
    facts,
    ...(row.action.endsWith("deposit") && row.result === "ok" && sum != null ? { depositRub: sum } : {}),
    ...(row.action === "price_update" && row.result === "ok" ? { priceChange: true } : {}),
  };
}

/** «999549867: 933 → 886 ₽» в тексте запуска: заменяем номер товара названием. */
const withTitles = (text: string, titles: Map<string, string>) => text.replace(/(?<!\d)(\d{6,12})(?=:)/g, (id) => titles.get(id) ?? id);

/** Делит текст запуска на смысл и ряд «заказы по дням», чтобы ряд показать отдельной строкой подробностей. */
function splitSeries(text: string): { text: string; series: string | null } {
  const m = text.match(/[\s(]*[Зз]аказов по дням:\s*([^)]*?)\)?\.?\s*$/);
  if (!m || m.index == null) return { text, series: null };
  const pairs = [...m[1]!.matchAll(/(\d{2}\.\d{2}):\s*(\d+)/g)].map((x) => `${x[1]} — ${x[2]}`);
  if (pairs.length === 0) return { text, series: null };
  const head = text.slice(0, m.index).replace(/[\s,:;(]+$/, "");
  return { text: /[.!?»]$/.test(head) ? head : `${head}.`, series: pairs.join(" · ") };
}

function fromRun(run: OrderRun, src: JournalSources): JournalItem {
  const tone: JournalTone = run.status === "failed" ? "danger" : run.status === "simulated" ? "test" : run.status === "done" ? "ok" : "info";
  const title = run.status === "reminder" ? "Напоминание" : run.status === "simulated" ? "Тестовый запуск" : run.status === "failed" ? "Ошибка поручения" : "Поручение выполнено";
  const { text, series } = splitSeries(withTitles(run.summary, src.titles));
  const facts: JournalItem["facts"] = [{ label: "Поручение", value: run.orderTitle ?? src.orderTitles.get(run.orderId) ?? "поручение" }, { label: "Что произошло", value: text }, ...(series ? [{ label: "Заказов по дням", value: series }] : [])];
  return { id: `r-${run.id}`, at: run.at, area: "orders", icon: run.status === "reminder" ? "bell" : run.status === "simulated" ? "flask" : run.status === "failed" ? "alert" : "check", title: run.orderTitle ? `${title}: ${run.orderTitle}` : title, detail: text, tone, who: "Поручение", orderId: run.orderId, facts };
}

function fromPlan(plan: JournalPlan, src: JournalSources): JournalItem[] {
  const st = plan.state;
  if (!st || !st.acceptedAt) return [];
  const nm = plan.nmId ? String(plan.nmId) : undefined;
  const product = nm ? src.titles.get(nm) ?? `товар ${nm}` : null;
  const base = { area: "plans" as const, icon: "flag" as JournalIcon, who: "Вы" as const, ...(nm ? { nmId: nm } : {}) };
  const facts = (extra: JournalItem["facts"] = []): JournalItem["facts"] => [{ label: "План", value: plan.title }, ...(product ? [{ label: "Товар", value: product }] : []), ...extra];
  const out: JournalItem[] = [];
  out.push({ ...base, id: `p-${plan.id}-accepted`, at: st.acceptedAt, title: "План принят", detail: plan.title, tone: "ok", facts: facts(plan.strategy ? [{ label: "Цель", value: plan.strategy.goal }] : []) });
  for (const [idx, mark] of Object.entries(st.humanSteps ?? {})) {
    const step = plan.strategy?.steps[Number(idx)]?.step ?? "шаг плана";
    out.push({ ...base, id: `p-${plan.id}-step-${idx}`, at: mark.at, icon: (mark.status === "done" ? "check" : "x-circle") as JournalIcon, title: mark.status === "done" ? "Шаг плана: сделано" : "Шаг плана: пропущено", detail: `${step}`, tone: "info", facts: facts([{ label: "Шаг", value: step }]) });
  }
  if (st.pausedAt) out.push({ ...base, id: `p-${plan.id}-paused`, at: st.pausedAt, icon: "pause" as JournalIcon, title: "План на паузе", detail: plan.title, tone: "info", facts: facts() });
  if (st.resolvedAt && (st.status === "worked" || st.status === "not_worked" || st.status === "observed")) {
    const title = st.status === "worked" ? "План сработал" : st.status === "not_worked" ? "План не сработал" : "Наблюдение по плану завершено";
    out.push({ ...base, id: `p-${plan.id}-done`, at: st.resolvedAt, icon: (st.status === "worked" ? "check" : st.status === "not_worked" ? "x-circle" : "flag") as JournalIcon, title, detail: st.reason ? `${plan.title}. ${st.reason}` : plan.title, tone: st.status === "worked" ? "ok" : st.status === "not_worked" ? "danger" : "info", facts: facts(st.reason ? [{ label: "Почему", value: st.reason }] : []) });
  }
  return out;
}

function fromLocal(e: HubJournalEntry): JournalItem {
  const t = `${e.title} ${e.detail}`.toLowerCase();
  const area: JournalArea = /цен|скид/.test(t) ? "prices" : /реклам|кампан|ставк/.test(t) ? "ads" : /отзыв|вопрос/.test(t) ? "comms" : /остат|склад|постав/.test(t) ? "stocks" : "other";
  const icon: JournalIcon = area === "prices" ? "tag" : area === "ads" ? "wallet" : area === "comms" ? "message" : area === "stocks" ? "boxes" : "scroll";
  return { id: `l-${e.id}`, at: e.at, area, icon, title: e.title, detail: e.detail, tone: "ok", who: e.actor === "user" ? "Вы" : "Агент", facts: e.detail ? [{ label: "Подробности", value: e.detail }] : [] };
}

/**
 * Собирает все записи по убыванию времени. Выполненные запуски поручений не дублируем: само действие уже есть в журнале действий.
 * Пропущенные запуски («условие не наступило») в журнал не попадают.
 */
export function buildJournal(src: JournalSources): JournalItem[] {
  const items = [
    ...src.actions.map((a) => fromAction(a, src)),
    ...src.runs.filter((r) => r.status === "reminder" || r.status === "simulated" || r.status === "failed").map((r) => fromRun(r, src)),
    ...src.local.map(fromLocal),
    ...(src.plans ?? []).flatMap((p) => fromPlan(p, src)),
  ];
  return items.sort((a, b) => b.at.localeCompare(a.at));
}

export type JournalPeriod = "today" | "7" | "30" | "all";

export function inPeriod(item: JournalItem, period: JournalPeriod, nowMs: number): boolean {
  if (period === "all") return true;
  const t = Date.parse(item.at);
  if (!Number.isFinite(t)) return false;
  if (period === "today") return new Date(t).toLocaleDateString("sv-SE") === new Date(nowMs).toLocaleDateString("sv-SE");
  return nowMs - t <= Number(period) * 86_400_000;
}

export type JournalStats = { total: number; ok: number; errors: number; depositRub: number; priceChanges: number };

export function journalStats(items: JournalItem[]): JournalStats {
  return {
    total: items.length,
    ok: items.filter((i) => i.tone === "ok").length,
    errors: items.filter((i) => i.tone === "danger").length,
    depositRub: items.reduce((a, i) => a + (i.depositRub ?? 0), 0),
    priceChanges: items.filter((i) => i.priceChange).length,
  };
}

export function matchesQuery(item: JournalItem, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return `${item.title} ${item.detail} ${item.facts.map((f) => f.value).join(" ")}`.toLowerCase().includes(needle);
}
