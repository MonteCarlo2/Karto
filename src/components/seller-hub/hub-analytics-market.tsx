"use client";

import { useEffect, useMemo, useState } from "react";
import { loadMarketCommissions, type MarketCommissionResult } from "@/lib/seller-hub/client-api";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { formatInt, hub, hubSans } from "./hub-ui";
import { Card, fmtPct, SourceNote } from "./hub-analytics-ui";

type CategoryRow = { category: string; products: number; nmIds: string[] };

/** Рынок WB: комиссии по вашим категориям (официальная таблица WB) против того, что WB реально удержал. Рыночная аналитика требует подписки «Джем». */
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

  const [state, setState] = useState<{ key: string; results: MarketCommissionResult[]; effectiveFrom?: string; error?: string } | null>(null);
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    void loadMarketCommissions(categories.map((c) => c.category))
      .then((res) => {
        if (cancelled) return;
        setState({ key, results: res.results ?? [], effectiveFrom: res.effectiveFrom, error: res.ok ? undefined : res.error });
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

  return (
    <div className="space-y-4">
      <Card
        title="Комиссии WB по вашим категориям"
        hint={`Ставки из официальной таблицы комиссий WB для категорий, в которых у вас есть товары, и то, сколько WB реально удержал с выручки за ${days} дн.`}
      >
        {categories.length === 0 ? (
          <p className="text-[13px]" style={{ ...hubSans, color: hub.textMuted }}>
            В каталоге нет категорий товаров. Выгрузите данные кабинета.
          </p>
        ) : !ready ? (
          <p className="text-[13px]" style={{ ...hubSans, color: hub.textMuted }}>
            Ищу категории в таблице комиссий…
          </p>
        ) : state.error ? (
          <p className="text-[13px]" style={{ ...hubSans, color: hub.danger }}>
            {state.error}
          </p>
        ) : (
          <div className="space-y-4">
            {categories.map((c) => {
              const found = state.results.find((r) => r.query === c.category);
              const top = found?.matches[0];
              const hold = realHold.get(c.category) ?? null;
              return (
                <div key={c.category} className="rounded-xl border px-3.5 py-3" style={{ borderColor: hub.border }}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-[14px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                      {c.category}
                      <span className="ml-2 text-[12px] font-normal" style={{ color: hub.textSubtle }}>
                        {formatInt(c.products)} товаров
                      </span>
                    </p>
                    <p className="text-[12.5px]" style={{ ...hubSans, color: hub.textMuted }}>
                      WB удержал с выручки: <strong style={{ color: hub.text }}>{fmtPct(hold)}</strong>
                      <span style={{ color: hub.textSubtle }}> (комиссия, эквайринг и прочее)</span>
                    </p>
                  </div>
                  {!found || found.matches.length === 0 ? (
                    <p className="mt-1.5 text-[12.5px]" style={{ ...hubSans, color: hub.textMuted }}>
                      В таблице комиссий такой категории не нашлось.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-1">
                      {found.matches.map((m, idx) => (
                        <li key={m.name} className="flex flex-wrap items-baseline justify-between gap-2 text-[12.5px]" style={{ ...hubSans, color: idx === 0 ? hub.text : hub.textMuted }}>
                          <span className="min-w-0 truncate">{m.name}</span>
                          <span className="shrink-0 tabular-nums">
                            FBS {m.commissionFbs.toLocaleString("ru-RU")}% · FBO {m.commissionFbw.toLocaleString("ru-RU")}%
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {top ? (
                    <p className="mt-1.5 text-[11.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
                      Совпадение по названию приблизительное: сверьте строку таблицы с вашей категорией в кабинете WB.
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
        <SourceNote>
          Таблица комиссий WB (КВВ){state?.effectiveFrom ? `, действует с ${new Date(`${state.effectiveFrom}T00:00:00Z`).toLocaleDateString("ru-RU", { timeZone: "UTC" })}` : ""}. Фактическое удержание считается по отчёту реализации: оно включает эквайринг и другие удержания, поэтому может отличаться от ставки комиссии.
        </SourceNote>
      </Card>

      <Card title="Чего здесь пока нет" hint="Это не пропущено, а недоступно из открытых данных WB.">
        <ul className="space-y-2 text-[13px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
          <li>
            <strong style={{ color: hub.text }}>Спрос и объём рынка по категориям, позиции в поиске, ключевые запросы.</strong> Для сбора этих данных нужна подписка Джем.
          </li>
          <li>
            <strong style={{ color: hub.text }}>Конкуренты и их цены.</strong> Открытый поиск WB не отдаёт данные приложению, а данные о чужих магазинах WB через API продавца не выдаёт.
          </li>
          <li>
            <strong style={{ color: hub.text }}>Новости и изменения правил WB.</strong> Лента новостей, которая отбирается под ваш магазин (например, смена комиссии именно вашей категории), пока не подключена.
          </li>
        </ul>
      </Card>
    </div>
  );
}
