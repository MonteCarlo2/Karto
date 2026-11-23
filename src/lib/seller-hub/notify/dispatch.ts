import type { SupabaseClient } from "@supabase/supabase-js";
import { sendHtmlSafe } from "@/lib/telegram/send-safe";
import { fetchTelegramLinkByUserId } from "@/lib/telegram/telegram-db";
import { assistantAllowed } from "@/lib/telegram/access";
import { appBaseUrl, telegramCards, type NotifyItem } from "./compose";
import { heldByQuiet, parseNotifyPrefs, wantsNotification, type NotifyPrefs } from "./prefs";

/**
 * Доставка уведомлений в Telegram. Источники (пересчёт событий и задач, запуски поручений, итоги планов, срок токена) кладут уведомление в очередь,
 * затем flush отправляет то, что подходит под настройки владельца. Повторов нет (уникальный ключ), ночью держим несрочное, сбои повторяем,
 * а если бот заблокирован, уведомления в этот чат выключаются, чтобы не слать в пустоту.
 */

const MARKETPLACE = "wildberries";
const STALE_MS = 24 * 3_600_000;
const MAX_ATTEMPTS = 5;
const BATCH = 50;

export type QueueRow = { id: number; category: NotifyItem["category"]; severity: NotifyItem["severity"]; title: string; body: string; subject: string | null; occurred_at: string; created_at: string; attempts: number };

export type DeliveryPlan = { send: QueueRow[]; hold: QueueRow[]; skip: Array<{ row: QueueRow; reason: string }> };

/** Что делать с накопившимися уведомлениями: отправить, задержать до конца тихих часов или отбросить. Чистая функция. */
export function planDelivery(rows: QueueRow[], prefs: NotifyPrefs, linkedAtMs: number, nowMs: number): DeliveryPlan {
  const plan: DeliveryPlan = { send: [], hold: [], skip: [] };
  for (const row of rows) {
    const at = Date.parse(row.occurred_at);
    if (!wantsNotification(prefs, row)) plan.skip.push({ row, reason: "выключено в настройках" });
    else if (Number.isFinite(at) && at < linkedAtMs) plan.skip.push({ row, reason: "до подключения Telegram" });
    else if (Number.isFinite(at) && nowMs - at > STALE_MS) plan.skip.push({ row, reason: "устарело" });
    else if (heldByQuiet(prefs, row, nowMs)) plan.hold.push(row);
    else plan.send.push(row);
  }
  return plan;
}

async function loadPrefs(db: SupabaseClient, userId: string): Promise<NotifyPrefs> {
  const { data } = await db.from("seller_hub_user_settings").select("setting_key, value").eq("user_id", userId).eq("marketplace_id", MARKETPLACE).like("setting_key", "notify.%");
  return parseNotifyPrefs((data ?? []) as Array<{ setting_key: string; value: unknown }>);
}

/** Кладёт уведомления в очередь. Тихо ничего не делает, если Telegram не подключён: лишних записей не копим. */
export async function enqueueNotifications(db: SupabaseClient, userId: string, items: NotifyItem[], nowMs = Date.now()): Promise<number> {
  if (items.length === 0 || !assistantAllowed(userId)) return 0;
  const link = await fetchTelegramLinkByUserId(db, userId);
  if (!link || link.notify_enabled === false) return 0;
  const prefs = await loadPrefs(db, userId);
  const linkedAt = Date.parse(link.linked_at);
  const rows = items
    .filter((i) => wantsNotification(prefs, i) && !(Number.isFinite(linkedAt) && Date.parse(i.at) < linkedAt) && nowMs - Date.parse(i.at) <= STALE_MS)
    .map((i) => ({ user_id: userId, dedupe_key: i.dedupeKey.slice(0, 200), category: i.category, severity: i.severity, title: i.title.slice(0, 400), body: i.body.slice(0, 1200), subject: i.subject?.slice(0, 200) ?? null, occurred_at: i.at }));
  if (rows.length === 0) return 0;
  const { error } = await db.from("seller_hub_notify_queue").upsert(rows, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true });
  if (error) {
    console.error("[notify] очередь не записалась:", error.message);
    return 0;
  }
  return rows.length;
}

