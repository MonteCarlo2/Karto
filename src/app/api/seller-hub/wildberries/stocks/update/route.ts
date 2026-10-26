import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubWbToken, wbRouteError } from "@/lib/seller-hub/wb-token-http";
import { resolveChrtIdsForNmId } from "@/lib/services/wildberries/content-client";
import { WildberriesApiError } from "@/lib/services/wildberries/client";
import {
  getWbWarehouses,
  updateWbFbsStocks,
  type StockUpdate,
} from "@/lib/services/wildberries/stocks-write-client";

import { withSyncInvalidation } from "@/lib/seller-hub/sync/invalidate";
export const maxDuration = 30;

type RawStockUpdate = {
  nmId?: number;
  chrtId?: number;
  sku?: string;
  amount: number;
};

async function expandStockUpdates(
  apiKey: string,
  raw: RawStockUpdate[]
): Promise<{ updates: StockUpdate[]; errors: string[] }> {
  const updates: StockUpdate[] = [];
  const errors: string[] = [];

  for (const row of raw) {
    const amount = Math.max(0, Math.round(row.amount));

    if (row.chrtId != null && Number.isFinite(row.chrtId)) {
      updates.push({ chrtId: row.chrtId, amount });
      continue;
    }

    if (row.nmId != null && Number.isFinite(row.nmId)) {
      const chrtIds = await resolveChrtIdsForNmId(apiKey, row.nmId);
      if (chrtIds.length === 0) {
        errors.push(`nmID ${row.nmId}: не найден chrtID в карточке WB`);
        continue;
      }
      for (const chrtId of chrtIds) {
        updates.push({ chrtId, amount });
      }
      continue;
    }

    errors.push("Укажите nmId или chrtId для обновления остатка");
  }

  return { updates, errors };
}

async function handlePost(request: NextRequest) {
  const access = await requireSellerHubWbToken(request);
  if (!access.ok) return access.response;

  let body: {
    warehouseId?: number;
    updates?: RawStockUpdate[];
    action?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Нужен JSON" }, { status: 400 });
  }

  const apiKey = access.token;

  const action = body.action;

  try {
    let warehouseId = body.warehouseId;
    let warehouses: { id: number; name: string }[] | undefined;

    if (warehouseId == null) {
      warehouses = await getWbWarehouses(apiKey);
      if (warehouses.length === 0) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Не найдено ни одного склада FBS. Проверьте категорию «Маркетплейс» в токене и что склад создан в кабинете WB.",
          },
          { status: 400 }
        );
      }
      warehouseId = warehouses[0].id;
    }

    if (action === "list_warehouses") {
      const list = warehouses ?? (await getWbWarehouses(apiKey));
      return NextResponse.json({ ok: true, warehouses: list });
    }

    if (!Array.isArray(body.updates) || body.updates.length === 0) {
      return NextResponse.json({ ok: false, error: "Укажите список обновлений остатков" }, { status: 400 });
    }

    const expanded = await expandStockUpdates(apiKey, body.updates);
    if (expanded.updates.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: expanded.errors[0] ?? "Не удалось определить chrtID для обновления",
          errors: expanded.errors,
        },
        { status: 400 }
      );
    }

    const result = await updateWbFbsStocks(apiKey, warehouseId, expanded.updates);
    const errors = [...(expanded.errors ?? []), ...(result.errors ?? [])].filter(Boolean);

    if (!result.ok) {
      return NextResponse.json({
        ok: false,
        verified: result.verified ?? false,
        error: errors[0] ?? "Не удалось обновить остатки на Wildberries",
        errors,
        warehouses,
      });
    }

    return NextResponse.json({
      ok: true,
      verified: result.verified ?? true,
      warehouses,
      errors: expanded.errors?.filter(Boolean),
    });
  } catch (e) {
    if (e instanceof WildberriesApiError) {
      return wbRouteError(e, apiKey, e.status >= 400 ? e.status : 502);
    }
    throw e;
  }
}

/** После изменения в кабинете серверный снимок устарел: помечаем источники, воркер перечитает их в ближайшую минуту. */
export const POST = withSyncInvalidation(handlePost, ["base", "stocks_report"]);
