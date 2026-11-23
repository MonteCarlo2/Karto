import { bold, clip, escapeHtml, fmtInt, header, italic, link, packMessages, paragraphs, quote } from "@/lib/telegram/format";
import type { SellerProductEvent } from "@/lib/seller-hub/event-engine/types";
import type { SellerTask } from "@/lib/seller-hub/task-engine/types";
import { taskDisplayTitle } from "@/lib/seller-hub/task-engine/story";
import type { NotifyCategory, NotifySeverity } from "./prefs";

/**
 * Уведомление в одном виде для всех источников (событие, срочная задача, результат агента, срок токена) и его оформление для Telegram.
 * Текст собирается только из экранированных частей: сообщение не ломается от символов в названиях и отзывах, теги всегда парные.
 */

export type NotifyItem = {
  /** Уникален в пределах пользователя: по нему отсекаются повторы. */
  dedupeKey: string;
  category: NotifyCategory;
  severity: NotifySeverity;
  title: string;
  body: string;
  /** Подпись под заголовком: товар или название поручения. */
  subject?: string | null;
  at: string;
};

const SEV_ICON: Record<NotifySeverity, string> = { critical: "🔴", important: "🟠", info: "🔹" };
const CATEGORY_ICON: Record<NotifyCategory, string> = { event: "🔔", task: "📌", agent: "🤖", token: "🔑" };
const SEV_LABEL: Record<NotifySeverity, string> = { critical: "Срочно", important: "Важно", info: "К сведению" };
const CATEGORY_LABEL: Record<NotifyCategory, string> = { event: "Событие", task: "Срочная задача", agent: "Агент", token: "Токен Wildberries" };

export function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://karto.pro").replace(/\/$/, "");
}

export function itemFromEvent(e: SellerProductEvent): NotifyItem {
  return { dedupeKey: `event:${e.id}`, category: e.kind === "token_expiring" ? "token" : "event", severity: e.severity, title: e.title, body: e.detail, subject: e.productTitle, at: e.createdAt };
}

export function itemFromTask(t: SellerTask): NotifyItem {
  return { dedupeKey: `task:${t.id}:${t.createdAt}`, category: "task", severity: "critical", title: taskDisplayTitle(t), body: t.description || t.recommendation, subject: t.productTitle, at: t.createdAt };
}

export function itemFromRun(run: { id: string; orderTitle: string; status: "done" | "simulated" | "failed" | "reminder" | "skipped"; summary: string; at: string }): NotifyItem | null {
  if (run.status === "skipped") return null;
  const title = run.status === "reminder" ? `Напоминание: ${run.orderTitle}` : run.status === "failed" ? `Поручение не выполнено: ${run.orderTitle}` : run.status === "simulated" ? `Проверка поручения: ${run.orderTitle}` : `Поручение выполнено: ${run.orderTitle}`;
  return { dedupeKey: `run:${run.id}`, category: "agent", severity: run.status === "failed" ? "important" : "info", title, body: run.summary, subject: null, at: run.at };
}

export function itemFromPlanFinished(plan: { id: string; title: string; worked: boolean | null; resolvedAt: string }): NotifyItem {
  const verdict = plan.worked === true ? "План сработал" : plan.worked === false ? "План не дал результата" : "План завершён";
  return { dedupeKey: `plan:${plan.id}:${plan.resolvedAt}`, category: "agent", severity: "info", title: `${verdict}: ${plan.title}`, body: "Итог и цифры «было → стало» смотрите в разделе «Агенты».", subject: null, at: plan.resolvedAt };
}

/** Одно уведомление: крупный заголовок, под ним важность и раздел, суть короткими абзацами в цитате, ссылка. Длина ограничена заранее. */
export function telegramBlock(item: NotifyItem, openUrl: string): string {
  const parts = [`${SEV_ICON[item.severity]} ${bold(clip(item.title, 160))}`, italic(`${SEV_LABEL[item.severity]} · ${CATEGORY_ICON[item.category]} ${CATEGORY_LABEL[item.category]}`)];
  const subject = item.subject ? `🛍 ${bold(clip(item.subject, 80))}` : "";
  const body = paragraphs(clip(item.body, 420), 3);
  const inner = [subject, body].filter(Boolean).join("\n\n");
  if (inner) parts.push(quote(inner));
  parts.push(`👉 ${link("Открыть в KARTO", openUrl)}`);
  return parts.join("\n\n");
}

/** Сообщение и, если по нему можно спросить агента, код записи очереди для кнопки «Спросить агента». */
export type NotifyMessage = { html: string; askId?: string };

/** Те же сообщения, но с кодом для кнопки: только у одиночных карточек событий и задач, у сводки и служебных (агент, токен) кнопки нет. */
export function telegramCards(items: NotifyItem[], openUrl: string): NotifyMessage[] {
  if (items.length === 0) return [];
  if (items.length > 3) return telegramMessages(items, openUrl).map((html) => ({ html }));
  return items.map((i) => ({ html: telegramBlock(i, openUrl), ...((i.category === "event" || i.category === "task") && /^\d+$/.test(i.dedupeKey) ? { askId: i.dedupeKey } : {}) }));
}

/** До трёх уведомлений идут отдельными карточками, больше собираются в одну сводку списком. */
export function telegramMessages(items: NotifyItem[], openUrl: string): string[] {
  if (items.length === 0) return [];
  if (items.length <= 3) return items.map((i) => telegramBlock(i, openUrl));
  const head = header("🔔", `Новое в KARTO: ${fmtInt(items.length)}`, "коротко о главном");
  const rows = items.slice(0, 15).map((i) => `${SEV_ICON[i.severity]} ${escapeHtml(clip(i.title, 110))}`);
  const rest = items.length > 15 ? italic(`И ещё ${fmtInt(items.length - 15)} в KARTO`) : "";
  return packMessages([head, rows.join("\n\n"), rest, `👉 ${link("Открыть в KARTO", openUrl)}`]);
}
