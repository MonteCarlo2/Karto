"use client";

import { pctChange } from "@/lib/seller-hub/analytics-core";
import { formatInt, formatRub, hub, hubSans } from "./hub-ui";
import { Card, DeltaChip, fmtPct, SourceNote } from "./hub-analytics-ui";
import type { AnalyticsData } from "./use-analytics-data";

type Stage = { id: string; label: string; cur: number; past: number | null; rateLabel?: string; rate?: number | null; pastRate?: number | null };

/** Воронка магазина: просмотр → корзина → заказ → выкуп за выбранный период против предыдущего такого же, и товары с утечками. */
export function HubAnalyticsFunnel({ data, days }: { data: AnalyticsData; days: number }) {
  const { kpis, rows } = data;
  if (!kpis) {
    return (
      <Card title="Воронки пока нет">
        <p className="text-[13px]" style={{ ...hubSans, color: hub.textMuted }}>
          Воронка читается из аналитики WB. Выгрузите данные кабинета; нужна категория «Аналитика» в токене.
        </p>
      </Card>
    );
  }
  const { current: c, past: p } = kpis;
  const stages: Stage[] = [
    { id: "open", label: "Просмотры карточек", cur: c.opens, past: p?.opens ?? null },
    { id: "cart", label: "Добавили в корзину", cur: c.carts, past: p?.carts ?? null, rateLabel: "из просмотров", rate: c.cartRate, pastRate: p?.cartRate },
    { id: "order", label: "Заказали", cur: c.orders, past: p?.orders ?? null, rateLabel: "из корзины", rate: c.orderRate, pastRate: p?.orderRate },
    { id: "buy", label: "Выкупили", cur: c.buyouts, past: p?.buyouts ?? null, rateLabel: "по завершённым заказам", rate: c.buyoutRate, pastRate: p?.buyoutRate },
  ];
  // Шкала общая для текущего и прошлого периода: иначе при падении просмотров метка прошлого значения прижималась бы к краю.
  const max = Math.max(c.opens, p?.opens ?? 0, 1);
  const leaks = rows.filter((r) => r.leak != null).sort((a, b) => b.opens - a.opens);

  return (
    <div className="space-y-4">
      <Card title="Воронка магазина" hint={`Сколько покупателей доходит до каждого шага. Синий — последние ${days} дн., серая черта — предыдущие ${days}.`}>
        <div className="space-y-3.5">
          {stages.map((s) => (
            <div key={s.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[13px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                  {s.label}
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-semibold tabular-nums" style={{ ...hubSans, color: hub.text }}>
                    {formatInt(s.cur)}
                  </span>
                  <DeltaChip change={pctChange(s.cur, s.past)} />
                </span>
              </div>
              <div className="relative mt-1.5 h-3 rounded-full" style={{ backgroundColor: hub.canvas }}>
                <div className="h-3 rounded-full" style={{ width: `${Math.max(1, (s.cur / max) * 100)}%`, backgroundColor: hub.blue }} />
                {s.past != null ? <div className="absolute top-[-3px] h-[18px] w-0.5 rounded" style={{ left: `${Math.min(100, (s.past / max) * 100)}%`, backgroundColor: hub.textSubtle }} title={`Было: ${formatInt(s.past)}`} /> : null}
              </div>
              {s.rateLabel ? (
                <p className="mt-1 text-[12px]" style={{ ...hubSans, color: hub.textMuted }}>
                  {fmtPct(s.rate ?? null)} {s.rateLabel}
                  {s.pastRate != null ? `, было ${fmtPct(s.pastRate)}` : ""}
                </p>
              ) : null}
            </div>
          ))}
        </div>
        <SourceNote>
          Источник: воронка продаж WB по вашим карточкам. Выкупы приходят с задержкой: заказы последних дней ещё не получили исход, поэтому выкуп за свежий период занижен.
        </SourceNote>
      </Card>

      <Card
        title="Где товары теряют покупателей"
        hint="Отмечены товары, у которых больше 100 просмотров, а доля добавлений в корзину или заказов из корзины меньше 60% от среднего по магазину."
      >
        {leaks.length === 0 ? (
          <p className="text-[13px]" style={{ ...hubSans, color: hub.green }}>
            Явных утечек нет: у товаров с достаточным числом просмотров конверсии не хуже 60% от магазинных.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left">
              <thead style={{ backgroundColor: hub.surfaceMuted }}>
                <tr>
                  {["Товар", "Просмотры", "В корзину", "Из корзины в заказ", "Сумма заказов", "Утечка"].map((label) => (
                    <th key={label} className="border-b px-3 py-2.5 text-[11.5px] font-bold uppercase tracking-[0.06em]" style={{ ...hubSans, color: hub.textSubtle, borderColor: hub.borderSoft }}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leaks.slice(0, 15).map((r) => (
                  <tr key={r.nmId} className="border-b" style={{ borderColor: hub.borderSoft }}>
                    <td className="max-w-[280px] truncate px-3 py-2.5 text-[13px] font-medium" style={{ ...hubSans, color: hub.text }}>
                      {r.title}
                    </td>
                    <td className="px-3 py-2.5 text-[13px] tabular-nums">{formatInt(r.opens)}</td>
                    <td className="px-3 py-2.5 text-[13px] tabular-nums" style={{ color: r.leak === "cart" ? hub.danger : hub.text }}>
                      {fmtPct(r.cartRate)} <span style={{ color: hub.textSubtle }}>(магазин {fmtPct(c.cartRate)})</span>
                    </td>
                    <td className="px-3 py-2.5 text-[13px] tabular-nums" style={{ color: r.leak === "order" ? hub.danger : hub.text }}>
                      {fmtPct(r.orderRate)} <span style={{ color: hub.textSubtle }}>(магазин {fmtPct(c.orderRate)})</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[13px] tabular-nums">{formatRub(r.orderSum)}</td>
                    <td className="px-3 py-2.5 text-[12.5px]" style={{ ...hubSans, color: hub.danger }}>
                      {r.leak === "cart" ? "редко кладут в корзину" : "не доходят до заказа"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <SourceNote>Причину WB не называет. Для утечки на корзине обычно смотрят фото, цену и рейтинг; на заказе — доставку, срок и отзывы.</SourceNote>
      </Card>
    </div>
  );
}
