"use client";

import { Fragment, useMemo, useState } from "react";
import type { ProductRow } from "@/lib/seller-hub/analytics-core";
import { buildLogisticsCost } from "@/lib/seller-hub/logistics-cost";
import { buildMoneyAnalytics } from "@/lib/seller-hub/money-analytics";
import { buildStockAnalytics } from "@/lib/seller-hub/stock-analytics";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { HubAnalyticsArticle } from "./hub-analytics-article";
import { downloadCsv } from "./download-file";
import { formatInt, formatRub, hub, HubButton, HubSearch, HubSelect, hubNumeric, hubSans } from "./hub-ui";
import { Card, chartColors, DataTable, DeltaChip, EmptyNote, FilterChip, fmtPct, IncompleteNotice, ProductCell, ShownCount, SourceNote, Td, Th } from "./hub-analytics-ui";
import type { AnalyticsData } from "./use-analytics-data";

type SortKey = "orderSum" | "orders" | "sumChange" | "share" | "buyoutRate" | "cartRate" | "orderRate" | "stock" | "lostSum" | "marginPercent" | "opens";
type AbcFilter = "all" | "A" | "B" | "C";

const COLUMNS: Array<{ key: SortKey | null; label: string; title?: string; right?: boolean }> = [
  { key: null, label: "Товар" },
  { key: null, label: "ABC", title: "A — набирают первые 80% суммы заказов, B — до 95%, C — остальное" },
  { key: "orders", label: "Заказы", right: true },
  { key: "orderSum", label: "Сумма", right: true },
  { key: "sumChange", label: "К прошлому периоду", right: true },
  { key: "share", label: "Доля", right: true },
  { key: "buyoutRate", label: "Выкуп", right: true },
  { key: "cartRate", label: "В корзину", title: "Из просмотров в корзину", right: true },
  { key: "orderRate", label: "Корзина → заказ", right: true },
  { key: "stock", label: "Остаток", right: true },
  { key: "lostSum", label: "Упущено", title: "Заказы, которых не случилось из-за отсутствия товара (считает WB)", right: true },
  { key: "marginPercent", label: "Маржа", title: "Маржа на 1 продажу, расчёт как в «Товарах»; нужна себестоимость", right: true },
];

const ABC_OPTIONS: Array<{ id: AbcFilter; label: string }> = [
  { id: "all", label: "Все классы" },
  { id: "A", label: "Класс A" },
  { id: "B", label: "Класс B" },
  { id: "C", label: "Класс C" },
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

const ROW_LIMIT = 200;

/** Класс ABC маленькой меткой: A тёмная, B средняя, C светлая. */
function AbcMark({ abc }: { abc: ProductRow["abc"] }) {
  if (abc === "none") return <span style={{ color: hub.textSubtle }}>—</span>;
  const look = abc === "A" ? { bg: chartColors.blue, fg: "#fff" } : abc === "B" ? { bg: chartColors.amber, fg: "#fff" } : { bg: chartColors.mute, fg: hub.text };
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-semibold" style={{ ...hubSans, backgroundColor: look.bg, color: look.fg }}>
      {abc}
    </span>
  );
}

