"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Truck } from "lucide-react";
import {
  buildCoverRows,
  buildShipmentPlan,
  demandByDistrict,
  isRealDistrict,
  normalizeDistrict,
  summarizeWarehouses,
  type CoverRow,
} from "@/lib/seller-hub/logistics";
import { loadSellerHubRegionOrders, loadSellerHubWarehouseStocks } from "@/lib/seller-hub/client-api";
import { csvCell } from "@/lib/seller-hub/task-engine/report";
import { useUserSetting } from "./use-user-setting";
import { ACCEPTANCE_SLOTS_ENABLED } from "@/lib/seller-hub/feature-flags";
import { HubAcceptance } from "./hub-acceptance";
import { HubDistrictCancels } from "./hub-district-cancels";
import { HubWeekdayProfile } from "./hub-weekday-profile";
import { HubLogisticsCost } from "./hub-logistics-cost";
import type { SellerCatalogSnapshot, SellerRegionOrders, SellerWarehouseStocks } from "@/lib/seller-hub/types";
import {
  formatInt,
  hub,
  HubButton,
  HubEmptyState,
  HubInput,
  HubPanel,
  HubSegmented,
  hubNumeric,
  hubSans,
  MetricTile,
} from "./hub-ui";

type Tab = "overview" | "regions" | "plan" | "warehouses" | "acceptance" | "cost";
type Days = "30" | "60" | "90";

const TH = "border-b px-3 py-2.5 text-[11.5px] font-bold uppercase tracking-[0.06em]";

function pct(value: number): string {
  return `${(value * 100).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`;
}

function Th({ children }: { children: string }) {
  return (
    <th className={TH} style={{ ...hubSans, color: hub.textSubtle, borderColor: hub.borderSoft }}>
      {children}
    </th>
  );
}

function Td({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <td
      className="whitespace-nowrap px-3 py-2.5 text-[13px]"
      style={{ ...hubSans, ...hubNumeric, color: hub.text, fontWeight: strong ? 600 : 400 }}
    >
      {children}
    </td>
  );
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl p-4" style={{ backgroundColor: hub.surface }}>
      <p className="text-[14px] font-semibold" style={{ ...hubSans, color: hub.text }}>
        {title}
      </p>
      {hint ? (
        <p className="mb-3 mt-0.5 text-[12.5px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
          {hint}
        </p>
      ) : (
        <div className="mb-3" />
      )}
      {children}
    </section>
  );
}

const LEVEL_COLOR: Record<CoverRow["level"], string> = { soon14: hub.danger, soon30: hub.warn, ok: hub.greenDark };

/** Полоса запаса: длина в днях до нуля, шкала до 180 дней. */
function CoverBar({ days, level }: { days: number; level: CoverRow["level"] }) {
  const width = Math.max(2, Math.min(100, (days / 180) * 100));
  return (
    <div className="h-2 w-full rounded-full" style={{ backgroundColor: hub.canvas }}>
      <div className="h-2 rounded-full" style={{ width: `${width}%`, backgroundColor: LEVEL_COLOR[level] }} />
    </div>
  );
}

