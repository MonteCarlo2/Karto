import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubUser } from "@/lib/seller-hub/access";
import { parseApiKey } from "@/lib/auto-replies/api-auth";
import { createServerClient } from "@/lib/supabase/server";
import {
  connectSellerHubWbToken,
  disconnectSellerHubWbToken,
  migrateSellerHubWbToken,
  openSellerHubWbToken,
  replaceSellerHubWbToken,
  type WbTokenFlowResult,
} from "@/lib/seller-hub/wb-token";
import { supabaseSellerHubSecretDb } from "@/lib/seller-hub/wb-token-store";
import { verifyWildberriesContentAccess } from "@/lib/services/wildberries/content-client";

const READ_ERROR = "Не удалось прочитать подключение кабинета";

function publicResult(result: WbTokenFlowResult) {
  if (!result.ok) {
    return {
      ok: false as const,
      error: result.error,
      keepLocal: result.keepLocal,
      alreadyStored: result.alreadyStored === true,
    };
  }
  return {
    ok: true as const,
    alreadyStored: result.alreadyStored === true,
    serverVerified: result.serverVerified === true,
    sellerName: result.sellerName ?? null,
    verifiedAt: result.verifiedAt,
    sampleCount: result.sampleCount,
    totalCards: result.totalCards ?? null,
    scopes: result.scopes,
    keepLocal: false,
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const opened = await openSellerHubWbToken(auth.user.id, supabaseSellerHubSecretDb(createServerClient()));
  if (opened.ok) return NextResponse.json({ ok: true, connected: true });
  if (opened.reason === "missing") return NextResponse.json({ ok: true, connected: false });
  return NextResponse.json({ ok: false, error: READ_ERROR }, { status: 503 });
}

export async function POST(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: { action?: string; apiKey?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Нужен JSON", keepLocal: true }, { status: 400 });
  }

  const db = supabaseSellerHubSecretDb(createServerClient());
  const action = body.action;
  if (action === "disconnect") {
    const result = await disconnectSellerHubWbToken(auth.user.id, db);
    return NextResponse.json(publicResult(result), { status: result.ok ? 200 : 503 });
  }

  if (action !== "connect" && action !== "migrate" && action !== "replace") {
    return NextResponse.json({ ok: false, error: "Неизвестное действие", keepLocal: true }, { status: 400 });
  }

  const apiKey = parseApiKey(body.apiKey);
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "Укажите API-токен Wildberries", keepLocal: true }, { status: 400 });
  }

  const verify = (token: string) => verifyWildberriesContentAccess(token);
  const result =
    action === "connect"
      ? await connectSellerHubWbToken(auth.user.id, apiKey, db, verify)
      : action === "migrate"
        ? await migrateSellerHubWbToken(auth.user.id, apiKey, db, verify)
        : await replaceSellerHubWbToken(auth.user.id, apiKey, db, verify);

  return NextResponse.json(publicResult(result), { status: result.ok ? 200 : 400 });
}
