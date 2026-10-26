import { NextRequest, NextResponse } from "next/server";
import { safeSellerHubMessage, wbAuthorization } from "@/lib/seller-hub/wb-token";
import { requireSellerHubWbToken } from "@/lib/seller-hub/wb-token-http";

import { withSyncInvalidation } from "@/lib/seller-hub/sync/invalidate";
export const maxDuration = 60;

async function handlePost(request: NextRequest) {
  const access = await requireSellerHubWbToken(request);
  if (!access.ok) return access.response;

  let body: { nmId?: number; urls?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Нужен JSON" }, { status: 400 });
  }

  const nmId = Number(body.nmId);
  const urls = (body.urls ?? []).filter((url) => url.startsWith("http"));
  if (!Number.isFinite(nmId)) {
    return NextResponse.json({ ok: false, error: "Нужен артикул WB" }, { status: 400 });
  }

  const token = access.token;
  const response = await fetch("https://content-api.wildberries.ru/content/v3/media/save", {
    method: "POST",
    headers: {
      Authorization: wbAuthorization(token),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ nmId, data: urls }),
  });

  if (!response.ok) {
    const text = await response.text();
    return NextResponse.json(
      { ok: false, error: safeSellerHubMessage(text || `WB ответил ${response.status}`, token) },
      { status: response.status >= 400 ? response.status : 502 },
    );
  }

  return NextResponse.json({ ok: true });
}

/** После изменения в кабинете серверный снимок устарел: помечаем источники, воркер перечитает их в ближайшую минуту. */
export const POST = withSyncInvalidation(handlePost, ["base"]);