/** Логистика: запас по товарам, спрос по регионам покупателей, остатки по складам WB и план отгрузки. Только чтение, данные WB. */
export function HubLogistics({ snapshot, connected }: { snapshot?: SellerCatalogSnapshot; connected?: boolean }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [days, setDays] = useUserSetting<Days>("logistics.days", "30");
  const [stocks, setStocks] = useState<SellerWarehouseStocks | null>(null);
  const [orders, setOrders] = useState<SellerRegionOrders | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [coverSetting, setCoverSetting] = useUserSetting<number>("logistics.coverDays", 45);
  const [multipleSetting, setMultipleSetting] = useUserSetting<number>("logistics.multiple", 1);
  /** В полях ввода держим текст, а в настройку (общую для устройств) пишем только корректное число. */
  const [coverDraft, setCoverDraft] = useState<string | null>(null);
  const [multipleDraft, setMultipleDraft] = useState<string | null>(null);
  const coverDays = coverDraft ?? String(coverSetting);
  const multiple = multipleDraft ?? String(multipleSetting);
  const setCoverDays = (text: string) => {
    setCoverDraft(text);
    const n = Number(text);
    if (Number.isInteger(n) && n >= 1 && n <= 365) setCoverSetting(n);
  };
  const setMultiple = (text: string) => {
    setMultipleDraft(text);
    const n = Number(text);
    if (Number.isInteger(n) && n >= 1 && n <= 1000) setMultipleSetting(n);
  };

  const items = snapshot?.items;
  const nmIds = useMemo(
    () => (items ?? []).map((item) => Number(item.externalId)).filter((id) => Number.isInteger(id) && id > 0),
    [items],
  );
  const titles = useMemo(
    () => new Map((items ?? []).map((item) => [item.externalId, item.title || item.vendorCode || item.externalId])),
    [items],
  );
  /** Остаток на вашем складе (FBS) по артикулу: с чего можно отгружать на склады WB. */
  const ownStock = useMemo(() => new Map((items ?? []).map((item) => [item.externalId, item.stockFbs ?? 0])), [items]);
  const ownTotal = useMemo(() => [...ownStock.values()].reduce((a, b) => a + b, 0), [ownStock]);

  /** Данные кэшируются на сервере (Supabase): грузим при открытии, пустого экрана с кнопкой нет. */
  const fetchAll = useCallback(
    async (refresh: boolean) => {
      const [stocksResult, ordersResult] = await Promise.all([
        loadSellerHubWarehouseStocks({ nmIds, refresh }).catch(() => null),
        loadSellerHubRegionOrders({ days: Number(days), refresh }).catch(() => null),
      ]);
      return { stocksResult, ordersResult };
    },
    [nmIds, days],
  );

  type Fetched = Awaited<ReturnType<typeof fetchAll>>;
  const apply = useCallback((result: Fetched) => {
    const nextErrors: string[] = [];
    const nextNotes: string[] = [];
    if (result.stocksResult?.ok && result.stocksResult.stocks) {
      setStocks(result.stocksResult.stocks);
      if (result.stocksResult.stale) nextNotes.push("Остатки по складам WB: WB сейчас не ответил, показаны последние сохранённые данные.");
    } else {
      nextErrors.push(result.stocksResult?.error ?? "Не удалось загрузить остатки по складам WB");
    }
    if (result.ordersResult?.ok && result.ordersResult.regions) {
      setOrders(result.ordersResult.regions);
      if (result.ordersResult.stale) nextNotes.push("Заказы по регионам: WB сейчас не ответил, показаны последние сохранённые данные.");
    } else {
      nextErrors.push(result.ordersResult?.error ?? "Не удалось загрузить заказы по регионам");
    }
    setErrors(nextErrors);
    setNotes(nextNotes);
  }, []);

  const requestKey = connected && nmIds.length > 0 ? `${nmIds.length}|${days}` : "";
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const loading = refreshing || (requestKey !== "" && loadedKey !== requestKey);

  useEffect(() => {
    if (!requestKey) return;
    let cancelled = false;
    void fetchAll(false).then((result) => {
      if (cancelled) return;
      apply(result);
      setLoadedKey(requestKey);
    });
    return () => {
      cancelled = true;
    };
  }, [requestKey, fetchAll, apply]);

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    apply(await fetchAll(true));
    setRefreshing(false);
  }

  const warehouses = useMemo(
    () => (stocks ? summarizeWarehouses(stocks.rows.filter((r) => r.quantity > 0 || r.inWayToClient > 0)) : []),
    [stocks],
  );
  const wbTotal = warehouses.reduce((sum, w) => sum + w.quantity, 0);
  const inWay = warehouses.reduce((sum, w) => sum + w.inWayToClient, 0);
  const demand = useMemo(() => (orders ? demandByDistrict(orders.rows) : null), [orders]);
  const stockByDistrict = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of stocks?.rows ?? []) {
      if (!isRealDistrict(row.regionName)) continue;
      const key = normalizeDistrict(row.regionName);
      map.set(key, (map.get(key) ?? 0) + row.quantity);
    }
    return map;
  }, [stocks]);
  const stockTotalReal = [...stockByDistrict.values()].reduce((a, b) => a + b, 0);

  const cover = useMemo(
    () => (orders && stocks ? buildCoverRows({ orders: orders.rows, periodDays: Number(days), wbStock: stocks.rows, ownStock }) : []),
    [orders, stocks, days, ownStock],
  );
  const urgent = cover.filter((row) => row.level !== "ok");
  const totalDailyDemand = cover.reduce((sum, row) => sum + row.dailyDemand, 0);
  const averageCover = totalDailyDemand > 0 ? Math.round(((wbTotal + ownTotal) / totalDailyDemand) * 10) / 10 : null;

  const coverNum = Number(coverDays);
  const multipleNum = Number(multiple);
  const paramsValid = Number.isFinite(coverNum) && coverNum >= 1 && coverNum <= 365 && Number.isInteger(multipleNum) && multipleNum >= 1;
  const plan = useMemo(
    () =>
      orders && stocks && paramsValid
        ? buildShipmentPlan({ orders: orders.rows, stock: stocks.rows, periodDays: Number(days), coverDays: coverNum, multiple: multipleNum })
        : [],
    [orders, stocks, paramsValid, days, coverNum, multipleNum],
  );
  const planNeeded = plan.filter((row) => row.need > 0);
  const planTotal = planNeeded.reduce((sum, row) => sum + row.need, 0);

  function downloadPlan() {
    const head = ["Артикул WB", "Товар", "Округ", "Заказов в день", "Остаток в округе", "Хватит дней", "Отгрузить, шт", "На вашем складе, шт"];
    const lines = planNeeded.map((row) =>
      [row.nmId, titles.get(row.nmId) ?? "", row.district, String(row.dailyDemand), String(row.stock), row.daysCover == null ? "" : String(row.daysCover), String(row.need), String(ownStock.get(row.nmId) ?? "")]
        .map(csvCell)
        .join(";"),
    );
    const blob = new Blob([`﻿${[head.map(csvCell).join(";"), ...lines].join("\r\n")}\r\n`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `karto-otgruzka-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  if (!connected || !snapshot || nmIds.length === 0) {
    return (
      <HubPanel>
        <HubEmptyState
          icon={<Truck className="h-6 w-6" />}
          title="Нужна синхронизация кабинета"
          description="Подключите кабинет WB и выгрузите каталог: логистика строится по вашим артикулам, остаткам на складах и заказам по регионам."
        />
      </HubPanel>
    );
  }

  const fbsOnly = stocks != null && wbTotal === 0;
  const nearest = cover[0] ?? null;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="Ваш склад (FBS)" value={`${formatInt(ownTotal)} шт.`} sub="по данным каталога" />
        <MetricTile
          label="Склады WB (FBO)"
          value={stocks ? `${formatInt(wbTotal)} шт.` : "—"}
          sub={stocks ? `в пути к клиенту ${formatInt(inWay)} шт.` : "загружаю"}
        />
        <MetricTile
          label={`Заказов за ${days} дн.`}
          value={demand ? formatInt(demand.total) : "—"}
          sub={orders ? `${formatInt(demand?.districts.length ?? 0)} округов, без отмен` : "загружаю"}
        />
        <MetricTile
          label="Запаса в среднем хватит"
          value={averageCover != null ? `${formatInt(Math.round(averageCover))} дн.` : "—"}
          sub={nearest ? `ближайший товар: ${formatInt(Math.round(nearest.daysCover))} дн.` : "по общему остатку и спросу"}
          tone={urgent.length > 0 ? "warn" : "default"}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3" style={{ borderColor: hub.border }}>
        <HubSegmented<Tab>
          layoutId="logistics-tabs"
          value={tab}
          onChange={setTab}
          options={[
            { id: "overview", label: `Обзор${urgent.length > 0 ? ` · ${urgent.length}` : ""}` },
            { id: "regions", label: "Регионы" },
            { id: "cost", label: "Стоимость" },
            { id: "plan", label: "Отгрузка" },
            { id: "warehouses", label: "Склады" },
            ...(ACCEPTANCE_SLOTS_ENABLED ? [{ id: "acceptance" as const, label: "Слоты приёмки" }] : []),
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          <HubSegmented<Days>
            layoutId="logistics-days"
            value={days}
            onChange={setDays}
            options={[
              { id: "30", label: "30 дн." },
              { id: "60", label: "60 дн." },
              { id: "90", label: "90 дн." },
            ]}
          />
          <HubButton variant="secondary" size="sm" loading={loading} onClick={() => void refresh()}>
            Обновить
          </HubButton>
        </div>
      </div>

      {errors.map((message) => (
        <p key={message} className="text-[13px]" style={{ ...hubSans, color: hub.danger }}>
          {message}. WB ограничивает частоту запросов: попробуйте обновить через минуту.
        </p>
      ))}
      {notes.map((message) => (
        <p key={message} className="text-[12.5px]" style={{ ...hubSans, color: hub.warn }}>
          {message}
        </p>
      ))}
      {orders?.truncated ? (
        <p className="text-[12.5px]" style={{ ...hubSans, color: hub.warn }}>
          WB отдал больше строк, чем помещается в выгрузку: цифры по заказам занижены. Выберите период короче.
        </p>
      ) : null}

      {tab === "overview" ? (
        <div className="space-y-4">
          <Card
            title="Запас по товарам"
            hint={
              !orders || !stocks
                ? "Загружаю спрос и остатки…"
                : urgent.length > 0
                  ? `Товаров, которые закончатся в течение 30 дней: ${formatInt(urgent.length)}. Меньше 14 дней — отгружайте, меньше 30 — пора заказывать или производить.`
                  : nearest
                    ? `Срочных рисков нет: ближайший к нулю товар хватит на ${formatInt(Math.round(nearest.daysCover))} дн. Ниже — товары с самым коротким запасом.`
                    : "За выбранный период заказов нет, запас считать не из чего."
            }
          >
            {cover.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-left">
                  <thead style={{ backgroundColor: hub.surfaceMuted }}>
                    <tr>
                      <Th>Товар</Th>
                      <Th>Заказов в день</Th>
                      <Th>Ваш склад</Th>
                      <Th>Склады WB</Th>
                      <Th>Хватит</Th>
                      <th className={TH} style={{ ...hubSans, color: hub.textSubtle, borderColor: hub.borderSoft, minWidth: 140 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {cover.slice(0, 10).map((row) => (
                      <tr key={row.nmId} className="border-b" style={{ borderColor: hub.borderSoft }}>
                        <td className="max-w-[280px] truncate px-3 py-2.5 text-[13px] font-medium" style={hubSans}>
                          {titles.get(row.nmId) ?? row.nmId}
                        </td>
                        <Td>{row.dailyDemand.toLocaleString("ru-RU")}</Td>
                        <Td>{formatInt(row.ownStock)}</Td>
                        <Td>{formatInt(row.wbStock)}</Td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-[13px] font-semibold" style={{ ...hubSans, ...hubNumeric, color: LEVEL_COLOR[row.level] }}>
                          {row.daysCover > 365 ? "> 365 дн." : `${formatInt(Math.round(row.daysCover))} дн.`}
                        </td>
                        <td className="px-3 py-2.5">
                          <CoverBar days={row.daysCover} level={row.level} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </Card>

          <Card
            title="Куда уходят заказы"
            hint="Доля заказов по округам покупателей за период, без отмен. Показывает, где у вас спрос и куда выгодно держать товар поближе."
          >
            {demand && demand.districts.length > 0 ? (
              <ul className="space-y-2">
                {demand.districts.slice(0, 8).map((row) => {
                  const have = stockByDistrict.get(row.district) ?? 0;
                  return (
                    <li key={row.district} className="grid grid-cols-[150px_1fr_130px] items-center gap-3">
                      <span className="truncate text-[13px] font-medium" style={{ ...hubSans, color: hub.text }}>
                        {row.district}
                      </span>
                      <div className="h-2.5 rounded-full" style={{ backgroundColor: hub.canvas }}>
                        <div className="h-2.5 rounded-full" style={{ width: `${Math.max(2, row.share * 100)}%`, backgroundColor: hub.blue }} />
                      </div>
                      <span className="text-right text-[12.5px]" style={{ ...hubSans, ...hubNumeric, color: hub.textMuted }}>
                        {pct(row.share)} · {formatInt(row.orders)} зак.{stockTotalReal > 0 ? ` · WB ${formatInt(have)}` : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-[13px]" style={{ ...hubSans, color: hub.textMuted }}>
                {orders ? "За этот период заказов по регионам нет." : "Загружаю заказы по регионам…"}
              </p>
            )}
          </Card>

          {fbsOnly ? (
            <p className="rounded-2xl px-4 py-3 text-[12.5px] leading-5" style={{ ...hubSans, backgroundColor: hub.surface, color: hub.textMuted }}>
              Вы работаете со своего склада (FBS): у WB товара почти нет. Вкладки «Отгрузка» и «Склады» полезны, если вы
              отправляете или планируете отправлять товар на склады WB (FBO).
            </p>
          ) : null}
        </div>
      ) : null}

      {tab === "cost" ? <HubLogisticsCost snapshot={snapshot} /> : null}

      {tab === "acceptance" && ACCEPTANCE_SLOTS_ENABLED ? <HubAcceptance connected={connected} ownWarehouses={new Set(warehouses.map((w) => w.warehouseName))} /> : null}

      {tab === "regions" && orders ? <HubWeekdayProfile orders={orders} days={Number(days)} /> : null}

      {tab === "regions" && orders ? <HubDistrictCancels rows={orders.rows} /> : null}

      {tab === "regions" ? (
        demand && demand.districts.length > 0 ? (
          <div className="overflow-x-auto rounded-2xl p-4" style={{ backgroundColor: hub.surface }}>
            <p className="mb-2 text-[12px] leading-5" style={{ ...hubSans, color: hub.textSubtle }}>
              Доля спроса — сколько заказов приходится на округ покупателя. Доля остатка — какая часть вашего товара на складах
              WB лежит в этом округе. Если спрос заметно больше остатка, округ недообеспечен: покупатели ждут доставку из других
              регионов.
            </p>
            <table className="min-w-full border-collapse text-left">
              <thead style={{ backgroundColor: hub.surfaceMuted }}>
                <tr>
                  <Th>Округ покупателей</Th>
                  <Th>Заказов</Th>
                  <Th>Доля спроса</Th>
                  <Th>Остаток на складах WB</Th>
                  <Th>Доля остатка</Th>
                  <Th>Разрыв</Th>
                </tr>
              </thead>
              <tbody>
                {demand.districts.map((row) => {
                  const have = stockByDistrict.get(row.district) ?? 0;
                  const stockShare = stockTotalReal > 0 ? have / stockTotalReal : 0;
                  const gap = stockTotalReal > 0 ? row.share - stockShare : null;
                  return (
                    <tr key={row.district} className="border-b" style={{ borderColor: hub.borderSoft }}>
                      <td className="px-3 py-2.5 text-[13px] font-medium" style={hubSans}>
                        {row.district}
                      </td>
                      <Td>{formatInt(row.orders)}</Td>
                      <Td>{pct(row.share)}</Td>
                      <Td>{stockTotalReal > 0 ? `${formatInt(have)} шт.` : "—"}</Td>
                      <Td>{stockTotalReal > 0 ? pct(stockShare) : "—"}</Td>
                      <td
                        className="whitespace-nowrap px-3 py-2.5 text-[13px] font-semibold"
                        style={{ ...hubSans, ...hubNumeric, color: gap == null ? hub.textSubtle : gap > 0.1 ? hub.danger : hub.greenDark }}
                      >
                        {gap == null ? "нет остатков WB" : `${gap > 0 ? "+" : ""}${(gap * 100).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} п. п.`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-2xl px-5 py-6 text-[13px]" style={{ ...hubSans, color: hub.textMuted, backgroundColor: hub.surface }}>
            {orders ? "За этот период заказов по регионам нет." : "Загружаю заказы по регионам…"}
          </p>
        )
      ) : null}

      {tab === "plan" ? (
        <div className="space-y-3 rounded-2xl p-4" style={{ backgroundColor: hub.surface }}>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-[12.5px]" style={{ ...hubSans, color: hub.textMuted }}>
              Запас на, дней
              <HubInput value={coverDays} onChange={(e) => setCoverDays(e.target.value)} inputMode="numeric" className="mt-1 w-28" />
            </label>
            <label className="text-[12.5px]" style={{ ...hubSans, color: hub.textMuted }}>
              Кратность короба, шт.
              <HubInput value={multiple} onChange={(e) => setMultiple(e.target.value)} inputMode="numeric" className="mt-1 w-28" />
            </label>
            <p className="max-w-xl text-[12px] leading-5" style={{ ...hubSans, color: hub.textSubtle }}>
              Нужный запас = заказов в день по округу × дни запаса − остаток на складах WB этого округа, вверх до кратности
              короба. Спрос из заказов покупателей этого округа за выбранный период. Виртуальный «Склад WB» к округу не
              относится.
            </p>
          </div>
          {!paramsValid ? (
            <p className="text-[13px]" style={{ ...hubSans, color: hub.danger }}>
              Запас — от 1 до 365 дней, кратность — целое число от 1.
            </p>
          ) : !orders || !stocks ? (
            <p className="text-[13px]" style={{ ...hubSans, color: hub.textMuted }}>
              Загружаю спрос и остатки…
            </p>
          ) : planNeeded.length === 0 ? (
            <p className="text-[13px]" style={{ ...hubSans, color: hub.textMuted }}>
              Остатков на складах WB хватает на {coverNum} дн. по всем округам, отгрузка не нужна.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[13.5px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                  К отгрузке на склады WB: {formatInt(planTotal)} шт. по {formatInt(planNeeded.length)} позициям
                </p>
                <HubButton variant="secondary" size="sm" onClick={downloadPlan}>
                  Скачать план (CSV)
                </HubButton>
              </div>
              {fbsOnly ? (
                <p className="text-[12.5px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
                  Сейчас у WB почти нет вашего товара, поэтому план показывает, сколько понадобилось бы, чтобы закрыть спрос
                  по округам со складов WB. При работе с FBS это справка, а не обязательная отгрузка.
                </p>
              ) : null}
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-left">
                  <thead style={{ backgroundColor: hub.surfaceMuted }}>
                    <tr>
                      <Th>Товар</Th>
                      <Th>Округ</Th>
                      <Th>Заказов в день</Th>
                      <Th>Остаток в округе</Th>
                      <Th>Хватит дней</Th>
                      <Th>Отгрузить, шт.</Th>
                      <Th>На вашем складе</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {planNeeded.slice(0, 60).map((row) => (
                      <tr key={`${row.nmId}-${row.district}`} className="border-b" style={{ borderColor: hub.borderSoft }}>
                        <td className="max-w-[260px] truncate px-3 py-2.5 text-[13px] font-medium" style={hubSans}>
                          {titles.get(row.nmId) ?? row.nmId}
                        </td>
                        <td className="px-3 py-2.5 text-[13px]" style={{ ...hubSans, color: hub.textMuted }}>
                          {row.district}
                        </td>
                        <Td>{row.dailyDemand.toLocaleString("ru-RU")}</Td>
                        <Td>{formatInt(row.stock)}</Td>
                        <Td>{row.daysCover == null ? "—" : row.daysCover.toLocaleString("ru-RU")}</Td>
                        <Td strong>{formatInt(row.need)}</Td>
                        <Td>{formatInt(ownStock.get(row.nmId) ?? 0)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      ) : null}

      {tab === "warehouses" ? (
        <div className="space-y-3 rounded-2xl p-4" style={{ backgroundColor: hub.surface }}>
          <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{ backgroundColor: hub.canvas }}>
            <div>
              <p className="text-[13.5px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                Ваш склад (FBS)
              </p>
              <p className="text-[12px]" style={{ ...hubSans, color: hub.textMuted }}>
                Остаток по каталогу кабинета; отгрузки на склады WB берутся отсюда.
              </p>
            </div>
            <p className="text-[18px] font-semibold" style={{ ...hubSans, ...hubNumeric, color: hub.text }}>
              {formatInt(ownTotal)} шт.
            </p>
          </div>
          {warehouses.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-left">
                <thead style={{ backgroundColor: hub.surfaceMuted }}>
                  <tr>
                    <Th>Склад WB</Th>
                    <Th>Округ</Th>
                    <Th>Остаток, шт.</Th>
                    <Th>Артикулов</Th>
                    <Th>В пути к клиенту</Th>
                    <Th>В пути от клиента</Th>
                    <Th>Доля остатка</Th>
                  </tr>
                </thead>
                <tbody>
                  {warehouses.map((w) => (
                    <tr key={w.warehouseId} className="border-b" style={{ borderColor: hub.borderSoft }}>
                      <td className="px-3 py-2.5 text-[13px] font-medium" style={hubSans}>
                        {w.warehouseName}
                      </td>
                      <td className="px-3 py-2.5 text-[13px]" style={{ ...hubSans, color: hub.textMuted }}>
                        {isRealDistrict(w.district) ? w.district : "—"}
                      </td>
                      <Td strong>{formatInt(w.quantity)}</Td>
                      <Td>{formatInt(w.products)}</Td>
                      <Td>{formatInt(w.inWayToClient)}</Td>
                      <Td>{formatInt(w.inWayFromClient)}</Td>
                      <Td>{wbTotal > 0 ? pct(w.quantity / wbTotal) : "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-[13px]" style={{ ...hubSans, color: hub.textMuted }}>
              {stocks ? "На складах WB вашего товара сейчас нет." : "Загружаю остатки по складам WB…"}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
