import { NextRequest, NextResponse } from "next/server";
import { recordAction } from "@/lib/seller-hub/action-log";
import { safeSellerHubMessage } from "@/lib/seller-hub/wb-token";
import { requireSellerHubWbToken } from "@/lib/seller-hub/wb-token-http";
import { WildberriesApiError } from "@/lib/services/wildberries/client";
import { updateWbClubDiscount, waitForWbPriceUpload } from "@/lib/services/wildberries/prices-write-client";

import { withSyncInvalidation } from "@/lib/seller-hub/sync/invalidate";
export const maxDuration = 60;

/** Скидка WB Клуба по одному или нескольким товарам. Запись в WB только по подтверждению владельца (кнопка «Выполнить» у предложения агента). */
async function handlePost(request: NextRequest) {
  const access = await requireSellerHubWbToken(request);
  if (!access.ok) return access.response;

  let body: { updates?: Array<{ nmId?: number; clubDiscount?: number }> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Нужен JSON" }, { status: 400 });
  }
  const updates = (body.updates ?? []).filter((u): u is { nmId: number; clubDiscount: number } => Number.isInteger(u.nmId) && Number.isFinite(u.clubDiscount));
  if (updates.length === 0 || updates.length > 50) return NextResponse.json({ ok: false, error: "Укажите от 1 до 50 товаров со скидкой Клуба" }, { status: 400 });

  const log = (ok: boolean, message: string) =>
    recordAction({ userId: access.userId, agent: "prices", action: "club_discount_update", nmId: updates.length === 1 ? updates[0]!.nmId : null, request: { count: updates.length, updates: updates.slice(0, 30) }, result: ok ? "ok" : "error", message });

  try {
    const uploaded = await updateWbClubDiscount(access.token, updates);
    if (!uploaded.ok || uploaded.uploadId == null) {
      const error = safeSellerHubMessage(uploaded.error ?? "WB не принял скидку Клуба", access.token);
      await log(false, error);
      return NextResponse.json({ ok: false, error });
    }
    const waited = await waitForWbPriceUpload(access.token, uploaded.uploadId);
    if (waited.outcome !== "processed") {
      const error = waited.outcome === "unknown" ? "WB ещё обрабатывает скидку Клуба: проверьте результат через несколько минут" : safeSellerHubMessage(waited.error ?? "WB не обработал скидку Клуба", access.token);
      await log(false, error);
      return NextResponse.json({ ok: false, error, uploadId: uploaded.uploadId });
    }
    await log(true, "WB обработал скидку Клуба");
    return NextResponse.json({ ok: true, uploadId: uploaded.uploadId });
  } catch (e) {
    if (e instanceof WildberriesApiError) {
      const error = safeSellerHubMessage(e.message, access.token);
      await log(false, error);
      return NextResponse.json({ ok: false, error }, { status: e.status >= 400 ? e.status : 502 });
    }
    throw e;
  }
}

/** После изменения в кабинете серверный снимок устарел: помечаем источники, воркер перечитает их в ближайшую минуту. */
export const POST = withSyncInvalidation(handlePost, ["base"]);
