"use client";

import { useMemo, useState } from "react";
import { buildStockAnalytics, LOW_STOCK_DAYS, OVERSTOCK_DAYS, type StockStatus } from "@/lib/seller-hub/stock-analytics";
import { useUserSetting } from "./use-user-setting";
import type { SellerCatalogSnapshot, SellerStocksReportSnapshot } from "@/lib/seller-hub/types";
import { downloadCsv } from "./download-file";
import { formatInt, formatRub, hub, HubButton, HubInput, hubSans } from "./hub-ui";
import { Card, IncompleteNotice, Kpi, NumberField, SourceNote } from "./hub-analytics-ui";

const STATUS: Record<StockStatus, { label: string; color: string; bg: string }> = {
  out: { label: "Закончился", color: hub.danger, bg: hub.dangerSoft },
  low: { label: "Скоро закончится", color: hub.warn, bg: hub.warnSoft },
  over: { label: "Залёживается", color: hub.blue, bg: hub.blueSoft },
  ok: { label: "В норме", color: hub.green, bg: hub.greenSoft },
};

type Filter = "all" | StockStatus;

/** Оценка запаса, которую WB даёт сам: показываем как есть, это не наш расчёт. */
const WB_CLASS: Record<string, { label: string; color: string }> = {
  deficient: { label: "Дефицит", color: hub.danger },
  actual: { label: "Актуальный", color: hub.green },
  balanced: { label: "Сбалансированный", color: hub.green },
  nonActual: { label: "Неактуальный", color: hub.warn },
  nonLiquid: { label: "Неликвид", color: hub.danger },
  invalidData: { label: "Нет данных", color: hub.textSubtle },
};