export type FlushDeps = { send?: (chatId: number, text: string, askId?: string) => Promise<void> };

const defaultSend = async (chatId: number, text: string, askId?: string) => {
  await sendHtmlSafe({ chatId, html: text, ...(askId ? { replyMarkup: { inline_keyboard: [[{ text: "💬 Спросить агента", callback_data: `nq:${askId}` }]] } } : {}) });
};

/** Отправляет накопленное. Возвращает, сколько уведомлений ушло. */
export async function flushNotifications(db: SupabaseClient, userId: string, nowMs = Date.now(), deps: FlushDeps = {}): Promise<number> {
  const send = deps.send ?? defaultSend;
  const pending = await db.from("seller_hub_notify_queue").select("id, category, severity, title, body, subject, occurred_at, created_at, attempts").eq("user_id", userId).eq("status", "pending").order("occurred_at", { ascending: true }).limit(BATCH);
  const rows = (pending.data ?? []) as QueueRow[];
  if (pending.error || rows.length === 0) return 0;

  const link = await fetchTelegramLinkByUserId(db, userId);
  const markAll = async (ids: number[], status: "skipped" | "failed" | "sent", error?: string) => {
    if (ids.length === 0) return;
    await db.from("seller_hub_notify_queue").update({ status, last_error: error ?? null, ...(status === "sent" ? { sent_at: new Date(nowMs).toISOString() } : {}) }).in("id", ids);
  };
  if (!link || link.notify_enabled === false) {
    await markAll(rows.map((r) => r.id), "skipped", "Telegram не подключён");
    return 0;
  }

  const prefs = await loadPrefs(db, userId);
  const plan = planDelivery(rows, prefs, Date.parse(link.linked_at) || 0, nowMs);
  for (const [reason, group] of groupBy(plan.skip, (s) => s.reason)) await markAll(group.map((g) => g.row.id), "skipped", reason);
  if (plan.send.length === 0) return 0;

  const items: NotifyItem[] = plan.send.map((r) => ({ dedupeKey: String(r.id), category: r.category, severity: r.severity, title: r.title, body: r.body, subject: r.subject, at: r.occurred_at }));
  const messages = telegramCards(items, `${appBaseUrl()}/studio/seller-hub`);
  try {
    for (const m of messages) await send(link.chat_id, m.html, m.askId);
    await markAll(plan.send.map((r) => r.id), "sent");
    return plan.send.length;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Чат не начат: человек ещё не нажимал Start у этого бота (например, пришёл к другому боту). Не выключаем уведомления насовсем: после Start всё заработает.
    if (/chat not found|can't initiate conversation/i.test(message)) {
      await markAll(plan.send.map((r) => r.id), "skipped", "чат с ботом не начат: нажмите Start у бота");
      return 0;
    }
    if (/blocked by the user|bot was blocked|user is deactivated/i.test(message)) {
      await db.from("auto_reply_telegram_links").update({ notify_enabled: false }).eq("user_id", userId);
      await markAll(plan.send.map((r) => r.id), "skipped", "бот заблокирован в Telegram");
      return 0;
    }
    // Временный сбой: пробуем снова на следующем проходе, но не бесконечно.
    for (const row of plan.send) {
      await db.from("seller_hub_notify_queue").update({ attempts: row.attempts + 1, last_error: message.slice(0, 300), ...(row.attempts + 1 >= MAX_ATTEMPTS ? { status: "failed" } : {}) }).eq("id", row.id);
    }
    console.warn("[notify] Telegram не принял сообщение:", message);
    return 0;
  }
}

function groupBy<T>(rows: T[], key: (t: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of rows) out.set(key(r), [...(out.get(key(r)) ?? []), r]);
  return out;
}

/** Положить и сразу отправить: один вызов для источников. Сбой доставки никогда не ломает вызывающего. */
export async function notifyUser(db: SupabaseClient, userId: string, items: NotifyItem[], nowMs = Date.now()): Promise<void> {
  try {
    await enqueueNotifications(db, userId, items, nowMs);
    await flushNotifications(db, userId, nowMs);
  } catch (error) {
    console.warn("[notify] не отправилось:", error instanceof Error ? error.message : String(error));
  }
}
