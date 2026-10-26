import { NextRequest, NextResponse } from "next/server";
import type { NewsProfile } from "@/lib/seller-hub/news/analysis";
import { refreshSellerHubNews } from "@/lib/seller-hub/news/refresh";
import { requireSellerHubWbToken } from "@/lib/seller-hub/wb-token-http";
import { safeSellerHubMessage } from "@/lib/seller-hub/wb-token";
import { createServerClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const strList = (v: unknown, maxItems: number, maxLen: number): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, maxLen)).filter(Boolean).slice(0, maxItems) : [];

function parseProfile(raw: unknown): NewsProfile {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    categories: strList(r.categories, 80, 80),
    brands: strList(r.brands, 80, 80),
    worksFbs: r.worksFbs === true,
    worksFbw: r.worksFbw === true,
    usesAds: r.usesAds === true,
    promoNames: strList(r.promoNames, 40, 100),
    mutedRubrics: strList(r.mutedRubrics, 30, 60),
    warehouseNames: strList(r.warehouseNames, 100, 80),
  };
}

/**
 * Новости портала WB → уведомления в «Событиях». Ручной запуск из браузера (режим без фонового сбора);
 * при включённом фоне то же самое делает сервер сам (sync/jobs.ts, источник news). Только чтение из WB.
 * Ответ `more: true` означает, что у WB есть ещё страницы: вызвать снова минуту спустя.
 */
export async function POST(request: NextRequest) {
  const access = await requireSellerHubWbToken(request);
  if (!access.ok) return access.response;
  let body: { profile?: unknown };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  try {
    const result = await refreshSellerHubNews({ db: createServerClient(), userId: access.userId, token: access.token, profile: parseProfile(body.profile) });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: safeSellerHubMessage(e instanceof Error ? e.message : "Не удалось обновить новости", access.token) }, { status: 502 });
  }
}
