"use client";

import { useEffect, useMemo, useState } from "react";
import { loadSellerHubAdsStats } from "@/lib/seller-hub/client-api";
import { moscowDateKey } from "@/lib/seller-hub/complete-days";
import { adsByProduct, changePercent, dailyAdsSeries, summarizeAds } from "@/lib/seller-hub/ads-metrics";
import { buildStoreKpis } from "@/lib/seller-hub/analytics-core";
import type { SellerAdsStats, SellerCatalogSnapshot, SellerFunnelSnapshot } from "@/lib/seller-hub/types";
import { formatInt, formatRub, hub, hubSans } from "./hub-ui";
import { dayLabel, Card, fmtPct, Kpi, SourceNote } from "./hub-analytics-ui";

/** WB отдаёт статистику рекламы не больше чем за 31 день за запрос. */
const MAX_ADS_DAYS = 30;
const DAY_MS = 86_400_000;
const dayKey = (ms: number) => moscowDateKey(ms);

type Loaded = { key: string; current: SellerAdsStats | null; previous: SellerAdsStats | null; error?: string; /** loading — прошлый период ещё грузится, failed — WB не отдал его (лимит запросов). */ prevStatus: "loading" | "ok" | "failed" | "none" };

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
  const [state, setState] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!connected || ids.length === 0) return;
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
  const campaignName = useMemo(() => new Map(campaigns.map((c) => [c.id, c.name ?? `Кампания ${c.id}`])), [campaigns]);
  /** Общий ДРР и доля рекламных заказов считаем только когда период воронки совпадает с периодом рекламы. */
  const shop = useMemo(() => (days <= MAX_ADS_DAYS ? buildStoreKpis(funnel, null, 0)?.current ?? null : null), [days, funnel]);

  if (!snapshot?.ads || campaigns.length === 0) {
    return (
      <Card title="Рекламных кампаний нет или они не загружены">
        <p className="text-[13px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
          Реклама читается из кабинета WB. Выгрузите данные кабинета; нужна категория «Продвижение» в API-токене.
        </p>
      </Card>
    );
  }
  if (!connected) {
    return (
      <Card title="Нужно подключение кабинета">
        <p className="text-[13px]" style={{ ...hubSans, color: hub.textMuted }}>
          Подключите кабинет WB, чтобы увидеть статистику рекламы.
        </p>
      </Card>
    );
  }
  if (!ready) {
    return (
      <Card title="Загружаю статистику рекламы…">
        <p className="text-[13px]" style={{ ...hubSans, color: hub.textMuted }}>
          Данные за {adsDays} дн. и за предыдущие {adsDays}. Повторно берутся из кэша.
        </p>
      </Card>
    );
  }
  if (!stats || !summary) {
    return (
      <Card title="Статистика рекламы недоступна">
        <p className="text-[13px]" style={{ ...hubSans, color: hub.danger }}>
          {state.error ?? "WB не вернул статистику рекламы."} Попробуйте позже: WB ограничивает частоту запросов.
        </p>
      </Card>
    );
  }
  const totalDrr = shop && shop.orderSum > 0 ? summary.spend / shop.orderSum : null;
  const adShare = shop && shop.orders > 0 ? summary.orders / shop.orders : null;
  const maxDay = Math.max(1, ...series.map((d) => d.spend));
  const wasted = products.filter((p) => p.spend > 0 && p.orders === 0).slice(0, 5);
  const campRows = [...stats.campaigns].sort((a, b) => b.spend - a.spend);

  return (
    <div className="space-y-4">
      <p className="text-[12.5px]" style={{ ...hubSans, color: hub.textMuted }}>
        Период: {dayLabel(range.from)} — {dayLabel(range.to)} ({adsDays} дн.), сравнение с предыдущими {adsDays} днями.
        {days > MAX_ADS_DAYS ? ` WB отдаёт статистику рекламы не больше чем за ${MAX_ADS_DAYS} дней, поэтому при периоде ${days} дн. показаны последние ${MAX_ADS_DAYS}.` : ""}
      </p>

      {state.prevStatus === "loading" ? (
        <p className="text-[12.5px]" style={{ ...hubSans, color: hub.textMuted }}>
          Сравнение с предыдущим периодом загружается: WB ограничивает частоту запросов, это займёт до пары минут.
        </p>
      ) : state.prevStatus === "failed" ? (
        <p className="text-[12.5px]" style={{ ...hubSans, color: hub.warn }}>
          Предыдущий период WB не отдал (лимит запросов). Показатели ниже без сравнения; обновите вкладку через несколько минут.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Расход на рекламу" value={formatRub(summary.spend)} change={cmp(summary.spend, prevSummary?.spend)} good="neutral" />
        <Kpi label="Заказы по рекламе" value={formatInt(summary.orders)} change={cmp(summary.orders, prevSummary?.orders)} sub={`на ${formatRub(summary.orderSum)}`} />
        <Kpi label="ДРР рекламы" value={summary.drr == null ? "—" : `${summary.drr.toLocaleString("ru-RU")}%`} good="down" change={cmp(summary.drr, prevSummary?.drr)} hint="Расход ÷ сумма заказов, которые WB отнёс к рекламе" />
        <Kpi label="Цена заказа (CPO)" value={summary.cpo == null ? "—" : formatRub(summary.cpo)} good="down" change={cmp(summary.cpo, prevSummary?.cpo)} sub="расход на один заказ" />
        <Kpi label="Показы" value={formatInt(summary.views)} change={cmp(summary.views, prevSummary?.views)} />
        <Kpi label="Клики" value={formatInt(summary.clicks)} change={cmp(summary.clicks, prevSummary?.clicks)} sub={summary.ctr == null ? undefined : `CTR ${summary.ctr.toLocaleString("ru-RU")}%`} />
        <Kpi label="ДРР общий" value={fmtPct(totalDrr)} good="down" hint="Расход на рекламу ÷ сумма всех заказов магазина за тот же период" sub={shop ? "от всех заказов магазина" : funnelLoading ? "загружаю воронку за период…" : "доступно при периоде до 30 дней"} />
        <Kpi label="Доля рекламных заказов" value={fmtPct(adShare)} good="neutral" hint="Заказы по рекламе ÷ все заказы магазина за период" sub={shop ? "остальное — органика" : funnelLoading ? "загружаю воронку за период…" : "доступно при периоде до 30 дней"} />
      </div>

      {series.length > 0 ? (
        <Card title="Расход и заказы по дням" hint="Серая полоса — расход за день, синяя точка — есть заказы по рекламе.">
          <div className="flex h-24 items-end gap-[3px]">
            {series.map((d) => (
              <div key={d.date} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${dayLabel(d.date)}: расход ${formatRub(d.spend)}, заказов ${d.orders}`}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: d.orders > 0 ? hub.blue : "transparent" }} />
                <div className="w-full rounded-t-[2px]" style={{ height: `${Math.max(2, (d.spend / maxDay) * 100)}%`, backgroundColor: hub.textSubtle, opacity: 0.55 }} />
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Кампании" hint="По убыванию расхода.">
          <ul className="space-y-1.5">
            {campRows.slice(0, 8).map((c) => {
              const s = summarizeAds([c]);
              return (
                <li key={c.advertId} className="flex items-baseline justify-between gap-3 text-[13px]" style={hubSans}>
                  <span className="min-w-0 truncate" style={{ color: hub.text }}>
                    {campaignName.get(c.advertId) ?? `Кампания ${c.advertId}`}
                  </span>
                  <span className="flex shrink-0 items-center gap-2 tabular-nums" style={{ color: hub.textMuted }}>
                    {formatRub(c.spend)} · {c.orders} зак.
                    {s.drr != null ? <span style={{ color: s.drr > 30 ? hub.danger : hub.textMuted }}>ДРР {s.drr.toLocaleString("ru-RU")}%</span> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title="Расход без заказов" hint="Товары, на рекламу которых потрачены деньги, а заказов по рекламе нет.">
          {wasted.length === 0 ? (
            <p className="text-[13px]" style={{ ...hubSans, color: hub.green }}>
              Таких товаров нет: у каждого рекламируемого товара есть заказы по рекламе.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {wasted.map((p) => (
                <li key={p.nmId} className="flex items-baseline justify-between gap-3 text-[13px]" style={hubSans}>
                  <span className="min-w-0 truncate" style={{ color: hub.text }}>
                    {titles.get(p.nmId) ?? p.name ?? p.nmId}
                  </span>
                  <span className="shrink-0 tabular-nums" style={{ color: hub.danger }}>
                    {formatRub(p.spend)} · {formatInt(p.clicks)} кликов
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
