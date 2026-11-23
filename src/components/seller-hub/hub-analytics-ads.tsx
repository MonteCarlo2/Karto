"use client";

import { useEffect, useMemo, useState } from "react";
import { loadSellerHubAdsStats } from "@/lib/seller-hub/client-api";
import { moscowDateKey } from "@/lib/seller-hub/complete-days";
import { adsByProduct, changePercent, dailyAdsSeries, summarizeAds } from "@/lib/seller-hub/ads-metrics";
import { buildStoreKpis } from "@/lib/seller-hub/analytics-core";
import type { SellerAdsStats, SellerCatalogSnapshot, SellerFunnelSnapshot } from "@/lib/seller-hub/types";
import { formatInt, formatRub, hub, hubNumeric, hubSans } from "./hub-ui";
import { CompareChart } from "./hub-analytics-charts";
import { BarRow, Card, chartColors, dayLabel, DeltaChip, EmptyNote, fmtPct, LoadingPage, ProductCell, SourceNote, StatBlock } from "./hub-analytics-ui";
import { registerHubCache } from "./hub-cache-registry";

/** WB отдаёт статистику рекламы не больше чем за 31 день за запрос. */
const MAX_ADS_DAYS = 30;
const DAY_MS = 86_400_000;
const dayKey = (ms: number) => moscowDateKey(ms);

type Loaded = { key: string; current: SellerAdsStats | null; previous: SellerAdsStats | null; error?: string; /** loading — прошлый период ещё грузится, failed — WB не отдал его (лимит запросов). */ prevStatus: "loading" | "ok" | "failed" | "none" };

const adsCache = registerHubCache(new Map<string, { at: number; v: Loaded }>());
const ADS_FRESH_MS = 5 * 60_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** Через сколько повторять запрос прошлого периода: у WB для статистики рекламы лимит около одного запроса в минуту. */
const RETRY_PREV_MS = 65_000;

