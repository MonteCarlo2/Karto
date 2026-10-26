import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { requireSellerHubUser } from "@/lib/seller-hub/access";
import { createServerClient } from "@/lib/supabase/server";
import { deriveForCabinet } from "./derive";
import { clearSnapshotCache } from "./snapshot-cache";
import type { SyncSourceId } from "./sources";
import { SyncStore } from "./store";

/**
 * Действие в интерфейсе изменило кабинет (пауза кампании, цена, остаток, акция…): серверный снимок устарел.
 * Помечаем нужные источники «перечитать сейчас», воркер подхватит их на ближайшем проходе (до минуты), а не через 15 минут.
 * Пока фоновый режим выключен, ничего не делаем: тогда данные обновляет сам браузер.
 * Ошибка здесь никогда не ломает действие пользователя: оно уже выполнено в WB.
 */

export async function invalidateSources(db: SupabaseClient, userId: string, marketplaceId: string, sources: SyncSourceId[]): Promise<boolean> {
  const cabinet = await db
    .from("seller_hub_cabinets")
    .select("background_enabled")
    .eq("user_id", userId)
    .eq("marketplace_id", marketplaceId)
    .maybeSingle();
  if (cabinet.error || !cabinet.data?.background_enabled) return false;
  const now = new Date().toISOString();
  const { error } = await db
    .from("seller_hub_sync_state")
    .update({ next_due_at: now })
    .eq("user_id", userId)
    .eq("marketplace_id", marketplaceId)
    .in("source", sources)
    .gt("next_due_at", now);
  return !error;
}

export type InvalidationDeps = {
  authorize: (request: NextRequest) => Promise<string | null>;
  invalidate: (userId: string, marketplaceId: string, sources: SyncSourceId[]) => Promise<unknown>;
};

const defaultDeps: InvalidationDeps = {
  authorize: async (request) => (await requireSellerHubUser(request)).user?.id ?? null,
  invalidate: (userId, marketplaceId, sources) => invalidateSources(createServerClient(), userId, marketplaceId, sources),
};

/** Ответы, после которых в кабинете точно ничего не менялось: неверный запрос, нет входа. */
function nothingChanged(status: number): boolean {
  return status === 400 || status === 401 || status === 403;
}

/**
 * Оборачивает обработчик маршрута, который что-то меняет в WB. После выполнения помечает источники устаревшими.
 * Помечаем и после неудачи (таймаут, «результат неизвестен»): запись могла дойти до WB, правду покажет перечитывание.
 */
export function withSyncInvalidation<A extends unknown[]>(
  handler: (request: NextRequest, ...rest: A) => Promise<Response>,
  sources: SyncSourceId[],
  marketplaceId = "wildberries",
  deps: InvalidationDeps = defaultDeps,
): (request: NextRequest, ...rest: A) => Promise<Response> {
  return async (request, ...rest) => {
    const response = await handler(request, ...rest);
    if (!nothingChanged(response.status)) {
      try {
        const userId = await deps.authorize(request);
        if (userId) await deps.invalidate(userId, marketplaceId, sources);
      } catch (error) {
        console.error("[seller-hub] не удалось пометить источники устаревшими:", error instanceof Error ? error.message : String(error));
      }
    }
    return response;
  };
}

/**
 * Себестоимость лежит в нашей базе, а не в WB: перечитывать нечего, но задачи и маржа зависят от неё.
 * Пересчитываем сразу по уже сохранённым снимкам (WB не трогаем).
 */
export async function rederiveAfterCostChange(userId: string, marketplaceId = "wildberries"): Promise<boolean> {
  // Себестоимость входит в снимок для интерфейса, а в версию данных не входит: кэш снимка сбрасываем явно.
  clearSnapshotCache(userId, marketplaceId);
  const db = createServerClient();
  const cabinet = await db.from("seller_hub_cabinets").select("background_enabled").eq("user_id", userId).eq("marketplace_id", marketplaceId).maybeSingle();
  if (cabinet.error || !cabinet.data?.background_enabled) return false;
  try {
    return (await deriveForCabinet(new SyncStore(db), db, { userId, marketplaceId })) != null;
  } catch (error) {
    console.error("[seller-hub] пересчёт после изменения себестоимости не удался:", error instanceof Error ? error.message : String(error));
    return false;
  }
}
