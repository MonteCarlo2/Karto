import type { SupabaseClient } from "@supabase/supabase-js";
import { RETIRED_EVENT_KINDS, type SellerProductEvent } from "@/lib/seller-hub/event-engine/types";
import type { SellerTask } from "@/lib/seller-hub/task-engine/types";
import { openSellerHubWbToken, wbTokenExpiresAt } from "@/lib/seller-hub/wb-token";
import { supabaseSellerHubSecretDb } from "@/lib/seller-hub/wb-token-store";
import { tokenExpiryEvent } from "@/lib/seller-hub/token-expiry";
import { itemFromEvent, itemFromPlanFinished, itemFromRun, itemFromTask, type NotifyItem } from "./compose";
import { notifyUser } from "./dispatch";

/** Окно «новое»: события старше не отправляем, чтобы после перерыва сервера не прилетела старая лента. */
const FRESH_MS = 6 * 3_600_000;
const MAX_PER_PASS = 40;

/** Что из пересчёта нужно отправить: свежие события, срочные задачи, срок токена. Чистая функция. */
export function itemsFromDerive(input: { events: SellerProductEvent[]; tasks: SellerTask[]; tokenExpiresAt: string | null; nowMs: number }): NotifyItem[] {
  const { events, tasks, tokenExpiresAt, nowMs } = input;
  const out: NotifyItem[] = [];
  for (const e of events) {
    if (RETIRED_EVENT_KINDS.has(e.kind) || e.kind === "sync_completed") continue;
    if (nowMs - Date.parse(e.createdAt) > FRESH_MS) continue;
    out.push(itemFromEvent(e));
  }
  for (const t of tasks) {
    if (t.severity !== "critical") continue;
    if (t.status !== "active" && t.status !== "in_progress") continue;
    out.push(itemFromTask(t));
  }
  const expiring = tokenExpiryEvent(tokenExpiresAt, nowMs);
  if (expiring) out.push(itemFromEvent(expiring));
  return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, MAX_PER_PASS);
}

/** После серверного пересчёта событий и задач: кладёт нужное в очередь и отправляет в Telegram. Сбой не пробрасывается. */
export async function notifyAfterDerive(db: SupabaseClient, userId: string, input: { events: SellerProductEvent[]; tasks: SellerTask[]; nowMs: number }): Promise<void> {
  try {
    let tokenExpiresAt: string | null = null;
    try {
      const opened = await openSellerHubWbToken(userId, supabaseSellerHubSecretDb(db));
      if (opened.ok) tokenExpiresAt = wbTokenExpiresAt(opened.token);
    } catch {
      /* срок токена не прочитался: остальное отправляем */
    }
    const items = itemsFromDerive({ ...input, tokenExpiresAt });
    await notifyUser(db, userId, items, input.nowMs);
  } catch (error) {
    console.warn("[notify] после пересчёта не отправилось:", error instanceof Error ? error.message : String(error));
  }
}

/** Результат запуска поручения агента. */
export async function notifyOrderRun(db: SupabaseClient, userId: string, run: Parameters<typeof itemFromRun>[0]): Promise<void> {
  const item = itemFromRun(run);
  if (item) await notifyUser(db, userId, [item]);
}

/** План завершён. */
export async function notifyPlanFinished(db: SupabaseClient, userId: string, plan: Parameters<typeof itemFromPlanFinished>[0]): Promise<void> {
  await notifyUser(db, userId, [itemFromPlanFinished(plan)]);
}
