import { NextRequest, NextResponse } from "next/server";
import { recordAction } from "@/lib/seller-hub/action-log";
import { safeSellerHubMessage } from "@/lib/seller-hub/wb-token";
import { requireSellerHubWbToken } from "@/lib/seller-hub/wb-token-http";
import {
  findStalePrices,
  requestedPriceMatchesRead,
  settlePriceUpload,
  stalePriceMessage,
  type ExpectedPrice,
  type PriceWriteView,
} from "@/lib/seller-hub/price-write";
import { WildberriesApiError } from "@/lib/services/wildberries/client";
import { fetchPricesByNmIds } from "@/lib/services/wildberries/content-client";
import { updateWbPrices, waitForWbPriceUpload } from "@/lib/services/wildberries/prices-write-client";

import { withSyncInvalidation } from "@/lib/seller-hub/sync/invalidate";
export const maxDuration = 60;

function payload(view: PriceWriteView) {
  return {
    ok: view.outcome === "confirmed" || view.outcome === "processed",
    outcome: view.outcome,
    uploadId: view.uploadId,
    verified: view.verified,
    error: view.tone === "ok" ? undefined : view.text,
    message: view.text,
  };
}

async function handlePost(request: NextRequest) {
  const access = await requireSellerHubWbToken(request);
  if (!access.ok) return access.response;

  let body: { updates?: { nmId: number; price?: number; discount?: number; expected?: ExpectedPrice }[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Нужен JSON", outcome: "failed" }, { status: 400 });
  }

  const apiKey = access.token;

  if (!Array.isArray(body.updates) || body.updates.length === 0) {
    return NextResponse.json({ ok: false, error: "Укажите список обновлений цен", outcome: "failed" }, { status: 400 });
  }

  const updates = body.updates;
  const logPrice = (view: PriceWriteView) =>
    recordAction({
      userId: access.userId,
      agent: "prices",
      action: "price_update",
      nmId: updates.length === 1 ? updates[0]!.nmId : null,
      request: { count: updates.length, updates: updates.slice(0, 30) },
      result: view.outcome === "confirmed" || view.outcome === "processed" ? "ok" : "error",
      message: view.text,
    });

  try {
    // Перед записью сверяем с WB то, что пользователь видел: цену могли поменять в кабинете WB минуты назад.
    const withExpectation = updates.filter((row) => row.expected != null);
    if (withExpectation.length > 0) {
      let current: Awaited<ReturnType<typeof fetchPricesByNmIds>> | null = null;
      try {
        current = await fetchPricesByNmIds(apiKey, withExpectation.map((row) => row.nmId));
      } catch {
        current = null;
      }
      const stale = current ? findStalePrices(withExpectation, current) : [];
      if (stale.length > 0) {
        const message = stalePriceMessage(stale);
        await recordAction({
          userId: access.userId,
          agent: "prices",
          action: "price_update",
          nmId: updates.length === 1 ? updates[0]!.nmId : null,
          request: { count: updates.length, updates: updates.slice(0, 30), stale: stale.slice(0, 30) },
          result: "error",
          message,
        });
        return NextResponse.json({ ok: false, outcome: "failed", verified: false, error: message, message, stale }, { status: 409 });
      }
    }
    // Поле expected нужно только для сверки; в WB уходят цена и скидка.
    const uploaded = await updateWbPrices(
      apiKey,
      updates.map(({ nmId, price, discount }) => ({ nmId, price, discount })),
    );
    if (!uploaded.ok || uploaded.uploadId == null) {
      const view = settlePriceUpload({ uploadOk: uploaded.ok, uploadError: uploaded.error, uploadId: uploaded.uploadId });
      await logPrice(view);
      return NextResponse.json(payload(view));
    }

    const waited = await waitForWbPriceUpload(apiKey, uploaded.uploadId);
    if (waited.outcome !== "processed") {
      const view = settlePriceUpload({ uploadOk: true, uploadId: uploaded.uploadId, waitOutcome: waited.outcome, waitError: waited.error });
      await logPrice(view);
      return NextResponse.json(payload(view));
    }

    let read: "match" | "mismatch" | "unread" = "unread";
    try {
      const rows = await fetchPricesByNmIds(
        apiKey,
        body.updates.map((row) => row.nmId),
      );
      const matched = body.updates.every((row) => requestedPriceMatchesRead(row, rows.get(row.nmId)));
      read = matched ? "match" : "mismatch";
    } catch {
      read = "unread";
    }

    const finalView = settlePriceUpload({ uploadOk: true, uploadId: uploaded.uploadId, waitOutcome: "processed", read });
    await logPrice(finalView);
    return NextResponse.json(payload(finalView));
  } catch (e) {
    if (e instanceof WildberriesApiError) {
      const view = settlePriceUpload({ uploadOk: false, uploadError: safeSellerHubMessage(e.message, apiKey) });
      await logPrice(view);
      return NextResponse.json(payload(view), { status: e.status >= 400 ? e.status : 502 });
    }
    throw e;
  }
}

/** После изменения в кабинете серверный снимок устарел: помечаем источники, воркер перечитает их в ближайшую минуту. */
export const POST = withSyncInvalidation(handlePost, ["base"]);
