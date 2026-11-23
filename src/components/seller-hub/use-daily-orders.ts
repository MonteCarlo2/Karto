"use client";

import { useEffect, useMemo, useState } from "react";
import { loadSellerHubRegionOrders } from "@/lib/seller-hub/client-api";
import { buildDailyTrend } from "@/lib/seller-hub/daily-trend";
import { moscowDateKey } from "@/lib/seller-hub/complete-days";
import type { SellerRegionOrders } from "@/lib/seller-hub/types";
import { registerHubCache } from "./hub-cache-registry";

/**
 * Заказы по дням за выбранный период (отчёт «Заказы» WB, серверный кэш). Один источник для «Сводки» и «Динамики»:
 * график сверху сводки и вкладка динамики показывают одни и те же дни.
 */
/** Ответы живут в памяти 5 минут: переход между вкладками показывает данные сразу, а устаревшие обновляются в фоне. */
const dailyCache = registerHubCache(new Map<string, { at: number; data: SellerRegionOrders }>());
const DAILY_FRESH_MS = 5 * 60_000;
/** Паузы перед повторами после сбоя, мс: пока они идут, человек видит загрузку, а не ошибку. */
const RETRY_DELAYS = [2500, 6000, 12000];

export function useDailyOrders(connected: boolean | undefined, days: number) {
  const [loaded, setLoaded] = useState<{ key: string; data: SellerRegionOrders | null; error?: string } | null>(null);
  const key = `${days}`;

  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    /** Сбой не показываем сразу: пока есть попытки, на экране обычная загрузка, а данные подтягиваются сами. Старые данные не пропадают. */
    const load = (failures = 0) => {
      const fail = (message: string) => {
        if (cancelled) return;
        const old = dailyCache.get(key)?.data ?? null;
        if (failures < RETRY_DELAYS.length) {
          retryTimer = setTimeout(() => load(failures + 1), RETRY_DELAYS[failures]);
          if (old) setLoaded({ key, data: old, error: undefined });
          return;
        }
        setLoaded({ key, data: old, error: message });
      };
      void loadSellerHubRegionOrders({ days })
        .then((res) => {
          if (cancelled) return;
          if (res.ok && res.regions) {
            dailyCache.set(key, { at: Date.now(), data: res.regions });
            setLoaded({ key, data: res.regions, error: undefined });
          } else fail(res.error ?? "Не удалось загрузить заказы");
        })
        .catch((e: unknown) => fail(e instanceof Error ? e.message : "Не удалось загрузить заказы"));
    };
    const hit = dailyCache.get(key);
    if (!hit || Date.now() - hit.at >= DAILY_FRESH_MS) load();
    // Пока вкладка открыта, данные обновляются сами: раз в 5 минут и при возвращении на вкладку браузера.
    const timer = window.setInterval(() => load(), DAILY_FRESH_MS);
    const onVisible = () => {
      const h = dailyCache.get(key);
      if (document.visibilityState === "visible" && (!h || Date.now() - h.at >= DAILY_FRESH_MS)) load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [connected, days, key]);

  const cached = dailyCache.get(key);
  const fresh = loaded != null && loaded.key === key ? loaded : cached ? { key, data: cached.data, error: undefined } : null;
  const ready = fresh != null;
  const data = fresh ? fresh.data : null;
  const todayKey = moscowDateKey(data ? Date.parse(data.loadedAt) : 0);
  const trend = useMemo(() => buildDailyTrend(data?.daily, todayKey, data?.dateFrom), [data, todayKey]);
  return { ready, data, trend, error: fresh ? fresh.error : undefined };
}

export type DailyOrders = ReturnType<typeof useDailyOrders>;

/**
 * Заказы по дням за выбранный период и, если WB отдаёт столько дней (не больше 90), за такой же предыдущий период.
 * Один запрос на двойное окно: текущий период — последние `days` дней, предыдущий — `days` дней перед ним.
 */
export function useDailyOrdersCompare(connected: boolean | undefined, days: number) {
  const compare = days * 2 <= 90;
  const windowDays = compare ? days * 2 : days;
  const { ready, trend, error, data } = useDailyOrders(connected, windowDays);
  const split = useMemo(() => {
    if (!trend) return null;
    const all = trend.days;
    const current = all.slice(-days);
    const previous = compare && all.length >= days * 2 ? all.slice(-days * 2, -days) : null;
    return { current, previous };
  }, [trend, days, compare]);
  return { ready, error, data, current: split?.current ?? null, previous: split?.previous ?? null };
}
