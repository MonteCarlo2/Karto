import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubUser } from "@/lib/seller-hub/access";
import { parseApiKey } from "@/lib/auto-replies/api-auth";
import { syncOzonCatalog } from "@/lib/services/ozon/catalog-client";
import { OzonApiError } from "@/lib/services/ozon/client";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: { apiKey?: string; clientId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Нужен JSON" }, { status: 400 });
  }

  const apiKey = parseApiKey(body.apiKey);
  const clientId = String(body.clientId ?? "").trim();
  if (!apiKey || !clientId) {
    return NextResponse.json({ ok: false, error: "Укажите Client ID и API Key Ozon" }, { status: 400 });
  }

  try {
    const snapshot = await syncOzonCatalog({ clientId, apiKey });
    return NextResponse.json({ ok: true, snapshot });
  } catch (e) {
    if (e instanceof OzonApiError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status >= 400 ? e.status : 502 });
    }
    throw e;
  }
}
