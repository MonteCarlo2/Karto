"use client";

import { useEffect, useRef, useState } from "react";
import { loadSellerHubAnalyticsPeriod } from "@/lib/seller-hub/client-api";
import { DEFAULT_ANALYTICS_PERIOD, isAnalyticsPeriod, type AnalyticsPeriod } from "@/lib/seller-hub/analytics-periods";
import type { SellerCatalogSnapshot, SellerFunnelSnapshot, SellerStocksReportSnapshot } from "@/lib/seller-hub/types";
import { useUserSetting } from "./use-user-setting";

type Loaded = { days: number; funnel: SellerFunnelSnapshot | null; stocksReport: SellerStocksReportSnapshot | null; error?: string };

/**
 * Период «Аналитики» и данные воронки и остатков за него. Для 28 дней берём снимок кабинета (дополнительных запросов нет),
 * для остальных периодов запрашиваем WB (серверный кэш 30 минут). Выбранный период хранится в настройках пользователя.
 */
export function useAnalyticsPeriod(snapshot: SellerCatalogSnapshot | undefined, connected: boolean | undefined) {
  const [stored, setStored] = useUserSetting<number>("analytics.period", DEFAULT_ANALYTICS_PERIOD);
  const days: AnalyticsPeriod = isAnalyticsPeriod(stored) ? stored : DEFAULT_ANALYTICS_PERIOD;
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
    void loadSellerHubAnalyticsPeriod({ days, refresh })
      .then((res) => {
        if (cancelled) return;
        setLoaded({ days, funnel: res.funnel ?? null, stocksReport: res.stocksReport ?? null, error: res.ok ? undefined : res.error });
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
    setDays: (next: AnalyticsPeriod) => setStored(next),
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