/** Остатки и оборачиваемость: что закончилось, что скоро закончится, что залёживается, сколько упущено. По отчёту WB об остатках. */
export function HubAnalyticsStock({ snapshot, stocksReport, days }: { snapshot?: SellerCatalogSnapshot; stocksReport?: SellerStocksReportSnapshot; days: number }) {
  const [lowDays, setLowDays] = useUserSetting<number>("analytics.lowStockDays", LOW_STOCK_DAYS);
  const [overDays, setOverDays] = useUserSetting<number>("analytics.overStockDays", OVERSTOCK_DAYS);
  const stock = useMemo(() => buildStockAnalytics(stocksReport, snapshot?.items ?? [], { lowDays, overDays }), [stocksReport, snapshot?.items, lowDays, overDays]);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (stock?.rows ?? []).filter((r) => (filter === "all" || r.status === filter) && (!q || `${r.title} ${r.nmId}`.toLowerCase().includes(q)));
  }, [stock, filter, search]);

  if (!stock) {
    return (
      <Card title="Отчёта об остатках пока нет">
        <p className="text-[13px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
          {stocksReport?.status === "jam_required"
            ? "Для сбора этих данных нужна подписка Джем."
            : "Остатки и упущенные заказы читаются из аналитики WB. Выгрузите данные кабинета; нужна категория «Аналитика» в API-токене."}
        </p>
      </Card>
    );
  }
  const s = stock.summary;
  const chips: Array<{ id: Filter; label: string; count: number }> = [
    { id: "all", label: "Все", count: stock.rows.length },
    { id: "out", label: "Закончились", count: s.out },
    { id: "low", label: "Скоро закончатся", count: s.low },
    { id: "over", label: "Залёживаются", count: s.over },
    { id: "ok", label: "В норме", count: s.ok },
  ];

  function exportCsv() {
    downloadCsv(
      `karto-analitika-ostatki-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Артикул WB", "Товар", "Статус", "Остаток", "Хватит дней (WB)", "Оборачиваемость, дней", "Заказов за период", "Упущено заказов", "Упущено, ₽", "Дней без товара", "Остаток по себестоимости, ₽"],
      rows.map((r) => [r.nmId, r.title, STATUS[r.status].label, r.stock, r.noSales ? "нет продаж" : (r.saleRateDays ?? ""), r.turnoverDays ?? "", r.orders, r.lostOrders, Math.round(r.lostSum), r.missingDays ?? "", r.stockValue == null ? "" : Math.round(r.stockValue)]),
    );
  }

  return (
    <div className="space-y-4">
      {stock.truncated ? <IncompleteNotice what="Отчёт об остатках" /> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Закончились" value={formatInt(s.out)} good="down" sub="товаров без остатка, но с заказами" />
        <Kpi label="Скоро закончатся" value={formatInt(s.low)} good="down" sub={`запаса меньше ${lowDays} дн.`} />
        <Kpi label="Упущено без товара" value={formatRub(s.lostSum)} good="down" sub={`${formatInt(s.lostOrders)} заказов, считает WB`} hint="Заказы, которых не случилось из-за отсутствия товара на складах" />
        <Kpi
          label="Деньги в залежавшемся"
          value={formatRub(s.frozenValue)}
          good="down"
          sub={s.frozenWithoutCost > 0 ? `у ${s.frozenWithoutCost} товаров нет себестоимости, сумма неполная` : `${formatInt(s.over)} товаров, запас больше ${overDays} дн.`}
          hint="Остаток залёживающихся товаров по вашей себестоимости"
        />
      </div>

      <Card
        title="Остатки по товарам"
        hint={`Сначала то, что требует внимания: закончившиеся, потом заканчивающиеся, потом залёживающиеся. Заказы и упущенное — за ${days} дн.`}
        action={
          <HubButton size="sm" variant="secondary" onClick={exportCsv}>
            Скачать CSV
          </HubButton>
        }
      >
        <div className="mb-3 flex flex-wrap items-end gap-4 rounded-xl px-3 py-2.5" style={{ backgroundColor: hub.canvas }}>
          <NumberField label="«Скоро закончится», если запаса меньше, дней" value={lowDays} min={1} max={180} accept={(n) => n < overDays} onValid={setLowDays} />
          <NumberField label="«Залёживается», если запаса больше, дней" value={overDays} min={1} max={720} accept={(n) => n > lowDays} onValid={setOverDays} />
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setFilter(c.id)}
              className="rounded-full border px-3 py-1 text-[12.5px] font-semibold"
              style={{ ...hubSans, borderColor: filter === c.id ? hub.text : hub.border, backgroundColor: filter === c.id ? hub.text : "transparent", color: filter === c.id ? hub.surface : hub.textMuted }}
            >
              {c.label} · {c.count}
            </button>
          ))}
          <HubInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Найти товар" className="w-48" />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left">
            <thead style={{ backgroundColor: hub.surfaceMuted }}>
              <tr>
                {["Товар", "Статус", "Оценка WB", "Остаток", "Хватит", "Оборачиваемость", "Упущено", "Дней без товара"].map((label) => (
                  <th key={label} className="whitespace-nowrap border-b px-3 py-2.5 text-[11.5px] font-bold uppercase tracking-[0.06em]" style={{ ...hubSans, color: hub.textSubtle, borderColor: hub.borderSoft }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 150).map((r) => {
                const st = STATUS[r.status];
                return (
                  <tr key={r.nmId} className="border-b" style={{ borderColor: hub.borderSoft }}>
                    <td className="max-w-[260px] px-3 py-2.5">
                      <p className="truncate text-[13px] font-medium" style={{ ...hubSans, color: hub.text }}>
                        {r.title}
                      </p>
                      <p className="text-[11.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
                        {r.nmId}
                      </p>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="rounded-full px-2 py-px text-[11.5px] font-semibold" style={{ ...hubSans, color: st.color, backgroundColor: st.bg }}>
                        {st.label}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[12.5px] font-semibold" style={{ ...hubSans, color: (r.availability && WB_CLASS[r.availability]?.color) || hub.textSubtle }}>
                      {r.availability ? (WB_CLASS[r.availability]?.label ?? r.availability) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-[13px] tabular-nums">{formatInt(r.stock)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[13px] tabular-nums">{r.noSales ? "нет продаж" : r.saleRateDays == null ? "—" : `${Math.round(r.saleRateDays)} дн.`}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[13px] tabular-nums">{r.turnoverDays == null ? "—" : `${Math.round(r.turnoverDays)} дн.`}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[13px] tabular-nums" style={{ color: r.lostSum > 0 ? hub.danger : hub.textSubtle }}>
                      {r.lostSum > 0 ? `${formatRub(r.lostSum)} · ${r.lostOrders} зак.` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-[13px] tabular-nums">{r.missingDays == null ? "—" : Math.round(r.missingDays * 10) / 10}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <SourceNote>
          «Хватит», «Оценка WB» (дефицит, актуальный, сбалансированный, неактуальный, неликвид) и упущенные заказы считает WB по отчёту об остатках, мы их не пересчитываем. Пороги наши: «скоро закончится» — меньше {lowDays} дней запаса, «залёживается» — больше {overDays} дней или остаток при нулевых продажах. Пороги можно изменить выше.
        </SourceNote>
      </Card>
    </div>
  );
}
