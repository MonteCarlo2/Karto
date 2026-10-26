import { NextRequest, NextResponse } from "next/server";
import { recordAction, resultMessage } from "@/lib/seller-hub/action-log";
import { requireSellerHubWbToken, wbRouteError } from "@/lib/seller-hub/wb-token-http";
import { WildberriesApiError } from "@/lib/services/wildberries/client";
import {
  addOrdersToSupply,
  cancelWbOrder,
  closeWbSupply,
  createWbSupply,
  getWbOrderStickers,
  getWbSupplyBarcode,
} from "@/lib/services/wildberries/orders-write-client";

import { withSyncInvalidation } from "@/lib/seller-hub/sync/invalidate";
export const maxDuration = 30;

/** Не больше стольких заданий за один запрос: поставка из сотен заказов собирается пачками по 100 на стороне клиента. */
const MAX_ORDER_IDS = 1000;

type SupplyAction = "create" | "add_orders" | "close" | "barcode" | "stickers" | "cancel";

async function handlePost(request: NextRequest) {
  const access = await requireSellerHubWbToken(request);
  if (!access.ok) return access.response;

  let body: {
    action?: SupplyAction;
    supplyName?: string;
    supplyId?: string;
    orderIds?: number[];
    orderId?: number;
    stickerType?: "png" | "svg";
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Нужен JSON" }, { status: 400 });
  }

  const apiKey = access.token;

  // Входные данные проверяем здесь, а не только в клиентском помощнике: маршрут могут вызвать и другие места.
  const validIds = (value: unknown): value is number[] =>
    Array.isArray(value) && value.length > 0 && value.length <= MAX_ORDER_IDS && value.every((id) => typeof id === "number" && Number.isInteger(id) && id > 0);
  if (body.supplyId !== undefined && (typeof body.supplyId !== "string" || !/^[\w-]{1,64}$/.test(body.supplyId))) {
    return NextResponse.json({ ok: false, error: "Некорректный supplyId" }, { status: 400 });
  }
  if (body.orderIds !== undefined && !validIds(body.orderIds)) {
    return NextResponse.json({ ok: false, error: `orderIds: целые положительные числа, не больше ${MAX_ORDER_IDS}` }, { status: 400 });
  }

  const action = body.action;
  if (
    action !== "create" &&
    action !== "add_orders" &&
    action !== "close" &&
    action !== "barcode" &&
    action !== "stickers" &&
    action !== "cancel"
  ) {
    return NextResponse.json(
      { ok: false, error: "action должен быть create, add_orders, close, barcode, stickers или cancel" },
      { status: 400 }
    );
  }

  /** Запись в журнал для действий, которые меняют кабинет. Агент «stocks» — ближайший к складским операциям в журнале. */
  const log = (name: string, request: unknown, result: { ok: boolean; error?: string }, extra?: { targetId?: number | null }) =>
    recordAction({
      userId: access.userId,
      agent: "stocks",
      action: name,
      targetId: extra?.targetId ?? null,
      request,
      result: result.ok ? "ok" : "error",
      message: resultMessage(result),
    });

  try {
    switch (action) {
      case "create": {
        const name = body.supplyName ?? `Поставка ${new Date().toLocaleDateString("ru-RU")}`;
        const result = await createWbSupply(apiKey, name);
        await log("supply_create", { name, supplyId: result.supplyId }, result);
        return NextResponse.json(result);
      }
      case "add_orders": {
        if (!body.supplyId) {
          return NextResponse.json({ ok: false, error: "Укажите supplyId" }, { status: 400 });
        }
        if (!Array.isArray(body.orderIds) || body.orderIds.length === 0) {
          return NextResponse.json({ ok: false, error: "Укажите orderIds" }, { status: 400 });
        }
        const result = await addOrdersToSupply(apiKey, body.supplyId, body.orderIds);
        await log("supply_add_orders", { supplyId: body.supplyId, orderIds: body.orderIds }, result);
        return NextResponse.json(result);
      }
      case "close": {
        if (!body.supplyId) {
          return NextResponse.json({ ok: false, error: "Укажите supplyId" }, { status: 400 });
        }
        const result = await closeWbSupply(apiKey, body.supplyId);
        await log("supply_close", { supplyId: body.supplyId }, result);
        return NextResponse.json(result);
      }
      case "cancel": {
        if (typeof body.orderId !== "number" || !Number.isInteger(body.orderId) || body.orderId <= 0) {
          return NextResponse.json({ ok: false, error: "Укажите orderId" }, { status: 400 });
        }
        const result = await cancelWbOrder(apiKey, body.orderId);
        await log("order_cancel", { orderId: body.orderId }, result, { targetId: body.orderId });
        return NextResponse.json(result);
      }
      case "barcode": {
        if (!body.supplyId) {
          return NextResponse.json({ ok: false, error: "Укажите supplyId" }, { status: 400 });
        }
        const result = await getWbSupplyBarcode(apiKey, body.supplyId, body.stickerType ?? "png");
        return NextResponse.json(result);
      }
      case "stickers": {
        if (!Array.isArray(body.orderIds) || body.orderIds.length === 0) {
          return NextResponse.json({ ok: false, error: "Укажите orderIds" }, { status: 400 });
        }
        const result = await getWbOrderStickers(apiKey, body.orderIds, body.stickerType ?? "png");
        return NextResponse.json(result);
      }
      default: {
        const _exhaustive: never = action;
        return NextResponse.json({ ok: false, error: `Неизвестное действие: ${String(_exhaustive)}` }, { status: 400 });
      }
    }
  } catch (e) {
    if (e instanceof WildberriesApiError) {
      return wbRouteError(e, apiKey, e.status >= 400 ? e.status : 502);
    }
    throw e;
  }
}

/** После изменения в кабинете серверный снимок устарел: помечаем источники, воркер перечитает их в ближайшую минуту. */
export const POST = withSyncInvalidation(handlePost, ["base"]);
