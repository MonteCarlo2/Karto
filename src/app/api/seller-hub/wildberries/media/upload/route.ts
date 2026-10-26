import { NextRequest, NextResponse } from "next/server";
import { safeSellerHubMessage, wbAuthorization } from "@/lib/seller-hub/wb-token";
import { requireSellerHubWbToken } from "@/lib/seller-hub/wb-token-http";

import { withSyncInvalidation } from "@/lib/seller-hub/sync/invalidate";
export const maxDuration = 60;

async function handlePost(request: NextRequest) {
  const access = await requireSellerHubWbToken(request);
  if (!access.ok) return access.response;

  const form = await request.formData();
  const nmId = String(form.get("nmId") ?? "").trim();
  const photoNumber = String(form.get("photoNumber") ?? "").trim();
  const file = form.get("uploadfile");

  if (!nmId || !photoNumber || !(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Нужны артикул, номер фото и файл" }, { status: 400 });
  }

  const payload = new FormData();
  payload.set("uploadfile", file);

  const response = await fetch("https://content-api.wildberries.ru/content/v3/media/file", {
    method: "POST",
    headers: {
      Authorization: wbAuthorization(access.token),
      "X-Nm-Id": nmId,
      "X-Photo-Number": photoNumber,
    },
    body: payload,
  });

  if (!response.ok) {
    const text = await response.text();
    return NextResponse.json(
      { ok: false, error: safeSellerHubMessage(text || `WB ответил ${response.status}`, access.token) },
      { status: response.status >= 400 ? response.status : 502 },
    );
  }

  return NextResponse.json({ ok: true });
}

/** После изменения в кабинете серверный снимок устарел: помечаем источники, воркер перечитает их в ближайшую минуту. */
export const POST = withSyncInvalidation(handlePost, ["base"]);
