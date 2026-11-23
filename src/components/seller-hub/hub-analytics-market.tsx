"use client";

import { useEffect, useMemo, useState } from "react";
import { loadMarketCommissions, type MarketCommissionResult } from "@/lib/seller-hub/client-api";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { formatInt, hub, hubSans } from "./hub-ui";
import { Card, chartColors, EmptyNote, fmtPct, LoadingPage, StatBlock } from "./hub-analytics-ui";
import { registerHubCache } from "./hub-cache-registry";

const marketCache = registerHubCache(new Map<string, { key: string; results: MarketCommissionResult[]; effectiveFrom?: string; error?: string }>());

/** Сколько категорий показываем сразу: у продавца с сотней категорий экран остаётся таким же компактным. */
const VISIBLE_CATEGORIES = 8;

type CategoryRow = { category: string; products: number; nmIds: string[] };

/** Рынок WB: комиссии по вашим категориям (официальная таблица WB) против того, что WB реально удержал. */
export function HubAnalyticsMarket({ snapshot, days }: { snapshot?: SellerCatalogSnapshot; days: number }) {
  const categories = useMemo<CategoryRow[]>(() => {
    const map = new Map<string, string[]>();
    for (const item of snapshot?.items ?? []) {
      const c = item.category?.trim();
      if (!c) continue;
      map.set(c, [...(map.get(c) ?? []), item.externalId]);
    }
    return [...map.entries()].map(([category, nmIds]) => ({ category, products: nmIds.length, nmIds })).sort((a, b) => b.products - a.products);
  }, [snapshot?.items]);
  const key = categories.map((c) => c.category).join("|");

  const [local, setState] = useState<{ key: string; results: MarketCommissionResult[]; effectiveFrom?: string; error?: string } | null>(null);
  const state = local && local.key === key ? local : (marketCache.get(key) ?? null);
  useEffect(() => {
    if (!key || marketCache.has(key)) return;
    let cancelled = false;
    void loadMarketCommissions(categories.map((c) => c.category))
      .then((res) => {
        if (cancelled) return;
        const next = { key, results: res.results ?? [], effectiveFrom: res.effectiveFrom, error: res.ok ? undefined : res.error };
        if (res.ok) marketCache.set(key, next);
        setState(next);
      })
      .catch((e: unknown) => {
        if (!cancelled) setState({ key, results: [], error: e instanceof Error ? e.message : "Не удалось получить комиссии" });
      });
    return () => {
      cancelled = true;
    };
    // categories целиком определяется key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const ready = state != null && state.key === key;

  /** Фактическое удержание WB по товарам категории: (выручка − к перечислению) / выручка за выбранный период. */
  const realHold = useMemo(() => {
    const out = new Map<string, number | null>();
    const real = snapshot?.realization && !snapshot.realization.error ? snapshot.realization : null;
    const per = real?.periods?.[String(days)];
    // Окна периода из выгрузки (версия 6); для 28 дней при старом снимке — прежние окна.
    const windowOf = (nmId: string) => (per ? per.byNm[nmId]?.current : days === 28 ? real?.byNm[nmId]?.current : undefined);
    for (const c of categories) {
      let s = 0;
      let pay = 0;
      for (const nmId of c.nmIds) {
        const w = windowOf(nmId);
        if (!w) continue;
        s += w.S;
        pay += w.Pay;
      }
      out.set(c.category, s > 0 ? (s - pay) / s : null);
    }
    return out;
  }, [categories, snapshot?.realization, days]);

  const [showAll, setShowAll] = useState(false);
  const totalProducts = categories.reduce((a, c) => a + c.products, 0);
  const overallHold = useMemo(() => {
    const real = snapshot?.realization && !snapshot.realization.error ? snapshot.realization : null;
    const per = real?.periods?.[String(days)];
    let s = 0;
    let pay = 0;
    for (const c of categories) {
      for (const nmId of c.nmIds) {
        const w = per ? per.byNm[nmId]?.current : days === 28 ? real?.byNm[nmId]?.current : undefined;
        if (!w) continue;
        s += w.S;
        pay += w.Pay;
      }
    }
    return s > 0 ? (s - pay) / s : null;
  }, [categories, snapshot?.realization, days]);

  const mono = { fontFamily: "var(--font-geist-mono), ui-monospace, monospace", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.05em" } as const;
  const plural = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? "товар" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? "товара" : "товаров");

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatBlock hero color={chartColors.blue} label="Категорий" value={formatInt(categories.length)} sub="в которых у вас есть товары" />
        <StatBlock color={chartColors.teal} label="Товаров" value={formatInt(totalProducts)} sub="с указанной категорией" />
        <StatBlock color={chartColors.magenta} label="WB удержал" value={fmtPct(overallHold)} sub={`с выручки за ${days} дн.`} hint="Выручка минус перечисление, по отчёту реализации: комиссия, эквайринг и другие удержания" />
        <StatBlock color={chartColors.violet} label="Ставки WB" value={state?.effectiveFrom ? new Date(`${state.effectiveFrom}T00:00:00Z`).toLocaleDateString("ru-RU", { timeZone: "UTC", day: "numeric", month: "short" }) : "—"} sub="действуют с этой даты" />
      </div>

      {categories.length === 0 ? (
        <Card title="Комиссии WB по вашим категориям">
          <EmptyNote title="В каталоге нет категорий товаров">Выгрузите данные кабинета.</EmptyNote>
        </Card>
      ) : !ready ? (
        <LoadingPage title="Ищу категории в таблице комиссий" />
      ) : state.error ? (
        <Card title="Комиссии WB по вашим категориям">
          <EmptyNote title="Не удалось получить комиссии" tone="danger">
            {state.error}
          </EmptyNote>
        </Card>
      ) : (
        <Card title="Комиссии WB по вашим категориям" hint={`Ставки из таблицы комиссий WB и то, сколько WB реально удержал с выручки за ${days} дн.`}>
          <ul className="space-y-3">
            {(showAll ? categories : categories.slice(0, VISIBLE_CATEGORIES)).map((c) => {
              const found = state.results.find((r) => r.query === c.category);
              const hold = realHold.get(c.category) ?? null;
              const best = found?.matches[0];
              const diff = hold != null && best ? hold * 100 - best.commissionFbs : null;
              const holdTone = diff == null ? chartColors.inkSoft : diff <= 0.5 ? chartColors.green : chartColors.amber;
              return (
                <li key={c.category} className="grid items-stretch gap-3 rounded-[22px] p-3 lg:grid-cols-[minmax(220px,1.1fr)_repeat(3,minmax(0,1fr))]" style={{ backgroundColor: "rgba(1, 20, 8, 0.03)", border: "1px solid rgba(1, 20, 8, 0.1)" }}>
                  <div className="flex min-w-0 flex-col justify-center px-3 py-2">
                    <p className="text-[19px] font-semibold leading-[1.25] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>{c.category}</p>
                    <p className="mt-1 text-[15px]" style={{ ...hubSans, color: hub.textMuted }}>{formatInt(c.products)} {plural(c.products)}</p>
                    {!found || found.matches.length === 0 ? (
                      <p className="mt-2 text-[14.5px]" style={{ ...hubSans, color: hub.textSubtle }}>В таблице комиссий такой категории нет</p>
                    ) : diff != null ? (
                      <p className="mt-2 text-[14.5px]" style={{ ...hubSans, color: diff <= 0.5 ? "#067A55" : "#B4500A" }}>
                        {diff <= 0.5 ? "Удержание не выше ставки FBS" : `Удержание выше FBS на ${diff.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} п. п.`}
                      </p>
                    ) : null}
                  </div>
                  {[
                    { label: "Ставка FBS", v: best ? `${best.commissionFbs.toLocaleString("ru-RU")}%` : "—", color: chartColors.blue },
                    { label: "Ставка FBO", v: best ? `${best.commissionFbw.toLocaleString("ru-RU")}%` : "—", color: chartColors.violet },
                    { label: "Удержал WB", v: fmtPct(hold), color: holdTone },
                  ].map((t) => (
                    <div key={t.label} className="flex flex-col justify-center rounded-[18px] px-5 py-4" style={{ background: `linear-gradient(165deg, ${t.color}26 0%, ${t.color}0D 100%)`, border: `1px solid ${t.color}55` }}>
                      <p className="text-[15px]" style={{ ...hubSans, color: hub.textMuted }}>{t.label}</p>
                      <p className="mt-1.5 text-[38px] font-medium leading-none" style={{ ...mono, color: hub.text }}>{t.v}</p>
                    </div>
                  ))}
                  {found && found.matches.length > 1 ? (
                    <div className="flex flex-wrap gap-2 px-3 pb-1 lg:col-span-4">
                      <span className="py-1.5 text-[14px]" style={{ ...hubSans, color: hub.textSubtle }}>Похожие в таблице WB:</span>
                      {found.matches.slice(1).map((m) => (
                        <span key={m.name} className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[14.5px]" style={{ ...hubSans, backgroundColor: "rgba(1, 20, 8, 0.06)", color: hub.text }}>
                          {m.name}
                          <span style={{ ...mono, letterSpacing: "-0.03em", color: hub.textMuted }}>FBS {m.commissionFbs.toLocaleString("ru-RU")}% · FBO {m.commissionFbw.toLocaleString("ru-RU")}%</span>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {categories.length > VISIBLE_CATEGORIES ? (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-4 w-full rounded-[16px] py-3 text-[15.5px] font-semibold transition-colors hover:bg-black/[0.04]" style={{ ...hubSans, color: hub.text, border: "1px solid rgba(1, 20, 8, 0.2)" }}>
              {showAll ? "Свернуть" : `Показать все категории (${categories.length})`}
            </button>
          ) : null}
        </Card>
      )}
    </div>
  );
}
