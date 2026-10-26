import { NextRequest, NextResponse } from "next/server";
import { safeSellerHubMessage, wbAuthorization } from "@/lib/seller-hub/wb-token";
import { requireSellerHubWbToken } from "@/lib/seller-hub/wb-token-http";

export const maxDuration = 30;

type WbCard = {
  nmID?: number;
  vendorCode?: string;
  title?: string;
  description?: string;
  brand?: string;
  subjectName?: string;
  video?: string;
  photos?: Array<{ big?: string; c516x688?: string; c246x328?: string; square?: string }>;
  dimensions?: { length?: number; width?: number; height?: number; weightBrutto?: number };
};

export async function POST(request: NextRequest) {
  const access = await requireSellerHubWbToken(request);
  if (!access.ok) return access.response;

  let body: { nmId?: number };
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
  const listed = await fetch("https://content-api.wildberries.ru/content/v2/get/cards/list", {
    method: "POST",
    headers: {
      Authorization: wbAuthorization(token),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
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
  if (!card) {
    return NextResponse.json({ ok: false, error: "Этой карточки в ответе WB нет." }, { status: 404 });
  }

  const imageUrls = (card.photos ?? [])
    .map((photo) => photo.big ?? photo.c516x688 ?? photo.c246x328 ?? photo.square)
    .filter((url): url is string => Boolean(url));

  return NextResponse.json({
    ok: true,
    card: {
      title: card.title?.trim() || "",
      description: card.description?.trim() || "",
      vendorCode: card.vendorCode?.trim() || "",
      brand: card.brand?.trim() || "",
      category: card.subjectName?.trim() || "",
      imageUrls,
      videoUrl: card.video?.trim() || "",
      dimensions: card.dimensions
        ? {
            length: card.dimensions.length,
            width: card.dimensions.width,
            height: card.dimensions.height,
            weightKg: card.dimensions.weightBrutto,
          }
        : undefined,
    },
  });
}
