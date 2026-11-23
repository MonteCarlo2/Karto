"use client";

import { useMemo, useState } from "react";
import { buildStockAnalytics, LOW_STOCK_DAYS, OVERSTOCK_DAYS, type StockStatus } from "@/lib/seller-hub/stock-analytics";
import { useUserSetting } from "./use-user-setting";
import type { SellerCatalogSnapshot, SellerStocksReportSnapshot } from "@/lib/seller-hub/types";
import { downloadCsv } from "./download-file";
import { TreemapChart } from "./hub-analytics-viz";
import { formatInt, formatRub, hub, HubButton, HubSearch, hubNumeric, hubSans } from "./hub-ui";
import { Card, chartColors, DataTable, EmptyNote, FilterChip, IncompleteNotice, NumberField, ProductCell, ShownCount, SourceNote, StatBlock, Td, Th } from "./hub-analytics-ui";

const STATUS: Record<StockStatus, { label: string; color: string; bg: string }> = {
  out: { label: "Закончился", color: hub.danger, bg: hub.dangerSoft },
  low: { label: "Скоро закончится", color: hub.warn, bg: hub.warnSoft },
  over: { label: "Залёживается", color: hub.blue, bg: hub.blueSoft },
  ok: { label: "В норме", color: hub.greenDark, bg: hub.greenSoft },
};

type Filter = "all" | StockStatus;

/** Оценка запаса, которую WB даёт сам: показываем как есть, это не наш расчёт. */
const WB_CLASS: Record<string, { label: string; color: string }> = {
  deficient: { label: "Дефицит", color: hub.danger },
  actual: { label: "Актуальный", color: hub.greenDark },
  balanced: { label: "Сбалансированный", color: hub.greenDark },
  nonActual: { label: "Неактуальный", color: hub.warn },
  nonLiquid: { label: "Неликвид", color: hub.danger },
  invalidData: { label: "Нет данных", color: hub.textSubtle },
};

const ROW_LIMIT = 150;

