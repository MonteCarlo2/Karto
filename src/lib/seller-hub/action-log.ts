import { createServerClient } from "@/lib/supabase/server";
export { ACTION_LABEL } from "./action-labels";

/**
 * Журнал действий: кто, что, когда и с каким результатом изменил в кабинете (пополнение, пауза, ставка, цены и т.д.).
 * Таблица seller_hub_agent_actions. Запись best-effort: сбой журнала никогда не ломает само действие.
 * В журнал попадают только идентификаторы и суммы, без токенов и персональных данных.
 */

export type ActionAgent = "ads" | "prices" | "comms" | "stocks";
export type ActionResult = "ok" | "error" | "skipped" | "suggested";

export type ActionEntry = {
  userId: string;
  agent: ActionAgent;
  /** Машинное имя действия, например ad_deposit. */
  action: string;
  targetId?: number | null;
  nmId?: number | null;
  request: unknown;
  result: ActionResult;
  message?: string | null;
  initiator?: "user" | "agent";
};

const SECRET_KEY = /token|authorization|secret|password|api.?key|bearer/i;

/** Убираем из запроса всё, что похоже на секрет, и обрезаем длинные значения. */
export function sanitizeRequest(value: unknown, depth = 0): unknown {
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value.length > 200 ? `${value.slice(0, 200)}…` : value;
  if (depth >= 4) return null;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeRequest(item, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY.test(key)) continue;
      out[key] = sanitizeRequest(item, depth + 1);
    }
    return out;
  }
  return null;
}

export async function recordAction(entry: ActionEntry): Promise<void> {
  try {
    await createServerClient().from("seller_hub_agent_actions").insert({
      user_id: entry.userId,
      marketplace_id: "wildberries",
      agent: entry.agent,
      action: entry.action,
      target_id: entry.targetId ?? null,
      nm_id: entry.nmId ?? null,
      request: sanitizeRequest(entry.request) ?? {},
      result: entry.result,
      message: entry.message ? entry.message.slice(0, 500) : null,
      initiator: entry.initiator ?? "user",
    });
  } catch {
    // Журнал вспомогательный: действие уже выполнено, его результат важнее записи о нём.
  }
}

/** Сообщение об ошибке из ответа WB-клиента, если оно есть. */
export function resultMessage(result: unknown): string | null {
  if (result && typeof result === "object" && "error" in result) {
    const error = (result as { error?: unknown }).error;
    return typeof error === "string" && error ? error : null;
  }
  return null;
}

/** Достаём кампанию и артикул из разобранного запроса, чтобы по ним можно было искать записи журнала. */
export function idsOf(request: unknown): { targetId: number | null; nmId: number | null } {
  const r = (request && typeof request === "object" ? request : {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null);
  return { targetId: num(r.campaignId ?? r.advertId ?? r.id), nmId: num(r.nmId ?? r.nm) };
}