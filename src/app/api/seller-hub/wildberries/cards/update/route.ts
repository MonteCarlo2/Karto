import { NextRequest, NextResponse } from "next/server";
import { safeSellerHubMessage, wbAuthorization } from "@/lib/seller-hub/wb-token";
import { requireSellerHubWbToken } from "@/lib/seller-hub/wb-token-http";
import { descriptionForWb, WB_DESCRIPTION_LIMIT } from "@/lib/seller-hub/wb-description";

import { withSyncInvalidation } from "@/lib/seller-hub/sync/invalidate";
export const maxDuration = 60;

type WbCard = {
  nmID?: number;
  vendorCode?: string;
  title?: string;
  description?: string;
  brand?: string;
  dimensions?: { length?: number; width?: number; height?: number; weightBrutto?: number };
  characteristics?: unknown[];
  sizes?: unknown[];
};

async function handlePost(request: NextRequest) {
  const access = await requireSellerHubWbToken(request);
  if (!access.ok) return access.response;

  let body: {
    nmId?: number;
    title?: string;
    description?: string;
    vendorCode?: string;
    length?: number;
    width?: number;
    height?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Нужен JSON" }, { status: 400 });
  }

  const nmId = Number(body.nmId);
  if (!Number.isFinite(nmId)) {
    return NextResponse.json({ ok: false, error: "Нужен артикул WB" }, { status: 400 });
  }

  const token = access.token;
  const headers = { Authorization: wbAuthorization(token), Accept: "application/json", "Content-Type": "application/json" };

  const listed = await fetch("https://content-api.wildberries.ru/content/v2/get/cards/list", {
    method: "POST",
    headers,
    body: JSON.stringify({
      settings: {
        filter: { textSearch: String(nmId), withPhoto: -1 },
        cursor: { limit: 20 },
      },
    }),
  });
  const listedJson = (await listed.json().catch(() => ({}))) as { cards?: WbCard[]; errorText?: string };
  if (!listed.ok) {
    return NextResponse.json(
      { ok: false, error: safeSellerHubMessage(listedJson.errorText || "Карточка не прочиталась", token) },
      { status: 502 },
    );
  }

  const card = (listedJson.cards ?? []).find((row) => row.nmID === nmId);
  if (!card?.sizes?.length || !card.vendorCode) {
    return NextResponse.json(
      { ok: false, error: "В карточке нет размеров. Её нельзя перезаписать частично, поэтому название и описание не отправил." },
      { status: 409 },
    );
  }

  const description = descriptionForWb(body.description ?? card.description ?? "");
  if (description.length > WB_DESCRIPTION_LIMIT) {
    return NextResponse.json(
      { ok: false, error: `Описание длиннее ${WB_DESCRIPTION_LIMIT} знаков. Wildberries такое поле не примет, я его не отправил.` },
      { status: 400 },
    );
  }

  const length = Number.isFinite(body.length) ? Math.round(body.length as number) : card.dimensions?.length;
  const width = Number.isFinite(body.width) ? Math.round(body.width as number) : card.dimensions?.width;
  const height = Number.isFinite(body.height) ? Math.round(body.height as number) : card.dimensions?.height;

  const update = await fetch("https://content-api.wildberries.ru/content/v2/cards/update", {
    method: "POST",
    headers,
    body: JSON.stringify([
      {
        nmID: nmId,
        vendorCode: body.vendorCode?.trim() || card.vendorCode,
        brand: card.brand ?? "",
        title: (body.title ?? card.title ?? "").slice(0, 60),
        description,
        dimensions: {
          length,
          width,
          height,
          weightBrutto: card.dimensions?.weightBrutto,
        },
        characteristics: card.characteristics ?? [],
        sizes: card.sizes,
      },
    ]),
  });

  if (!update.ok) {
    const text = await update.text();
    return NextResponse.json(
      { ok: false, error: safeSellerHubMessage(text || "WB не принял карточку", token) },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}

/** После изменения в кабинете серверный снимок устарел: помечаем источники, воркер перечитает их в ближайшую минуту. */
export const POST = withSyncInvalidation(handlePost, ["base"]);
