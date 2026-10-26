"use client";

import { useEffect, useMemo, useState } from "react";
import { buildAdAdvice } from "@/lib/seller-hub/ads-advisor";
import { adsByProduct, dailyAdsSeries, summarizeAds, type AdsSummary } from "@/lib/seller-hub/ads-metrics";
import { lastFullDaysRange, snapshotTimeMs } from "@/lib/seller-hub/complete-days";
import { loadSellerHubAdsStats } from "@/lib/seller-hub/client-api";
import { taskFactsFromSnapshot } from "@/lib/seller-hub/task-engine/facts";
import { useUserSetting } from "./use-user-setting";
import type { SellerAdCampaignRow, SellerAdsStats, SellerCatalogSnapshot } from "@/lib/seller-hub/types";

export type AdsPeriodDays = "7" | "14" | "30";

/** Только кампании в статусах 7, 9, 11: для остальных WB статистику не формирует. */
const STATS_STATUSES = new Set([7, 9, 11]);

function shiftDate(iso: string, deltaDays: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + deltaDays * 86_400_000).toISOString().slice(0, 10);
}

/** Загрузка статистики за период; stats — только если она именно за этот период. */
function useAdsStats(ids: number[], range: { dateFrom: string; dateTo: string }, enabledRequested: boolean, attempt: number, ready?: SellerAdsStats | null) {
  // Сервер уже прочитал статистику за эти же даты (7 дней и 7 дней до них): берём её из снимка и в WB не ходим.
  // «Обновить» вручную (attempt > 0) по-прежнему перечитывает.
  const preset = ready && attempt === 0 && ready.dateFrom === range.dateFrom && ready.dateTo === range.dateTo ? ready : null;
  const enabled = enabledRequested && !preset;
  const [stats, setStats] = useState<SellerAdsStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ loadedAt?: string; stale?: boolean; staleReason?: string }>({});
  const key = `${ids.join(",")}|${range.dateFrom}|${range.dateTo}|${attempt}`;

  useEffect(() => {
    if (!enabled || ids.length === 0) return;
    let cancelled = false;
    void loadSellerHubAdsStats({ campaignIds: ids, ...range, refresh: attempt > 0 })
      .then((result) => {
        if (cancelled) return;
        if (result.ok && result.stats) {
          setStats(result.stats);
          setMeta({ loadedAt: result.loadedAt, stale: result.stale, staleReason: result.staleReason });
          setError(null);
        } else {
          setError(result.error ?? "Не удалось загрузить статистику рекламы");
        }
        setLoadedFor(key);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Не удалось загрузить статистику рекламы");
        setLoadedFor(key);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, ids, range, key, attempt]);

  if (preset) return { stats: preset, error: null, loading: false, loadedAt: preset.loadedAt, stale: undefined, staleReason: undefined };
  const loading = enabled && ids.length > 0 && loadedFor !== key;
  const shown = stats && stats.dateFrom === range.dateFrom && stats.dateTo === range.dateTo ? stats : null;
  return { stats: shown, error, loading, ...meta };
}

/** Все данные раздела «Продвижение»: период, статистика, сравнение, советы. Один источник для всех вкладок. */
export function useAdsData({
  campaigns,
  snapshot,
  connected,
}: {
  campaigns: SellerAdCampaignRow[];
  snapshot?: SellerCatalogSnapshot;
  connected?: boolean;
}) {
  const [days, setDays] = useUserSetting<AdsPeriodDays>("ads.days", "7");
  const [compare, setCompare] = useUserSetting<boolean>("ads.compare", false);
  const [attempt, setAttempt] = useState(0);
  const syncedAt = snapshot?.syncedAt;

  const ids = useMemo(
    () =>
      campaigns
        .filter((c) => c.status != null && STATS_STATUSES.has(c.status))
        .map((c) => Number(c.id))
        .filter((id) => Number.isInteger(id) && id > 0),
    [campaigns],
  );
  const nowMs = snapshotTimeMs({ syncedAt });
  const range = useMemo(() => lastFullDaysRange(nowMs || Date.parse("2026-01-01"), Number(days)), [nowMs, days]);
  const prevRange = useMemo(
    () => ({ dateFrom: shiftDate(range.dateFrom, -Number(days)), dateTo: shiftDate(range.dateTo, -Number(days)) }),
    [range, days],
  );

  const current = useAdsStats(ids, range, Boolean(connected && syncedAt), attempt, snapshot?.adsStats);
  /** Прошлый период грузим только после текущего и по просьбе: у WB лимит запросов статистики. */
  const previous = useAdsStats(ids, prevRange, Boolean(connected && syncedAt && compare && current.stats), attempt, snapshot?.adsStatsPrev);

  const summary = useMemo(() => (current.stats ? summarizeAds(current.stats.campaigns) : null), [current.stats]);
  const prevSummary = useMemo(() => (previous.stats ? summarizeAds(previous.stats.campaigns) : null), [previous.stats]);
  const series = useMemo(() => (current.stats ? dailyAdsSeries(current.stats.campaigns) : []), [current.stats]);
  /**
   * ДРР общий: расход на рекламу ÷ сумма ВСЕХ заказов магазина за те же дни (из Analytics WB).
   * Считаем только по дням, которые есть и в рекламе, и в Analytics; null — общих дней нет или заказов нет.
   */
  const overallDrr = useMemo(() => {
    const storeDays = snapshot?.analytics?.daily ?? [];
    if (series.length === 0 || storeDays.length === 0) return null;
    const storeByDate = new Map(storeDays.map((d) => [d.date.slice(0, 10), d.revenue]));
    let spend = 0;
    let orders = 0;
    let common = 0;
    for (const day of series) {
      const revenue = storeByDate.get(day.date);
      if (revenue == null) continue;
      spend += day.spend;
      orders += revenue;
      common += 1;
    }
    return common > 0 && orders > 0 ? { percent: Math.round((spend / orders) * 1000) / 10, days: common, spend, orders } : null;
  }, [series, snapshot?.analytics]);
  /** Показатели по каждой кампании за период, по id. */
  const byCampaign = useMemo(() => {
    const map = new Map<string, AdsSummary>();
    for (const row of current.stats?.campaigns ?? []) map.set(row.advertId, summarizeAds([row]));
    return map;
  }, [current.stats]);
  const allProductRows = useMemo(() => (current.stats ? adsByProduct(current.stats.campaigns) : []), [current.stats]);
  /** Артикулы, по которым в этот период тратились деньги. */
  const productRows = useMemo(() => allProductRows.filter((row) => row.spend > 0), [allProductRows]);
  /** Заказы артикулов без расхода: WB отнёс их к рекламе другого товара (ассоциированные конверсии). */
  const associated = useMemo(() => {
    const rows = allProductRows.filter((row) => row.spend === 0 && row.orders > 0);
    return rows.length === 0
      ? null
      : {
          products: rows.length,
          orders: rows.reduce((sum, row) => sum + row.orders, 0),
          orderSum: rows.reduce((sum, row) => sum + row.orderSum, 0),
        };
  }, [allProductRows]);

  const advisorProducts = useMemo(() => {
    if (!snapshot || snapshot.items.length === 0) return [];
    return taskFactsFromSnapshot(snapshot).products.map((fact) => ({
      nmId: fact.nmId,
      title: fact.title,
      marginRub: fact.marginRub,
      marginPercent: fact.marginPercent,
      stock: fact.stockFbo != null || fact.stockFbs != null ? (fact.stockFbo ?? 0) + (fact.stockFbs ?? 0) : null,
      orders28: fact.orders,
    }));
  }, [snapshot]);
  const titles = useMemo(() => new Map(advisorProducts.map((p) => [p.nmId, p.title])), [advisorProducts]);
  const marginByNm = useMemo(
    () => new Map(advisorProducts.map((p) => [p.nmId, p.marginPercent])),
    [advisorProducts],
  );
  const campaignNames = useMemo(() => new Map(campaigns.map((c) => [c.id, c.name ?? c.id])), [campaigns]);
  const advice = useMemo(
    () =>
      current.stats
        ? buildAdAdvice({
            days: Number(days),
            campaigns,
            campaignStats: current.stats.campaigns,
            products: advisorProducts,
            adsByProduct: allProductRows,
            storeCpo: summary?.cpo ?? null,
          })
        : [],
    [current.stats, days, campaigns, advisorProducts, allProductRows, summary],
  );

  return {
    hasCampaigns: ids.length > 0,
    days,
    setDays,
    compare,
    setCompare,
    retry: () => setAttempt((n) => n + 1),
    range,
    prevRange,
    current,
    previous,
    summary,
    prevSummary,
    series,
    byCampaign,
    overallDrr,
    allProductRows,
    productRows,
    associated,
    advisorProducts,
    titles,
    marginByNm,
    campaignNames,
    advice,
  };
}

export type AdsData = ReturnType<typeof useAdsData>;