/** Матрица товаров: все показатели по каждому артикулу, фильтры, сортировка, ABC, CSV. */
export function HubAnalyticsProducts({ data, snapshot, days, initialSearch }: { data: AnalyticsData; snapshot?: SellerCatalogSnapshot; days: number; /** Из чата: сразу показать нужный товар. */ initialSearch?: string }) {
  const { rows, kpis } = data;
  const [search, setSearch] = useState(initialSearch ?? "");
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
  const photos = useMemo(() => new Map((items ?? []).map((i) => [i.externalId, i.imageUrl ?? undefined])), [items]);
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

  const marginGroups = useMemo(() => {
    const sold = rows.filter((r) => r.orderSum > 0);
    const defs = [
      { label: "Маржа от 25%", color: "#10B981", test: (m: number | null) => m != null && m >= 25 },
      { label: "Маржа 15–25%", color: "#F59E0B", test: (m: number | null) => m != null && m >= 15 && m < 25 },
      { label: "Маржа до 15%", color: "#F97316", test: (m: number | null) => m != null && m >= 0 && m < 15 },
      { label: "Убыток", color: "#EF4444", test: (m: number | null) => m != null && m < 0 },
      { label: "Себестоимость не указана", color: "#8A9A8C", test: (m: number | null) => m == null },
    ];
    const list = defs.map((d) => {
      const inGroup = sold.filter((r) => d.test(r.marginPercent));
      return { label: d.label, color: d.color, count: inGroup.length, sum: inGroup.reduce((a, r) => a + r.orderSum, 0) };
    });
    return { list, total: sold.length, sum: sold.reduce((a, r) => a + r.orderSum, 0) };
  }, [rows]);

  if (rows.length === 0) {
    return (
      <Card title="Товаров с данными воронки пока нет">
        <EmptyNote title="Матрица строится по воронке продаж WB">Выгрузите данные кабинета; нужна категория «Аналитика» в токене.</EmptyNote>
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

  const brandOptions = [{ id: "", label: "Все бренды" }, ...brands.map((b) => ({ id: b, label: b }))];
  const categoryOptions = [{ id: "", label: "Все категории" }, ...categories.map((c) => ({ id: c, label: c }))];

  return (
    <div className="space-y-3">
      {marginGroups.total > 0 ? (
        <Card title="Маржа по товарам" hint={`Сколько товаров и какую часть суммы заказов за ${days} дн. они дают, по марже на одну продажу`}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {marginGroups.list.map((g) => (
              <div key={g.label} className="rounded-[20px] px-5 py-4" style={{ background: `linear-gradient(165deg, ${g.color}26 0%, ${g.color}0D 100%)`, border: `1px solid ${g.color}66` }}>
                <p className="flex items-center gap-2 text-[16px] font-medium leading-tight" style={{ ...hubSans, color: hub.text }}>
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: g.color }} aria-hidden />
                  {g.label}
                </p>
                <p className="mt-3 text-[44px] font-medium leading-none" style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.06em", color: hub.text }}>
                  {formatInt(g.count)}
                  <span className="ml-1.5 text-[16px]" style={{ ...hubSans, letterSpacing: 0, color: hub.textMuted }}>тов.</span>
                </p>
                <p className="mt-3 text-[18px] font-medium" style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.04em", color: hub.text }}>
                  {formatRub(g.sum)}
                </p>
                <p className="mt-0.5 text-[15px]" style={{ ...hubSans, color: hub.textMuted }}>
                  {marginGroups.sum > 0 ? fmtPct(g.sum / marginGroups.sum, 0) : "—"} суммы заказов
                </p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
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
        <div className="mb-5">
          <IncompleteNotice what="Воронку и отчёт об остатках" />
        </div>
      ) : null}

      <div className="mb-5 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <HubSearch value={search} onChange={setSearch} placeholder="Название, артикул, nmID" label="Поиск по товарам" className="w-full sm:w-[320px]" />
          {brands.length > 1 ? <HubSelect<string> value={brand} options={brandOptions} onChange={setBrand} label="Бренд" /> : null}
          {categories.length > 1 ? <HubSelect<string> value={category} options={categoryOptions} onChange={setCategory} label="Категория" /> : null}
          <HubSelect<AbcFilter> value={abc} options={ABC_OPTIONS} onChange={setAbc} label="Класс ABC" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip active={onlyLeak} onClick={() => setOnlyLeak((v) => !v)}>
            С утечкой воронки
          </FilterChip>
          <FilterChip active={onlyLost} onClick={() => setOnlyLost((v) => !v)}>
            С упущенными заказами
          </FilterChip>
          <FilterChip active={onlyFalling} onClick={() => setOnlyFalling((v) => !v)}>
            Падающие
          </FilterChip>
          <span className="ml-1">
            <ShownCount shown={visible.length} total={rows.length} />
          </span>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyNote title="По таким условиям товаров нет">Сбросьте часть фильтров или измените запрос.</EmptyNote>
      ) : (
        <DataTable minWidth={1180}>
          <thead>
            <tr>
              {COLUMNS.map((col) => {
                const active = col.key != null && sort.key === col.key;
                return (
                  <Th
                    key={col.label}
                    title={col.title}
                    align={col.right ? "right" : "left"}
                    active={active}
                    dir={sort.dir}
                    onSort={col.key ? () => setSort((s) => ({ key: col.key!, dir: s.key === col.key ? (s.dir === 1 ? -1 : 1) : -1 })) : undefined}
                  >
                    {col.label}
                  </Th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.slice(0, ROW_LIMIT).map((r) => {
              const open = openNm === r.nmId;
              return (
                <Fragment key={r.nmId}>
                  <tr
                    className="cursor-pointer transition-colors duration-150 hover:bg-[#011408]/[0.025]"
                    style={{ backgroundColor: open ? "rgba(1, 20, 8, 0.035)" : undefined }}
                    onClick={() => setOpenNm((cur) => (cur === r.nmId ? null : r.nmId))}
                    aria-expanded={open}
                    title="Нажмите, чтобы открыть экран артикула"
                  >
                    <Td className="max-w-[300px]">
                      <ProductCell
                        photo={photos.get(r.nmId)}
                        title={r.title}
                        sub={`${r.vendorCode ? `${r.vendorCode} · ` : ""}${r.nmId}`}
                        flag={r.leak ? <span style={{ color: hub.danger }}> · утечка воронки</span> : null}
                      />
                    </Td>
                    <Td>
                      <AbcMark abc={r.abc} />
                    </Td>
                    <Td align="right">{formatInt(r.orders)}</Td>
                    <Td align="right" className="whitespace-nowrap font-normal" tint="rgba(79, 91, 234, 0.14)">
                      {formatRub(r.orderSum)}
                    </Td>
                    <Td align="right" className="whitespace-nowrap">
                      <DeltaChip change={r.sumChange} />
                    </Td>
                    <Td align="right" tint="rgba(16, 185, 129, 0.14)" className="font-normal">{fmtPct(r.share)}</Td>
                    <Td align="right">{fmtPct(r.buyoutRate, 0)}</Td>
                    <Td align="right">{fmtPct(r.cartRate)}</Td>
                    <Td align="right">{fmtPct(r.orderRate, 0)}</Td>
                    <Td align="right" className="whitespace-nowrap">
                      {r.stock == null ? "—" : formatInt(r.stock)}
                      {r.saleRateDays != null && r.saleRateDays < 30 ? (
                        <span className="block text-[13px]" style={{ color: hub.warn }}>
                          на {Math.round(r.saleRateDays)} дн.
                        </span>
                      ) : null}
                    </Td>
                    <Td align="right" className="whitespace-nowrap" style={{ color: r.lostSum > 0 ? hub.danger : hub.textSubtle }}>
                      {r.lostSum > 0 ? formatRub(r.lostSum) : "—"}
                    </Td>
                    <Td align="right" className="whitespace-nowrap" style={{ color: r.marginPercent == null ? hub.textSubtle : r.marginPercent < 0 ? hub.danger : hub.text }}>
                      {r.marginPercent == null ? "—" : `${r.marginPercent.toLocaleString("ru-RU")}%`}
                      {r.marginRub != null ? (
                        <span className="block text-[13px]" style={{ ...hubNumeric, color: hub.textSubtle }}>
                          {formatRub(r.marginRub)}
                        </span>
                      ) : null}
                    </Td>
                  </tr>
                  {open ? (
                    <tr>
                      <td colSpan={COLUMNS.length} className="border-b px-3 pb-6 pt-2" style={{ borderColor: hub.borderSoft, backgroundColor: "rgba(1, 20, 8, 0.035)" }}>
                        <div className="hub-fade-in">
                          <HubAnalyticsArticle days={days} row={r} money={moneyByNm.get(r.nmId)} cost={costByNm.get(r.nmId)} stock={stockByNm.get(r.nmId)} />
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </DataTable>
      )}
      {visible.length > ROW_LIMIT ? (
        <p className="mt-3 text-[12.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
          Показаны первые {ROW_LIMIT} из {visible.length}: уточните поиск или фильтры, чтобы увидеть остальные.
        </p>
      ) : null}
      <SourceNote>
        Воронка, заказы, выкуп и упущенное — данные WB за выбранный период. «Хватит» — оценка WB по скорости продаж, показана, когда меньше 30 дней. Маржа — на одну продажу, считается как в «Товарах» по доставкам за 90 дней и не зависит от периода (нужны себестоимость и отчёт реализации); без себестоимости прочерк.
      </SourceNote>
    </Card>
    </div>
  );
}
