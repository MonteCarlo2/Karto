"use client";

import { Fragment, useMemo, useState } from "react";
import type { ProductRow } from "@/lib/seller-hub/analytics-core";
import { buildLogisticsCost } from "@/lib/seller-hub/logistics-cost";
import { buildMoneyAnalytics } from "@/lib/seller-hub/money-analytics";
import { buildStockAnalytics } from "@/lib/seller-hub/stock-analytics";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { HubAnalyticsArticle } from "./hub-analytics-article";
import { downloadCsv } from "./download-file";
import { formatInt, formatRub, hub, HubButton, HubInput, hubSans } from "./hub-ui";
import { Card, DeltaChip, fmtPct, IncompleteNotice, SourceNote } from "./hub-analytics-ui";
import type { AnalyticsData } from "./use-analytics-data";

type SortKey = "orderSum" | "orders" | "sumChange" | "share" | "buyoutRate" | "cartRate" | "orderRate" | "stock" | "lostSum" | "marginPercent" | "opens";
type AbcFilter = "all" | "A" | "B" | "C";

const COLUMNS: Array<{ key: SortKey | null; label: string; title?: string }> = [
  { key: null, label: "Товар" },
  { key: null, label: "ABC", title: "A — набирают первые 80% суммы заказов, B — до 95%, C — остальное" },
  { key: "orders", label: "Заказы" },
  { key: "orderSum", label: "Сумма" },
  { key: "sumChange", label: "К прошлому периоду" },
  { key: "share", label: "Доля" },
  { key: "buyoutRate", label: "Выкуп" },
  { key: "cartRate", label: "В корзину", title: "Из просмотров в корзину" },
  { key: "orderRate", label: "Корзина → заказ" },
  { key: "stock", label: "Остаток" },
  { key: "lostSum", label: "Упущено", title: "Заказы, которых не случилось из-за отсутствия товара (считает WB)" },
  { key: "marginPercent", label: "Маржа", title: "Маржа на 1 продажу, расчёт как в «Товарах»; нужна себестоимость" },
];

