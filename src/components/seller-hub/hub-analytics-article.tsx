"use client";

import { pctChange, type ProductRow } from "@/lib/seller-hub/analytics-core";
import type { ProductLogisticsCost } from "@/lib/seller-hub/logistics-cost";
import type { ProductMoney } from "@/lib/seller-hub/money-analytics";
import type { StockRow } from "@/lib/seller-hub/stock-analytics";
import { formatInt, formatRub, hub, hubSans } from "./hub-ui";
import { DeltaChip, fmtPct, PpChip } from "./hub-analytics-ui";

function Line({ label, value, chip }: { label: string; value: string; chip?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-[12.5px]" style={hubSans}>
      <span style={{ color: hub.textMuted }}>{label}</span>
      <span className="flex items-center gap-2 tabular-nums" style={{ color: hub.text }}>
        {value}
        {chip}
      </span>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border px-3.5 py-3" style={{ borderColor: hub.border, backgroundColor: hub.surface }}>
      <p className="mb-1 text-[12px] font-semibold uppercase tracking-[0.06em]" style={{ ...hubSans, color: hub.textSubtle }}>
        {title}
      </p>
      {children}
    </div>
  );
}

const rate = (a: number, b: number) => (b > 0 ? a / b : null);
const ppDiff = (cur: number | null, past: number | null) => (cur == null || past == null ? null : (cur - past) * 100);

/** Экран артикула: воронка, деньги, склад и логистика по одному товару. Все данные уже загружены, новых запросов к WB нет. */
export function HubAnalyticsArticle({ row, money, cost, stock, days }: { row: ProductRow; money?: ProductMoney; cost?: ProductLogisticsCost; stock?: StockRow; days: number }) {
  const prevCartRate = row.prevOpens != null && row.prevCarts != null ? rate(row.prevCarts, row.prevOpens) : null;
  const prevOrderRate = row.prevCarts != null && row.prevOrders != null ? rate(row.prevOrders, row.prevCarts) : null;
  const prevBuyout = row.prevBuyouts != null && row.prevCancels != null ? rate(row.prevBuyouts, row.prevBuyouts + row.prevCancels) : null;
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Block title={`Воронка за ${days} дн.`}>
        <Line label="Просмотры" value={formatInt(row.opens)} chip={<DeltaChip change={pctChange(row.opens, row.prevOpens)} />} />
        <Line label="В корзину" value={`${formatInt(row.carts)} · ${fmtPct(row.cartRate)}`} chip={<PpChip pp={ppDiff(row.cartRate, prevCartRate)} />} />
        <Line label="Заказы" value={formatInt(row.orders)} chip={<DeltaChip change={pctChange(row.orders, row.prevOrders)} />} />
        <Line label="Корзина → заказ" value={fmtPct(row.orderRate)} chip={<PpChip pp={ppDiff(row.orderRate, prevOrderRate)} />} />
        <Line label="Выкуплено" value={`${formatInt(row.buyouts)} · выкуп ${fmtPct(row.buyoutRate, 0)}`} chip={<PpChip pp={ppDiff(row.buyoutRate, prevBuyout)} />} />
        <Line label="Отменено" value={formatInt(row.cancels)} />
        <Line label="Рейтинг" value={row.rating == null ? "нет отзывов" : row.rating.toLocaleString("ru-RU")} />
      </Block>

      <Block title={`Деньги за ${days} дн.`}>
        {money ? (
          <>
            <Line label="Продано" value={`${formatInt(money.units)} шт.`} />
            <Line label="Выручка" value={formatRub(money.revenue)} />
            <Line label="Логистика + хранение" value={`${formatRub(money.logistics + money.storage)} · ${fmtPct(money.serviceShare, 0)}`} />
            <Line label="Остаётся до себестоимости" value={formatRub(money.beforeCost)} />
            <Line label="Прибыль" value={money.profit == null ? "нет себестоимости" : `${formatRub(money.profit)} · ${fmtPct(money.margin)}`} />
            {row.marginRub != null ? <Line label="Маржа на 1 продажу (по доставкам за 90 дн.)" value={row.marginPercent != null ? `${formatRub(row.marginRub)} · ${row.marginPercent.toLocaleString("ru-RU")}%` : formatRub(row.marginRub)} /> : null}
          </>
        ) : (
          <p className="text-[12.5px]" style={{ ...hubSans, color: hub.textMuted }}>
            По этому товару нет продаж в отчёте реализации за период.
          </p>
        )}
      </Block>

      <Block title="Склад и логистика">
        {stock ? (
          <>
            <Line label="Остаток" value={`${formatInt(stock.stock)} шт.`} />
            <Line label="Хватит (оценка WB)" value={stock.noSales ? "нет продаж" : stock.saleRateDays == null ? "—" : `${Math.round(stock.saleRateDays)} дн.`} />
            <Line label="Упущено без товара" value={stock.lostSum > 0 ? `${formatRub(stock.lostSum)} · ${stock.lostOrders} зак.` : "нет"} />
          </>
        ) : (
          <p className="text-[12.5px]" style={{ ...hubSans, color: hub.textMuted }}>
            Отчёта об остатках по товару нет.
          </p>
        )}
        {cost ? (
          <>
            <Line label="Цена доставки" value={cost.perDelivery == null ? "мало доставок" : formatRub(cost.perDelivery)} chip={<DeltaChip change={cost.changePercent} good="down" />} />
            <Line label="Возвраты" value={cost.returns > 0 ? `${cost.returns} · ${fmtPct(cost.returnRate, 0)}` : "нет"} chip={cost.highReturn ? <span className="rounded-full px-1.5 py-px text-[10.5px] font-semibold" style={{ backgroundColor: hub.dangerSoft, color: hub.danger }}>высокий</span> : undefined} />
          </>
        ) : null}
      </Block>
    </div>
  );
}
