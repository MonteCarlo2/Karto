import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubUser } from "@/lib/seller-hub/access";
import { parseApiKey } from "@/lib/auto-replies/api-auth";
import { syncYandexCatalog } from "@/lib/services/yandex/catalog-client";
import { YandexApiError } from "@/lib/services/yandex/client";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: { apiKey?: string; campaignId?: string; businessId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Нужен JSON" }, { status: 400 });
  }

  const apiKey = parseApiKey(body.apiKey);
  const campaignId = String(body.campaignId ?? "").trim();
  if (!apiKey || !campaignId) {
    return NextResponse.json(
      { ok: false, error: "Укажите API-ключ и Campaign ID Яндекс Маркета" },
      { status: 400 }
    );
  }

  try {
    const snapshot = await syncYandexCatalog({
      apiKey,
      campaignId,
      businessId: String(body.businessId ?? "").trim(),
    });
    return NextResponse.json({ ok: true, snapshot });
  } catch (e) {
    if (e instanceof YandexApiError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status >= 400 ? e.status : 502 });
    }
    throw e;
  }
}