const sortValue = (r: ProductRow, key: SortKey): number | null => {
  const v = r[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};

/** Пустые значения всегда в конце списка, при любом направлении сортировки. */
function compareRows(a: ProductRow, b: ProductRow, key: SortKey, dir: 1 | -1): number {
  const x = sortValue(a, key);
  const y = sortValue(b, key);
  if (x == null && y == null) return b.orderSum - a.orderSum;
  if (x == null) return 1;
  if (y == null) return -1;
  return (x - y) * dir || b.orderSum - a.orderSum;
}

/** Матрица товаров: все показатели по каждому артикулу, фильтры, сортировка, ABC, CSV. */
export function HubAnalyticsProducts({ data, snapshot, days }: { data: AnalyticsData; snapshot?: SellerCatalogSnapshot; days: number }) {
  const { rows, kpis } = data;
  const [search, setSearch] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [abc, setAbc] = useState<AbcFilter>("all");
  const [onlyLeak, setOnlyLeak] = useState(false);
  const [onlyLost, setOnlyLost] = useState(false);
  const [onlyFalling, setOnlyFalling] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "orderSum", dir: -1 });
  const [openNm, setOpenNm] = useState<string | null>(null);

  /** Данные экрана артикула считаются по уже загруженному снимку, новых запросов к WB нет. */
  const realization = snapshot?.realization;
  const items = snapshot?.items;
  const stocksReport = snapshot?.stocksReport;
  const moneyByNm = useMemo(() => new Map((buildMoneyAnalytics(realization, items ?? [], days)?.products ?? []).map((p) => [p.nmId, p])), [realization, items, days]);
  const costByNm = useMemo(() => {
    const titles = new Map((items ?? []).map((i) => [i.externalId, i.title || i.vendorCode || i.externalId]));
    return new Map((buildLogisticsCost(realization, (id) => titles.get(id) ?? id)?.products ?? []).map((p) => [p.nmId, p]));
  }, [realization, items]);
  const stockByNm = useMemo(() => new Map((buildStockAnalytics(stocksReport, items ?? [])?.rows ?? []).map((r) => [r.nmId, r])), [stocksReport, items]);

  const brands = useMemo(() => [...new Set(rows.map((r) => r.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru")), [rows]);
  const categories = useMemo(() => [...new Set(rows.map((r) => r.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru")), [rows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (q && !`${r.title} ${r.vendorCode} ${r.nmId}`.toLowerCase().includes(q)) return false;
      if (brand && r.brand !== brand) return false;
      if (category && r.category !== category) return false;
      if (abc !== "all" && r.abc !== abc) return false;
      if (onlyLeak && r.leak == null) return false;
      if (onlyLost && !(r.lostSum > 0)) return false;
      if (onlyFalling && !((r.sumDelta ?? 0) < 0)) return false;
      return true;
    });
    return list.sort((a, b) => compareRows(a, b, sort.key, sort.dir));
  }, [rows, search, brand, category, abc, onlyLeak, onlyLost, onlyFalling, sort]);

  if (rows.length === 0) {
    return (
      <Card title="Товаров с данными воронки пока нет">
        <p className="text-[13px]" style={{ ...hubSans, color: hub.textMuted }}>
          Матрица строится по воронке продаж WB. Выгрузите данные кабинета; нужна категория «Аналитика» в токене.
        </p>
      </Card>
    );
  }

  function exportCsv() {
    downloadCsv(
      `karto-analitika-tovary-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Артикул WB", "Артикул продавца", "Товар", "Бренд", "Категория", "ABC", "Просмотры", "В корзину", "Заказы", "Сумма заказов, ₽", "Сумма в прошлом периоде, ₽", "Изменение, %", "Доля, %", "Выкуп, %", "Просмотр → корзина, %", "Корзина → заказ, %", "Остаток", "Хватит дней (WB)", "Упущено заказов", "Упущено, ₽", "Маржа на 1 продажу, ₽", "Маржа, %"],
      visible.map((r) => [
        r.nmId, r.vendorCode, r.title, r.brand, r.category, r.abc === "none" ? "" : r.abc, r.opens, r.carts, r.orders, Math.round(r.orderSum), r.prevOrderSum == null ? "" : Math.round(r.prevOrderSum),
        r.sumChange == null ? "" : Math.round(r.sumChange * 10) / 10, Math.round(r.share * 1000) / 10, r.buyoutRate == null ? "" : Math.round(r.buyoutRate * 1000) / 10,
        r.cartRate == null ? "" : Math.round(r.cartRate * 1000) / 10, r.orderRate == null ? "" : Math.round(r.orderRate * 1000) / 10, r.stock ?? "", r.saleRateDays ?? "", r.lostOrders, Math.round(r.lostSum), r.marginRub ?? "", r.marginPercent ?? "",
      ]),
    );
  }

  const selectCls = "rounded-[9px] border px-2 py-1.5 text-[12.5px]";
  const selectStyle = { ...hubSans, borderColor: hub.border, backgroundColor: hub.surface, color: hub.text };
  const check = (label: string, checked: boolean, onChange: (v: boolean) => void) => (
    <label key={label} className="flex items-center gap-1.5 text-[12.5px]" style={{ ...hubSans, color: hub.text }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );

  return (
    <Card
      title="Все товары"
      hint={`Показатели за ${days} дн. по каждому артикулу. Нажмите на заголовок колонки, чтобы отсортировать, на строку — чтобы открыть экран артикула.`}
      action={
        <HubButton size="sm" variant="secondary" onClick={exportCsv}>
          Скачать CSV
        </HubButton>
      }
    >
      {kpis?.truncated ? (
        <div className="mb-3">
          <IncompleteNotice what="Воронку и отчёт об остатках" />
        </div>
      ) : null}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <HubInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Название, артикул, nmID" className="w-56" />
        {brands.length > 1 ? (
          <select value={brand} onChange={(e) => setBrand(e.target.value)} aria-label="Бренд" className={selectCls} style={selectStyle}>
            <option value="">Все бренды</option>
            {brands.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        ) : null}
        {categories.length > 1 ? (
          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Категория" className={selectCls} style={selectStyle}>
            <option value="">Все категории</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        ) : null}
        <select value={abc} onChange={(e) => setAbc(e.target.value as AbcFilter)} aria-label="Класс ABC" className={selectCls} style={selectStyle}>
          <option value="all">Все классы</option>
          <option value="A">Класс A</option>
          <option value="B">Класс B</option>
          <option value="C">Класс C</option>
        </select>
        {check("С утечкой воронки", onlyLeak, setOnlyLeak)}
        {check("С упущенными заказами", onlyLost, setOnlyLost)}
        {check("Падающие", onlyFalling, setOnlyFalling)}
        <span className="text-[12px]" style={{ ...hubSans, color: hub.textSubtle }}>
          {visible.length} из {rows.length}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left">
          <thead style={{ backgroundColor: hub.surfaceMuted }}>
            <tr>
              {COLUMNS.map((col) => {
                const active = col.key != null && sort.key === col.key;
                return (
                  <th
                    key={col.label}
                    title={col.title}
                    onClick={col.key ? () => setSort((s) => ({ key: col.key!, dir: s.key === col.key ? (s.dir === 1 ? -1 : 1) : -1 })) : undefined}
                    className={`whitespace-nowrap border-b px-3 py-2.5 text-[11.5px] font-bold uppercase tracking-[0.06em] ${col.key ? "cursor-pointer select-none" : ""}`}
                    style={{ ...hubSans, color: active ? hub.text : hub.textSubtle, borderColor: hub.borderSoft }}
                  >
                    {col.label}
                    {active ? (sort.dir === -1 ? " ↓" : " ↑") : ""}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.slice(0, 200).map((r) => (
              <Fragment key={r.nmId}>
              <tr
                className="cursor-pointer border-b transition-colors hover:bg-[#1C1915]/[0.03]"
                style={{ borderColor: hub.borderSoft, backgroundColor: openNm === r.nmId ? hub.canvas : undefined }}
                onClick={() => setOpenNm((cur) => (cur === r.nmId ? null : r.nmId))}
                aria-expanded={openNm === r.nmId}
                title="Нажмите, чтобы открыть экран артикула"
              >
                <td className="max-w-[260px] px-3 py-2.5">
                  <p className="truncate text-[13px] font-medium" style={{ ...hubSans, color: hub.text }}>
                    {r.title}
                  </p>
                  <p className="text-[11.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
                    {r.vendorCode ? `${r.vendorCode} · ` : ""}
                    {r.nmId}
                    {r.leak ? <span style={{ color: hub.danger }}> · утечка воронки</span> : null}
                  </p>
                </td>
                <td className="px-3 py-2.5 text-[13px] font-semibold" style={{ color: r.abc === "A" ? hub.green : r.abc === "B" ? hub.blue : hub.textMuted }}>
                  {r.abc === "none" ? "—" : r.abc}
                </td>
                <td className="px-3 py-2.5 text-[13px] tabular-nums">{formatInt(r.orders)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-[13px] font-semibold tabular-nums">{formatRub(r.orderSum)}</td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  <DeltaChip change={r.sumChange} />
                </td>
                <td className="px-3 py-2.5 text-[13px] tabular-nums">{fmtPct(r.share)}</td>
                <td className="px-3 py-2.5 text-[13px] tabular-nums">{fmtPct(r.buyoutRate, 0)}</td>
                <td className="px-3 py-2.5 text-[13px] tabular-nums">{fmtPct(r.cartRate)}</td>
                <td className="px-3 py-2.5 text-[13px] tabular-nums">{fmtPct(r.orderRate, 0)}</td>
                <td className="px-3 py-2.5 text-[13px] tabular-nums">
                  {r.stock == null ? "—" : formatInt(r.stock)}
                  {r.saleRateDays != null && r.saleRateDays < 30 ? <span style={{ color: hub.warn }}> · на {Math.round(r.saleRateDays)} дн.</span> : null}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-[13px] tabular-nums" style={{ color: r.lostSum > 0 ? hub.danger : hub.textSubtle }}>
                  {r.lostSum > 0 ? formatRub(r.lostSum) : "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-[13px] tabular-nums" style={{ color: r.marginPercent == null ? hub.textSubtle : r.marginPercent < 0 ? hub.danger : hub.text }}>
                  {r.marginPercent == null ? "—" : `${r.marginPercent.toLocaleString("ru-RU")}%`}
                  {r.marginRub != null ? <span style={{ color: hub.textSubtle }}> · {formatRub(r.marginRub)}</span> : null}
                </td>
              </tr>
              {openNm === r.nmId ? (
                <tr className="border-b" style={{ borderColor: hub.borderSoft, backgroundColor: hub.canvas }}>
                  <td colSpan={COLUMNS.length} className="px-3 py-3">
                    <HubAnalyticsArticle days={days} row={r} money={moneyByNm.get(r.nmId)} cost={costByNm.get(r.nmId)} stock={stockByNm.get(r.nmId)} />
                  </td>
                </tr>
              ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <SourceNote>
        Воронка, заказы, выкуп и упущенное — данные WB за выбранный период. «Хватит» — оценка WB по скорости продаж, показана, когда меньше 30 дней. Маржа — на одну продажу, считается как в «Товарах» по доставкам за 90 дней и не зависит от периода (нужны себестоимость и отчёт реализации); без себестоимости прочерк.
      </SourceNote>
    </Card>
  );
}
