"use client";

import { useEffect, useRef, useState } from "react";
import { loadSellerHubAnalyticsPeriod } from "@/lib/seller-hub/client-api";
import { DEFAULT_ANALYTICS_PERIOD, isAnalyticsPeriod, type AnalyticsPeriod } from "@/lib/seller-hub/analytics-periods";
import type { SellerCatalogSnapshot, SellerFunnelSnapshot, SellerStocksReportSnapshot } from "@/lib/seller-hub/types";
import { useUserSetting } from "./use-user-setting";
import { registerHubCache } from "./hub-cache-registry";

/** Загруженные периоды живут в памяти 10 минут: переключение туда-обратно не ждёт WB заново. */
const periodCache = registerHubCache(new Map<number, { at: number; data: Loaded }>());
const PERIOD_CACHE_MS = 10 * 60_000;

type Loaded = { days: number; funnel: SellerFunnelSnapshot | null; stocksReport: SellerStocksReportSnapshot | null; error?: string };

/**
 * Период «Аналитики» и данные воронки и остатков за него. Для 28 дней берём снимок кабинета (дополнительных запросов нет),
 * для остальных периодов запрашиваем WB (серверный кэш 30 минут). Выбранный период хранится в настройках пользователя.
 */
export function useAnalyticsPeriod(snapshot: SellerCatalogSnapshot | undefined, connected: boolean | undefined, forcedDays?: AnalyticsPeriod) {
  const [stored, setStored] = useUserSetting<number>("analytics.period", DEFAULT_ANALYTICS_PERIOD);
  // forcedDays: график в чате всегда за тот период, о котором спросили, и не трогает сохранённый выбор раздела «Аналитика».
  const days: AnalyticsPeriod = forcedDays ?? (isAnalyticsPeriod(stored) ? stored : DEFAULT_ANALYTICS_PERIOD);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  /** Принудительное обновление относится только к запросу, вызванному кнопкой «Повторить»; смена периода после неё снова идёт через кэш. */
  const refreshOnce = useRef(false);

  const own = days === 28;
  useEffect(() => {
    if (own || !connected) return;
    let cancelled = false;
    const refresh = refreshOnce.current;
    refreshOnce.current = false;
    const cached = periodCache.get(days);
    if (!refresh && cached && Date.now() - cached.at < PERIOD_CACHE_MS) {
      void Promise.resolve().then(() => {
        if (!cancelled) setLoaded(cached.data);
      });
      return () => {
        cancelled = true;
      };
    }
    void loadSellerHubAnalyticsPeriod({ days, refresh })
      .then((res) => {
        if (cancelled) return;
        const data: Loaded = { days, funnel: res.funnel ?? null, stocksReport: res.stocksReport ?? null, error: res.ok ? undefined : res.error };
        if (res.ok) periodCache.set(days, { at: Date.now(), data });
        setLoaded(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoaded({ days, funnel: null, stocksReport: null, error: e instanceof Error ? e.message : "Не удалось загрузить данные за период" });
      });
    return () => {
      cancelled = true;
    };
  }, [days, own, connected, reloadTick]);

  const ready = own || (loaded != null && loaded.days === days);
  return {
    days,
    setDays: (next: AnalyticsPeriod) => {
      if (!forcedDays) setStored(next);
    },
    /** Данные за выбранный период; для 28 дней — из снимка кабинета. */
    funnel: own ? snapshot?.funnel : ready ? (loaded?.funnel ?? undefined) : undefined,
    stocksReport: own ? snapshot?.stocksReport : ready ? (loaded?.stocksReport ?? undefined) : undefined,
    loading: !own && Boolean(connected) && !ready,
    error: !own && ready ? loaded?.error : undefined,
    reload: () => {
      refreshOnce.current = true;
      setReloadTick((t) => t + 1);
    },
  };
}

export type AnalyticsPeriodState = ReturnType<typeof useAnalyticsPeriod>;