/** Реклама в аналитике: расход, заказы по рекламе, ДРР, динамика, кампании и товары. Статистика WB, период не больше 30 дней. */
export function HubAnalyticsAds({ snapshot, connected, days, funnel, funnelLoading }: { snapshot?: SellerCatalogSnapshot; connected?: boolean; days: number; funnel?: SellerFunnelSnapshot; funnelLoading?: boolean }) {
  const adsDays = Math.min(days, MAX_ADS_DAYS);
  const campaigns = useMemo(() => snapshot?.ads?.campaigns ?? [], [snapshot?.ads]);
  const ids = useMemo(() => campaigns.map((c) => Number(c.id)).filter((id) => Number.isInteger(id) && id > 0), [campaigns]);
  const [nowMs] = useState(() => Date.now());
  const range = useMemo(() => {
    const to = dayKey(nowMs);
    return {
      to,
      from: dayKey(nowMs - (adsDays - 1) * DAY_MS),
      prevTo: dayKey(nowMs - adsDays * DAY_MS),
      prevFrom: dayKey(nowMs - (2 * adsDays - 1) * DAY_MS),
    };
  }, [nowMs, adsDays]);
  const key = `${ids.join(",")}|${range.from}|${range.to}`;
  const [local, setLocal] = useState<Loaded | null>(null);
  const state = local && local.key === key ? local : (adsCache.get(key)?.v ?? null);
  const setState = (v: Loaded | ((s: Loaded | null) => Loaded | null)) => {
    const next = typeof v === "function" ? v(adsCache.get(key)?.v ?? null) : v;
    if (next) adsCache.set(key, { at: Date.now(), v: next });
    setLocal(next);
  };

  useEffect(() => {
    if (!connected || ids.length === 0) return;
    const hit = adsCache.get(key);
    if (hit && Date.now() - hit.at < ADS_FRESH_MS && hit.v.prevStatus !== "loading") return;
    let cancelled = false;
    // Текущий период показываем сразу. Прошлый запрашиваем после него и при лимите WB повторяем через минуту: так сравнение не пропадает молча.
    void (async () => {
      const cur = await loadSellerHubAdsStats({ campaignIds: ids, dateFrom: range.from, dateTo: range.to });
      if (cancelled) return;
      if (!cur.ok || !cur.stats) {
        setState({ key, current: null, previous: null, error: cur.error, prevStatus: "none" });
        return;
      }
      setState({ key, current: cur.stats, previous: null, prevStatus: "loading" });
      for (let attempt = 0; attempt < 3; attempt += 1) {
        if (attempt > 0) await sleep(RETRY_PREV_MS);
        if (cancelled) return;
        const prev = await loadSellerHubAdsStats({ campaignIds: ids, dateFrom: range.prevFrom, dateTo: range.prevTo });
        if (cancelled) return;
        if (prev.ok && prev.stats) {
          setState((s) => (s && s.key === key ? { ...s, previous: prev.stats ?? null, prevStatus: "ok" } : s));
          return;
        }
      }
      setState((s) => (s && s.key === key ? { ...s, prevStatus: "failed" } : s));
    })()      .catch((e: unknown) => {
        if (!cancelled) setState({ key, current: null, previous: null, error: e instanceof Error ? e.message : "Не удалось загрузить статистику рекламы", prevStatus: "none" });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, ids, range, key]);

  const ready = state != null && state.key === key;
  const stats = ready ? state.current : null;
  const summary = useMemo(() => (stats ? summarizeAds(stats.campaigns) : null), [stats]);
  const prevSummary = useMemo(() => (ready && state.previous ? summarizeAds(state.previous.campaigns) : null), [ready, state]);
  /** Изменение к прошлому периоду: пока прошлого периода нет, чипы с процентами не рисуем (иначе «нет базы» было бы неправдой). */
  const cmp = (cur: number | null, prev: number | null | undefined) => (prevSummary ? changePercent(cur, prev ?? null) : undefined);
  const series = useMemo(() => (stats ? dailyAdsSeries(stats.campaigns) : []), [stats]);
  const products = useMemo(() => (stats ? adsByProduct(stats.campaigns) : []), [stats]);
  const titles = useMemo(() => new Map((snapshot?.items ?? []).map((i) => [i.externalId, i.title || i.vendorCode || i.externalId])), [snapshot?.items]);
  const photos = useMemo(() => new Map((snapshot?.items ?? []).map((i) => [i.externalId, i.imageUrl ?? undefined])), [snapshot?.items]);
  const campaignName = useMemo(() => new Map(campaigns.map((c) => [c.id, c.name ?? `Кампания ${c.id}`])), [campaigns]);
  /** Общий ДРР и доля рекламных заказов считаем только когда период воронки совпадает с периодом рекламы. */
  const shop = useMemo(() => (days <= MAX_ADS_DAYS ? buildStoreKpis(funnel, null, 0)?.current ?? null : null), [days, funnel]);

  if (!snapshot?.ads || campaigns.length === 0) {
    return (
      <Card title="Рекламных кампаний нет или они не загружены">
        <EmptyNote title="Реклама читается из кабинета WB">Выгрузите данные кабинета; нужна категория «Продвижение» в API-токене.</EmptyNote>
      </Card>
    );
  }
  if (!connected) {
    return (
      <Card title="Нужно подключение кабинета">
        <EmptyNote title="Статистика рекламы берётся из WB">Подключите кабинет WB, чтобы увидеть статистику рекламы.</EmptyNote>
      </Card>
    );
  }
  if (!ready) {
    return <LoadingPage title="Загружаю статистику рекламы" />;
  }
  if (!stats || !summary) {
    return (
      <Card title="Статистика рекламы недоступна">
        <EmptyNote title={state.error ?? "WB не вернул статистику рекламы."} tone="danger">
          Попробуйте позже: WB ограничивает частоту запросов.
        </EmptyNote>
      </Card>
    );
  }
  const totalDrr = shop && shop.orderSum > 0 ? summary.spend / shop.orderSum : null;
  const adShare = shop && shop.orders > 0 ? summary.orders / shop.orders : null;
  const wasted = products.filter((p) => p.spend > 0 && p.orders === 0).slice(0, 5);
  const campRows = [...stats.campaigns].sort((a, b) => b.spend - a.spend).slice(0, 8);
  const maxCamp = Math.max(1, ...campRows.map((c) => c.spend));
  const orderPoints = series.map((d) => ({ date: d.date, value: d.orders, note: `Расход за день: ${formatRub(d.spend)}` }));
  const dayPoints = series.map((d) => ({ date: d.date, value: d.spend, note: d.orders > 0 ? `Заказов по рекламе: ${formatInt(d.orders)}` : "Заказов по рекламе нет" }));

  return (
    <div className="space-y-3">
      <div className="space-y-3">
        <p className="text-[14px] leading-6" style={{ ...hubSans, color: hub.textMuted }}>
          <span className="font-semibold" style={{ color: hub.text }}>
            {dayLabel(range.from)} — {dayLabel(range.to)} ({adsDays} дн.)
          </span>
          , сравнение с предыдущими {adsDays} днями.
          {days > MAX_ADS_DAYS ? ` WB отдаёт статистику рекламы не больше чем за ${MAX_ADS_DAYS} дней, поэтому при периоде ${days} дн. показаны последние ${MAX_ADS_DAYS}.` : ""}
        </p>
        {state.prevStatus === "loading" ? (
          <p className="text-[13px]" style={{ ...hubSans, color: hub.textMuted }}>
            Сравнение с предыдущим периодом загружается: WB ограничивает частоту запросов, это займёт до пары минут.
          </p>
        ) : state.prevStatus === "failed" ? (
          <p className="text-[13px]" style={{ ...hubSans, color: hub.warn }}>
            Предыдущий период WB не отдал (лимит запросов). Показатели ниже без сравнения; обновите вкладку через несколько минут.
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatBlock label="Расход на рекламу" color={chartColors.blue} value={formatRub(summary.spend)} delta={cmp(summary.spend, prevSummary?.spend) !== undefined ? <DeltaChip change={cmp(summary.spend, prevSummary?.spend) ?? null} /> : undefined} />
        <StatBlock label="Заказы по рекламе" color={chartColors.teal} value={formatInt(summary.orders)} delta={cmp(summary.orders, prevSummary?.orders) !== undefined ? <DeltaChip change={cmp(summary.orders, prevSummary?.orders) ?? null} /> : undefined} sub={`на ${formatRub(summary.orderSum)}`} />
        <StatBlock label="ДРР рекламы" color={chartColors.magenta} value={summary.drr == null ? "—" : `${summary.drr.toLocaleString("ru-RU")}%`} delta={cmp(summary.drr, prevSummary?.drr) !== undefined ? <DeltaChip change={cmp(summary.drr, prevSummary?.drr) ?? null} /> : undefined} hint="Расход ÷ сумма заказов, которые WB отнёс к рекламе" />
        <StatBlock label="Цена заказа (CPO)" color={chartColors.amber} value={summary.cpo == null ? "—" : formatRub(summary.cpo)} delta={cmp(summary.cpo, prevSummary?.cpo) !== undefined ? <DeltaChip change={cmp(summary.cpo, prevSummary?.cpo) ?? null} /> : undefined} sub="расход на один заказ" />
        <StatBlock label="Показы" color={chartColors.violet} value={formatInt(summary.views)} delta={cmp(summary.views, prevSummary?.views) !== undefined ? <DeltaChip change={cmp(summary.views, prevSummary?.views) ?? null} /> : undefined} />
        <StatBlock label="Клики" color={chartColors.teal} value={formatInt(summary.clicks)} delta={cmp(summary.clicks, prevSummary?.clicks) !== undefined ? <DeltaChip change={cmp(summary.clicks, prevSummary?.clicks) ?? null} /> : undefined} sub={summary.ctr == null ? undefined : `CTR ${summary.ctr.toLocaleString("ru-RU")}%`} />
        <StatBlock label="ДРР общий" color={chartColors.magenta} value={fmtPct(totalDrr)} hint="Расход на рекламу ÷ сумма всех заказов магазина за тот же период" sub={shop ? "от всех заказов магазина" : funnelLoading ? "загружаю воронку за период…" : "доступно при периоде до 30 дней"} />
        <StatBlock label="Доля рекламных заказов" color={chartColors.green} value={fmtPct(adShare)} hint="Заказы по рекламе ÷ все заказы магазина за период" sub={shop ? "остальное — органика" : funnelLoading ? "загружаю воронку за период…" : "доступно при периоде до 30 дней"} />
      </div>

      {series.length > 0 ? (
        <div className="grid gap-3 xl:grid-cols-2">
          <Card title="Расход по дням" hint="Сколько потрачено на рекламу за день. Наведите на столбик, чтобы увидеть заказы этого дня.">
            <CompareChart points={dayPoints} label="Расход" color={chartColors.blue} fmt={formatRub} height={250} />
          </Card>
          <Card title="Заказы по рекламе по дням" hint="Сколько заказов WB отнёс к рекламе в каждый день. Те же дни, что слева.">
            <CompareChart points={orderPoints} label="Заказы по рекламе" color={chartColors.teal} fmt={(n) => `${formatInt(n)} шт.`} height={250} />
          </Card>
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Кампании" hint="По убыванию расхода.">
          <ul className="space-y-3">
            {campRows.map((c) => {
              const s = summarizeAds([c]);
              return (
                <li key={c.advertId}>
                  <BarRow label={campaignName.get(c.advertId) ?? `Кампания ${c.advertId}`} value={c.spend} max={maxCamp} text={formatRub(c.spend)} color={chartColors.blue} />
                  <p className="mt-1.5 text-[12.5px] sm:pl-[236px]" style={{ ...hubSans, ...hubNumeric, color: hub.textSubtle }}>
                    {c.orders} зак.
                    {s.drr != null ? (
                      <span style={{ color: s.drr > 30 ? hub.danger : hub.textSubtle, fontWeight: s.drr > 30 ? 600 : 400 }}> · ДРР {s.drr.toLocaleString("ru-RU")}%</span>
                    ) : null}
                  </p>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title="Расход без заказов" hint="Товары, на рекламу которых потрачены деньги, а заказов по рекламе нет.">
          {wasted.length === 0 ? (
            <p className="flex items-center gap-2.5 text-[14px]" style={{ ...hubSans, color: hub.greenDark }}>
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#2F9E63" }} aria-hidden />
              Таких товаров нет: у каждого рекламируемого товара есть заказы по рекламе.
            </p>
          ) : (
            <ul className="divide-y" style={{ borderColor: hub.borderSoft }}>
              {wasted.map((p) => (
                <li key={p.nmId} className="flex items-center justify-between gap-4 py-3" style={{ borderColor: hub.borderSoft }}>
                  <div className="min-w-0">
                    <ProductCell photo={photos.get(p.nmId)} title={titles.get(p.nmId) ?? p.name ?? p.nmId} sub={p.nmId} />
                  </div>
                  <span className="shrink-0 text-right" style={{ ...hubSans, ...hubNumeric }}>
                    <span className="block text-[14px] font-semibold" style={{ color: hub.danger }}>
                      {formatRub(p.spend)}
                    </span>
                    <span className="block text-[12px]" style={{ color: hub.textSubtle }}>
                      {formatInt(p.clicks)} кликов
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <SourceNote>Это не значит, что товар не продаётся: заказы без рекламы здесь не видны.</SourceNote>
        </Card>
      </div>
      <SourceNote>Источник: статистика рекламных кампаний WB. «Заказы по рекламе» WB считает по рекламным кликам; органические заказы в них не входят.</SourceNote>
    </div>
  );
}