/** На сколько дней хватит запаса: полосы от самых коротких. Чёрточки — ваши пороги «скоро закончится» и «залёживается». */
function CoverChart({ rows, lowDays, overDays }: { rows: Array<{ nmId: string; title: string; stock: number; saleRateDays: number | null; noSales: boolean }>; lowDays: number; overDays: number }) {
  const list = rows.filter((r) => !r.noSales && r.saleRateDays != null && r.stock > 0).sort((a, b) => (a.saleRateDays ?? 0) - (b.saleRateDays ?? 0)).slice(0, 7);
  if (list.length === 0) return <EmptyNote title="Считать запас не по чему">У товаров с остатком нет оценки скорости продаж от WB.</EmptyNote>;
  const top = Math.max(overDays * 1.15, ...list.map((r) => r.saleRateDays ?? 0), 1);
  const at = (d: number) => `${Math.min(100, (d / top) * 100)}%`;
  return (
    <div>
      <ul className="group/cv space-y-0.5">
        {list.map((r) => {
          const d = r.saleRateDays ?? 0;
          const color = d < lowDays ? chartColors.danger : d > overDays ? chartColors.blue : chartColors.green;
          return (
            <li key={r.nmId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-1.5 rounded-lg py-2.5 transition-opacity duration-150 group-hover/cv:opacity-45 hover:!opacity-100 sm:grid-cols-[minmax(160px,300px)_minmax(0,1fr)_96px]" title={`${r.title}: остаток ${formatInt(r.stock)} шт., хватит на ${Math.round(d)} дн.`}>
              <span className="min-w-0 text-[15px] leading-[1.3] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
                {r.title}
              </span>
              <span className="text-right sm:order-3" style={{ ...hubSans, ...hubNumeric }}>
                <span className="block text-[17px] font-medium leading-tight" style={{ color: hub.text, fontFamily: "var(--font-geist-mono), ui-monospace, monospace", letterSpacing: "-0.04em" }}>
                  {Math.round(d)} дн.
                </span>
                <span className="block text-[12px]" style={{ color: hub.textSubtle }}>
                  {formatInt(r.stock)} шт.
                </span>
              </span>
              <div className="relative col-span-2 h-[10px] rounded-full sm:order-2 sm:col-span-1" style={{ backgroundColor: "rgba(1, 20, 8, 0.05)" }}>
                <div className="h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: at(d), backgroundColor: color, minWidth: 4 }} />
                <div className="absolute -top-[4px] h-[18px] w-[2px] rounded-full" style={{ left: at(lowDays), backgroundColor: hub.warn, opacity: 0.55 }} />
                <div className="absolute -top-[4px] h-[18px] w-[2px] rounded-full" style={{ left: at(overDays), backgroundColor: hub.blue, opacity: 0.55 }} />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 flex flex-wrap gap-x-6 gap-y-1.5 text-[14px]" style={{ ...hubSans, color: hub.textMuted }}>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: chartColors.danger }} />
          меньше {lowDays} дн. — скоро закончится
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: chartColors.green }} />
          в норме
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: chartColors.blue }} />
          больше {overDays} дн. — залёживается
        </span>
      </p>
    </div>
  );
}

/** Остатки и оборачиваемость: что закончилось, что скоро закончится, что залёживается, сколько упущено. По отчёту WB об остатках. */
export function HubAnalyticsStock({ snapshot, stocksReport, days }: { snapshot?: SellerCatalogSnapshot; stocksReport?: SellerStocksReportSnapshot; days: number }) {
  const [lowDays, setLowDays] = useUserSetting<number>("analytics.lowStockDays", LOW_STOCK_DAYS);
  const [overDays, setOverDays] = useUserSetting<number>("analytics.overStockDays", OVERSTOCK_DAYS);
  const stock = useMemo(() => buildStockAnalytics(stocksReport, snapshot?.items ?? [], { lowDays, overDays }), [stocksReport, snapshot?.items, lowDays, overDays]);
  const photos = useMemo(() => new Map((snapshot?.items ?? []).map((i) => [i.externalId, i.imageUrl ?? undefined])), [snapshot?.items]);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (stock?.rows ?? []).filter((r) => (filter === "all" || r.status === filter) && (!q || `${r.title} ${r.nmId}`.toLowerCase().includes(q)));
  }, [stock, filter, search]);

  if (!stock) {
    return (
      <Card title="Отчёта об остатках пока нет">
        <EmptyNote title="Остатки и упущенные заказы читаются из аналитики WB">Выгрузите данные кабинета; нужна категория «Аналитика» в API-токене.</EmptyNote>
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
    <div className="space-y-3">
      {stock.truncated ? <IncompleteNotice what="Отчёт об остатках" /> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatBlock label="Закончились" color={chartColors.danger} value={formatInt(s.out)} sub="товаров без остатка, но с заказами" />
        <StatBlock label="Скоро закончатся" color={chartColors.amber} value={formatInt(s.low)} sub={`запаса меньше ${lowDays} дн.`} />
        <StatBlock label="Упущено без товара" color={chartColors.magenta} value={formatRub(s.lostSum)} sub={`${formatInt(s.lostOrders)} заказов, считает WB`} hint="Заказы, которых не случилось из-за отсутствия товара на складах" />
        <StatBlock
          label="Деньги в залежавшемся" color={chartColors.blue}
          value={formatRub(s.frozenValue)}
          sub={s.frozenWithoutCost > 0 ? `у ${s.frozenWithoutCost} товаров нет себестоимости, сумма неполная` : `${formatInt(s.over)} товаров, запас больше ${overDays} дн.`}
          hint="Остаток залёживающихся товаров по вашей себестоимости"
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-12">
        <Card fill className="xl:col-span-5" title="Состояние запасов" hint="Сколько товаров в каком состоянии">
          <TreemapChart
            legend={false}
            height="fill"
            items={[
              { id: "out", title: "Закончились", value: s.out, color: chartColors.danger },
              { id: "low", title: "Скоро закончатся", value: s.low, color: chartColors.amber },
              { id: "ok", title: "В норме", value: s.ok, color: chartColors.green },
              { id: "over", title: "Залёживаются", value: s.over, color: chartColors.blue },
            ]}
          />
          <ul className="mt-5 grid grid-cols-2 gap-3">
            {[
              { label: "Закончились", n: s.out, color: chartColors.danger },
              { label: "Скоро закончатся", n: s.low, color: chartColors.amber },
              { label: "В норме", n: s.ok, color: chartColors.green },
              { label: "Залёживаются", n: s.over, color: chartColors.blue },
            ].map((x) => (
              <li key={x.label} className="flex items-center justify-between gap-3 rounded-[16px] px-4 py-4" style={{ backgroundColor: `${x.color}14` }}>
                <span className="flex items-center gap-2 text-[16.5px]" style={{ ...hubSans, color: hub.text }}>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: x.color }} aria-hidden />
                  {x.label}
                </span>
                <span className="text-[28px] font-medium" style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.05em", color: hub.text }}>
                  {formatInt(x.n)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="xl:col-span-7" title="На сколько дней хватит" hint="7 товаров с самым коротким запасом. Оценка WB по скорости продаж">
          <CoverChart rows={stock.rows} lowDays={lowDays} overDays={overDays} />
        </Card>
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
        <div className="mb-5 flex flex-wrap items-end gap-x-8 gap-y-4 border-b pb-5" style={{ borderColor: hub.borderSoft }}>
          <NumberField label="«Скоро закончится», если запаса меньше, дней" value={lowDays} min={1} max={180} accept={(n) => n < overDays} onValid={setLowDays} />
          <NumberField label="«Залёживается», если запаса больше, дней" value={overDays} min={1} max={720} accept={(n) => n > lowDays} onValid={setOverDays} />
        </div>
        <div className="mb-5 flex flex-wrap items-center gap-2.5">
          {chips.map((c) => (
            <FilterChip key={c.id} active={filter === c.id} onClick={() => setFilter(c.id)} count={c.count}>
              {c.label}
            </FilterChip>
          ))}
          <HubSearch value={search} onChange={setSearch} placeholder="Найти товар" label="Поиск по товарам" className="w-full sm:ml-2 sm:w-[260px]" />
          <ShownCount shown={Math.min(rows.length, ROW_LIMIT)} total={stock.rows.length} />
        </div>
        {rows.length === 0 ? (
          <EmptyNote title="Здесь товаров нет">Выберите другой статус или измените запрос.</EmptyNote>
        ) : (
          <DataTable minWidth={900}>
            <thead>
              <tr>
                <Th>Товар</Th>
                <Th>Статус</Th>
                <Th>Оценка WB</Th>
                <Th align="right">Остаток</Th>
                <Th align="right">Хватит</Th>
                <Th align="right">Оборачиваемость</Th>
                <Th align="right">Упущено</Th>
                <Th align="right">Дней без товара</Th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, ROW_LIMIT).map((r) => {
                const st = STATUS[r.status];
                return (
                  <tr key={r.nmId} className="transition-colors duration-150 hover:bg-[#011408]/[0.025]">
                    <Td className="max-w-[280px]">
                      <ProductCell photo={photos.get(r.nmId)} title={r.title} sub={r.nmId} />
                    </Td>
                    <Td>
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-[3px] text-[13.5px] font-semibold" style={{ ...hubSans, color: st.color, backgroundColor: st.bg }}>
                        {st.label}
                      </span>
                    </Td>
                    <Td className="whitespace-nowrap text-[14.5px] font-medium" style={{ color: (r.availability && WB_CLASS[r.availability]?.color) || hub.textSubtle }}>
                      {r.availability ? (WB_CLASS[r.availability]?.label ?? r.availability) : "—"}
                    </Td>
                    <Td align="right" className="font-normal" tint={r.status === "out" ? "rgba(239, 68, 68, 0.16)" : r.status === "low" ? "rgba(249, 115, 22, 0.16)" : r.status === "over" ? "rgba(79, 91, 234, 0.14)" : "rgba(16, 185, 129, 0.14)"}>
                      {formatInt(r.stock)} шт.
                    </Td>
                    <Td align="right" className="whitespace-nowrap" tint={r.noSales || r.saleRateDays == null ? undefined : r.saleRateDays < lowDays ? "rgba(239, 68, 68, 0.16)" : r.saleRateDays > overDays ? "rgba(79, 91, 234, 0.14)" : "rgba(16, 185, 129, 0.14)"}>
                      {r.noSales ? "нет продаж" : r.saleRateDays == null ? "—" : `${Math.round(r.saleRateDays)} дн.`}
                    </Td>
                    <Td align="right" className="whitespace-nowrap">{r.turnoverDays == null ? "—" : `${Math.round(r.turnoverDays)} дн.`}</Td>
                    <Td align="right" className="whitespace-nowrap" style={{ color: r.lostSum > 0 ? hub.danger : hub.textSubtle }}>
                      {r.lostSum > 0 ? `${formatRub(r.lostSum)} · ${r.lostOrders} зак.` : "—"}
                    </Td>
                    <Td align="right">{r.missingDays == null ? "—" : Math.round(r.missingDays * 10) / 10}</Td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}
        <SourceNote>
          «Хватит», «Оценка WB» (дефицит, актуальный, сбалансированный, неактуальный, неликвид) и упущенные заказы считает WB по отчёту об остатках, мы их не пересчитываем. Пороги наши: «скоро закончится» — меньше {lowDays} дней запаса, «залёживается» — больше {overDays} дней или остаток при нулевых продажах. Пороги можно изменить выше.
        </SourceNote>
      </Card>
    </div>
  );
}
