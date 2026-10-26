import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubWbToken } from "@/lib/seller-hub/wb-token-http";
import { safeSellerHubMessage } from "@/lib/seller-hub/wb-token";
import { isAnalyticsPeriod } from "@/lib/seller-hub/analytics-periods";
import { CACHE_TTL_MS, cachedFetch, supabaseCacheStore } from "@/lib/seller-hub/data-cache";
import { createServerClient } from "@/lib/supabase/server";
import { fetchSalesFunnel, fetchStocksReport } from "@/lib/services/wildberries/analytics-client";

export const maxDuration = 180;

/** Запросы одного пользователя за один период идут в WB по одному: повторный вызов, пока первый не закончился, ждёт его результат. */
const inFlight = new Map<string, Promise<unknown>>();

/**
 * Только чтение: воронка карточек и отчёт об остатках за выбранный период и за предыдущий такой же (analytics-api WB).
 * Кэш на 30 минут: у WB жёсткие лимиты на эти методы.
 */
export async function POST(request: NextRequest) {
  const access = await requireSellerHubWbToken(request);
  if (!access.ok) return access.response;

  let body: { days?: unknown; refresh?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Нужен JSON" }, { status: 400 });
  }
  const days = typeof body.days === "number" ? body.days : 0;
  if (!isAnalyticsPeriod(days)) {
    return NextResponse.json({ ok: false, error: "Период: 7, 14, 28, 60 или 90 дней" }, { status: 400 });
  }

  const run = () =>
    cachedFetch({
      store: supabaseCacheStore(createServerClient(), access.userId),
      key: `analytics-period:v1:${days}`,
      ttlMs: CACHE_TTL_MS.analyticsPeriod,
      refresh: body.refresh === true,
      fetcher: async () => {
        // Запросы идут последовательно: у WB для этих методов общий лимит.
        const funnel = await fetchSalesFunnel(access.token, days);
        // Ошибку воронки бросаем, а не возвращаем: иначе лимит запросов WB закэшировался бы на 30 минут как «успешный» ответ.
        if (funnel.error) throw new Error(funnel.error);
        const stocksReport = await fetchStocksReport(access.token, days);
        if (stocksReport.status === "rate_limited" || stocksReport.status === "error") throw new Error(stocksReport.error ?? "Отчёт об остатках не прочитался");
        return { funnel, stocksReport };
      },
    });

  try {
    const flightKey = `${access.userId}:${days}:${body.refresh === true ? "r" : ""}`;
    let pending = inFlight.get(flightKey) as ReturnType<typeof run> | undefined;
    if (!pending) {
      pending = run();
      inFlight.set(flightKey, pending);
      void pending.then(
        () => inFlight.delete(flightKey),
        () => inFlight.delete(flightKey),
      );
    }
    const result = await pending;
    const { funnel, stocksReport } = result.value;
    return NextResponse.json({ ok: true, funnel, stocksReport, loadedAt: result.loadedAt, fromCache: result.fromCache, stale: result.stale });
  } catch (e) {
    return NextResponse.json({ ok: false, error: safeSellerHubMessage(e instanceof Error ? e.message : "Не удалось получить аналитику", access.token) }, { status: 502 });
  }
}
