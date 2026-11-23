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
import { snapshotTimeMs } from "@/lib/seller-hub/complete-days";
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
  HubTabs,
  HubEmptyState,
  hubSans,
} from "./hub-ui";
import { clearEvidenceFocus, peekEvidenceFocus, revealEvidence } from "./evidence-focus";
import { FCard as Card, Headline, HubPanel, Thumb } from "./hub-fulfillment-ui";
import { cn } from "@/lib/utils";
import { TreemapChart as DistrictMosaic } from "./hub-analytics-viz";
import { LoadingBlock, Segmented, StatBlock, StatStrip } from "./hub-analytics-ui";
import { registerHubCache } from "./hub-cache-registry";

type Tab = "overview" | "regions" | "plan" | "acceptance" | "cost";
type Days = "30" | "60" | "90";

/** Сколько строк показываем сразу: у продавца с сотнями товаров экран остаётся компактным, остальное за кнопкой. */
const COVER_SHOWN = 8;
const REGIONS_SHOWN = 8;
const PLAN_SHOWN = 10;
const MONO = { fontFamily: "var(--font-geist-mono), ui-monospace, monospace", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.05em" } as const;

/** Доля целым процентом; меньше процента — «<1%», чтобы небольшой остаток не превращался в «0%». */
function shareLabel(v: number): string {
  return v > 0 && v < 0.01 ? "<1%" : `${Math.round(v * 100)}%`;
}

function pct(value: number): string {
  return `${(value * 100).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`;
}

/** Округа: оттенки одного цвета от самого крупного к самому мелкому. */
const DISTRICT_RAMP = ["#12201A", "#244034", "#3A6049", "#5F8A66", "#92B77A", "#C4E08A", "#E4F2BF"];

/** Уже загруженные остатки и заказы по регионам: при возврате в раздел показываются мгновенно. */
const LOGISTICS_CACHE = registerHubCache(new Map<string, { at: number; result: Awaited<ReturnType<typeof loadLogisticsPair>> }>());
async function loadLogisticsPair(nmIds: number[], days: number, refresh: boolean) {
  const [stocksResult, ordersResult] = await Promise.all([
    loadSellerHubWarehouseStocks({ nmIds, refresh }).catch(() => null),
    loadSellerHubRegionOrders({ days, refresh }).catch(() => null),
  ]);
  return { stocksResult, ordersResult };
}
const LOGISTICS_FRESH_MS = 5 * 60 * 1000;

const LEVEL_COLOR: Record<CoverRow["level"], string> = { soon14: "#C8453F", soon30: "#D9912B", ok: "#2A3A30" };

/** Столбики из точек: каждая точка — один товар (или несколько, если товаров много). Высота столбца — сколько товаров в группе по запасу. */

/** Поле с кнопками «−» и «+», чтобы число не печатать руками. Корректное значение пишется сразу, пустое и неверное остаётся в поле. */
function Stepper({ label, value, onChange, min, max, step = 1, suffix }: { label: string; value: string; onChange: (text: string) => void; min: number; max: number; step?: number; suffix?: string }) {
  const n = Number(value);
  const valid = Number.isInteger(n) && n >= min && n <= max;
  const bump = (d: number) => onChange(String(Math.min(max, Math.max(min, (valid ? n : min) + d))));
  const btn = "flex h-10 w-10 items-center justify-center rounded-full text-[20px] font-medium leading-none transition-colors hover:bg-black/[0.06]";
  return (
    <div>
      <p className="mb-1.5 text-[14px]" style={{ ...hubSans, color: hub.textMuted }}>
        {label}
      </p>
      <div className="inline-flex items-center gap-1 rounded-full border p-1" style={{ borderColor: valid ? "rgba(1, 20, 8, 0.18)" : hub.danger, backgroundColor: hub.surface }}>
        <button type="button" onClick={() => bump(-step)} className={btn} style={{ color: hub.text }} aria-label="Меньше">
          −
        </button>
        <input value={value} onChange={(e) => onChange(e.target.value)} inputMode="numeric" className="w-[60px] bg-transparent text-center text-[18px] font-medium outline-none" style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace", color: hub.text }} aria-label={label} />
        {suffix ? <span className="pr-1 text-[14px]" style={{ ...hubSans, color: hub.textSubtle }}>{suffix}</span> : null}
        <button type="button" onClick={() => bump(step)} className={btn} style={{ color: hub.text }} aria-label="Больше">
          +
        </button>
      </div>
    </div>
  );
}

/** Логистика: запас по товарам, спрос по регионам покупателей, остатки по складам WB и план отгрузки. Только чтение, данные WB. */
export function HubLogistics({ snapshot, connected }: { snapshot?: SellerCatalogSnapshot; connected?: boolean }) {
  const [tab, setTab] = useState<Tab>(() => (peekEvidenceFocus("cost") ? "cost" : "overview"));
  const costAnchor = peekEvidenceFocus("cost")?.anchor;
  useEffect(() => {
    if (!costAnchor) return;
    const stop = revealEvidence(costAnchor);
    return () => {
      stop();
      clearEvidenceFocus();
    };
    // фокус одноразовый: берём один раз при открытии вкладки
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [coverAll, setCoverAll] = useState(false);
  const [whAll, setWhAll] = useState(false);
  const [regionsAll, setRegionsAll] = useState(false);
  const [planAll, setPlanAll] = useState(false);
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
  const photos = useMemo(() => new Map((snapshot?.items ?? []).map((item) => [item.externalId, item.imageUrl ?? undefined])), [snapshot?.items]);
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
      return loadLogisticsPair(nmIds, Number(days), refresh);
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
  const [, setLoadedKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!requestKey) return;
    let cancelled = false;
    // Повторное открытие раздела: сразу показываем то, что уже загружали, и тихо обновляем, если данным больше 5 минут.
    const cached = LOGISTICS_CACHE.get(requestKey);
    if (cached) {
      void Promise.resolve().then(() => {
        if (cancelled) return;
        apply(cached.result);
        setLoadedKey(requestKey);
      });
      if (Date.now() - cached.at < LOGISTICS_FRESH_MS) {
        return () => {
          cancelled = true;
        };
      }
    }
    void fetchAll(false).then((result) => {
      if (cancelled) return;
      if (result.stocksResult?.ok && result.ordersResult?.ok) LOGISTICS_CACHE.set(requestKey, { at: Date.now(), result });
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

  const ROW = "border-t";
  const rowStyle = { borderColor: "rgba(1, 20, 8, 0.09)" } as const;
  const baseMs = snapshotTimeMs(snapshot);
  const zeroDate = (d: number) => (baseMs > 0 ? new Date(baseMs + d * 86_400_000).toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) : "");
  const covBuckets = [
    { label: "до 14 дн.", test: (d: number) => d < 14, color: LEVEL_COLOR.soon14 },
    { label: "14–30", test: (d: number) => d >= 14 && d < 30, color: LEVEL_COLOR.soon30 },
    { label: "30–60", test: (d: number) => d >= 30 && d < 60, color: LEVEL_COLOR.ok },
    { label: "60–120", test: (d: number) => d >= 60 && d < 120, color: LEVEL_COLOR.ok },
    { label: "120–365", test: (d: number) => d >= 120 && d < 365, color: LEVEL_COLOR.ok },
    { label: "больше года", test: (d: number) => d >= 365, color: LEVEL_COLOR.ok },
  ].map((b) => ({ label: b.label, color: b.color, count: cover.filter((r) => b.test(r.daysCover)).length }));

  return (
    <div className="space-y-9">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <HubTabs<Tab>
          label="Разделы логистики"
          value={tab}
          onChange={setTab}
          options={[
            { id: "overview", label: "Обзор", count: urgent.length > 0 ? urgent.length : undefined },
            { id: "regions", label: "Регионы" },
            { id: "cost", label: "Стоимость" },
            { id: "plan", label: "Отгрузка" },
            ...(ACCEPTANCE_SLOTS_ENABLED ? [{ id: "acceptance" as const, label: "Слоты приёмки" }] : []),
          ]}
        />
        <div className="flex flex-wrap items-center gap-2 pb-3">
          <Segmented<Days>
            size="sm"
            label="Период"
            layoutId="logistics-days"
            value={days}
            onChange={setDays}
            options={[
              { id: "30", label: "30 дн." },
              { id: "60", label: "60 дн." },
              { id: "90", label: "90 дн." },
            ]}
          />
        </div>
      </div>

      <Headline
        items={[
          { value: `${formatInt(ownTotal)} шт.`, label: "На вашем складе", note: "по каталогу кабинета" },
          { value: stocks ? `${formatInt(wbTotal)} шт.` : "—", label: "На складах WB", note: stocks ? `в пути к клиенту ${formatInt(inWay)} шт.` : "загружаю" },
          { value: demand ? formatInt(demand.total) : "—", label: `Заказов за ${days} дн.`, note: orders ? `${formatInt(demand?.districts.length ?? 0)} округов, без отмен` : "загружаю" },
          { value: averageCover != null ? `${formatInt(Math.round(averageCover))} дн.` : "—", label: "Запаса в среднем", note: nearest ? `ближайший товар — ${formatInt(Math.round(nearest.daysCover))} дн.` : "по остатку и спросу", color: urgent.length > 0 ? LEVEL_COLOR.soon30 : undefined },
        ]}
      />

      {errors.map((message) => (
        <p key={message} className="text-[14.5px]" style={{ ...hubSans, color: hub.danger }}>
          {message}. WB ограничивает частоту запросов.{" "}
          <button type="button" className="font-semibold underline underline-offset-2" onClick={() => void refresh()}>
            Повторить
          </button>
        </p>
      ))}
      {notes.map((message) => (
        <p key={message} className="text-[14px]" style={{ ...hubSans, color: hub.warn }}>
          {message}
        </p>
      ))}
      {orders?.truncated ? (
        <p className="text-[14px]" style={{ ...hubSans, color: hub.warn }}>
          WB отдал больше строк, чем помещается в выгрузку: цифры по заказам занижены. Выберите период короче.
        </p>
      ) : null}

      {tab === "overview" ? (
        <div className="space-y-6">
          <Card title="Запас по товарам" hint={!orders || !stocks ? undefined : cover.length === 0 ? "За выбранный период заказов нет, запас считать не из чего" : urgent.length > 0 ? "Меньше 14 дней — пора отгружать, меньше 30 — заказывать или производить" : nearest ? `Срочных рисков нет: ближайший к нулю товар хватит на ${formatInt(Math.round(nearest.daysCover))} дн.` : undefined}>
            {!orders || !stocks ? (
              <LoadingBlock title="Считаю запас" height={140} />
            ) : cover.length > 0 ? (
              <StatStrip cols={3}>
                <StatBlock label="Закончится меньше чем за 14 дней" value={formatInt(covBuckets[0]!.count)} color={covBuckets[0]!.count > 0 ? LEVEL_COLOR.soon14 : undefined} sub={covBuckets[0]!.count > 0 ? "пора отгружать" : "срочного нет"} />
                <StatBlock label="Хватит на 14–30 дней" value={formatInt(covBuckets[1]!.count)} color={covBuckets[1]!.count > 0 ? LEVEL_COLOR.soon30 : undefined} sub={covBuckets[1]!.count > 0 ? "пора заказывать" : "таких нет"} />
                <StatBlock label="Хватит больше чем на 30 дней" value={formatInt(cover.length - covBuckets[0]!.count - covBuckets[1]!.count)} sub="запас в порядке" />
              </StatStrip>
            ) : null}
          </Card>

          <div className="space-y-6">
          {cover.length > 0 ? (
            <Card title="Что закончится раньше всего" hint="От самого срочного; дата — когда товар кончится при нынешнем спросе">
              <div className="hidden items-center gap-x-5 border-b pb-3 text-[12px] font-semibold uppercase tracking-[0.07em] md:grid md:grid-cols-[minmax(0,1fr)_92px_92px_120px]" style={{ ...hubSans, color: hub.textSubtle, borderColor: "rgba(1, 20, 8, 0.12)" }}>
                <span>Товар</span>
                <span className="text-right">Остаток</span>
                <span className="text-right">В день</span>
                <span className="text-right">Хватит на</span>
              </div>
              <ul className={cn(coverAll && "max-h-[640px] overflow-y-auto pr-2")}>
                {(coverAll ? cover : cover.slice(0, COVER_SHOWN)).map((row) => (
                  <li key={row.nmId} className="grid items-center gap-x-5 gap-y-2 border-b py-3.5 md:grid-cols-[minmax(0,1fr)_92px_92px_120px]" style={{ borderColor: "rgba(1, 20, 8, 0.08)" }}>
                    <div className="flex min-w-0 items-center gap-4">
                      <Thumb src={photos.get(row.nmId)} className="h-[56px] w-[43px]" />
                      <p className="line-clamp-2 min-w-0 text-[15.5px] font-semibold leading-[1.3]" style={{ ...hubSans, color: hub.text }}>
                        {titles.get(row.nmId) ?? row.nmId}
                      </p>
                    </div>
                    <p className="flex items-baseline justify-between md:block md:text-right" style={MONO}>
                      <span className="text-[13px] md:hidden" style={{ ...hubSans, letterSpacing: 0, color: hub.textSubtle }}>Остаток</span>
                      <span className="text-[17px] font-medium" style={{ color: hub.text }}>{formatInt(row.ownStock + row.wbStock)}</span>
                    </p>
                    <p className="flex items-baseline justify-between md:block md:text-right" style={MONO}>
                      <span className="text-[13px] md:hidden" style={{ ...hubSans, letterSpacing: 0, color: hub.textSubtle }}>В день</span>
                      <span className="text-[17px] font-medium" style={{ color: hub.text }}>{row.dailyDemand.toLocaleString("ru-RU")}</span>
                    </p>
                    <div className="flex items-baseline justify-between gap-3 md:block md:text-right">
                      <span className="text-[13px] md:hidden" style={{ ...hubSans, color: hub.textSubtle }}>Хватит на</span>
                      <div>
                        <p className="whitespace-nowrap text-[22px] font-semibold leading-none" style={{ ...MONO, color: row.level === "ok" ? hub.text : LEVEL_COLOR[row.level] }}>
                          {row.daysCover > 365 ? "> 365" : formatInt(Math.round(row.daysCover))}
                          <span className="ml-1.5 text-[13px] font-medium" style={{ ...hubSans, letterSpacing: 0, color: hub.textMuted }}>дн.</span>
                        </p>
                        <p className="mt-1.5 text-[12.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
                          {row.daysCover > 365 ? "больше года" : baseMs > 0 ? `до ${zeroDate(row.daysCover)}` : ""}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              {cover.length > COVER_SHOWN ? (
                <div className="mt-4">
                  <HubButton size="sm" variant="secondary" onClick={() => setCoverAll((v) => !v)}>
                    {coverAll ? "Свернуть" : `Показать все (${cover.length})`}
                  </HubButton>
                </div>
              ) : null}
            </Card>
          ) : null}

          <Card title="Где лежит товар" hint="Ваш склад (FBS) и склады Wildberries (FBO)">
            {!stocks ? (
              <LoadingBlock title="Загружаю остатки" height={180} />
            ) : (
              <div className="grid gap-x-12 gap-y-8 md:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
                <div className="grid grid-cols-2 content-start gap-x-6 gap-y-8 md:grid-cols-1">
                  {[
                    { n: ownTotal, label: "На вашем складе", share: ownTotal + wbTotal > 0 ? ownTotal / (ownTotal + wbTotal) : null },
                    { n: wbTotal, label: "На складах WB", share: ownTotal + wbTotal > 0 ? wbTotal / (ownTotal + wbTotal) : null },
                  ].map((x) => (
                    <div key={x.label} className="min-w-0">
                      <p className="whitespace-nowrap text-[34px] font-semibold leading-none" style={{ ...MONO, color: hub.text }}>
                        {formatInt(x.n)}
                        <span className="ml-1.5 text-[16px] font-medium" style={{ ...hubSans, letterSpacing: 0, color: hub.textMuted }}>шт.</span>
                      </p>
                      <p className="mt-3 text-[15px] font-medium" style={{ ...hubSans, color: hub.text }}>{x.label}</p>
                      <p className="mt-1 text-[13.5px]" style={{ ...hubSans, color: hub.textMuted }}>{x.share != null ? `${shareLabel(x.share)} всего товара` : "—"}</p>
                    </div>
                  ))}
                </div>
                <div className="min-w-0">
                {warehouses.length > 0 ? (
                  <ul className={cn(whAll && "max-h-[520px] overflow-y-auto pr-2")}>
                    {(whAll ? warehouses : warehouses.slice(0, 4)).map((w) => (
                      <li key={w.warehouseId} className="flex items-center justify-between gap-6 border-b py-3.5" style={rowStyle}>
                        <div className="min-w-0">
                          <p className="truncate text-[15px] font-medium" style={{ ...hubSans, color: hub.text }}>{w.warehouseName}</p>
                          <p className="mt-1 text-[13px]" style={{ ...hubSans, color: hub.textMuted }}>
                            {[isRealDistrict(w.district) ? w.district : null, `${formatInt(w.products)} арт.`, w.inWayToClient > 0 ? `в пути ${formatInt(w.inWayToClient)}` : null].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[19px] font-semibold leading-none" style={{ ...MONO, color: hub.text }}>{formatInt(w.quantity)}</p>
                          <p className="mt-2 text-[13px]" style={{ ...hubSans, color: hub.textSubtle }}>{wbTotal > 0 ? shareLabel(w.quantity / wbTotal) : ""}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[15px] leading-[1.55]" style={{ ...hubSans, color: hub.textMuted }}>
                    На складах WB вашего товара сейчас нет: вы работаете со своего склада.
                  </p>
                )}
                {warehouses.length > 4 ? (
                  <div className="mt-4">
                    <HubButton size="sm" variant="secondary" onClick={() => setWhAll((v) => !v)}>
                      {whAll ? "Свернуть" : `Показать все склады (${warehouses.length})`}
                    </HubButton>
                  </div>
                ) : null}
                </div>
              </div>
            )}
          </Card>

          </div>

          <Card title="Куда уходят заказы" hint="Доля заказов по округам покупателей за период, без отмен: где у вас спрос и куда выгодно держать товар поближе">
            {demand && demand.districts.length > 0 ? (
              <DistrictMosaic
                height={320}
                format={(n) => `${formatInt(n)} зак.`}
                items={demand.districts.map((row, i) => ({
                  id: row.district,
                  title: row.district,
                  value: row.orders,
                  color: DISTRICT_RAMP[Math.min(i, DISTRICT_RAMP.length - 1)]!,
                  ink: i < 4 ? ("light" as const) : ("dark" as const),
                  note: stockTotalReal > 0 ? `на складах WB ${formatInt(stockByDistrict.get(row.district) ?? 0)} шт.` : undefined,
                }))}
              />
            ) : orders ? (
              <p className="text-[15.5px]" style={{ ...hubSans, color: hub.textMuted }}>
                За этот период заказов по регионам нет.
              </p>
            ) : (
              <LoadingBlock title="Загружаю заказы по регионам" height={200} />
            )}
          </Card>
        </div>
      ) : null}

      {tab === "cost" ? <HubLogisticsCost snapshot={snapshot} /> : null}

      {tab === "acceptance" && ACCEPTANCE_SLOTS_ENABLED ? <HubAcceptance connected={connected} ownWarehouses={new Set(warehouses.map((w) => w.warehouseName))} /> : null}

      {tab === "regions" ? (
        <div className="space-y-6">
          {orders ? <HubWeekdayProfile orders={orders} days={Number(days)} /> : null}
          {orders ? <HubDistrictCancels rows={orders.rows} /> : null}
          {demand && demand.districts.length > 0 ? (
            <Card
              title="Спрос и остатки по округам"
              hint={stockTotalReal > 0 ? "Доля спроса — сколько заказов приходится на округ покупателя. Доля остатка — какая часть вашего товара на складах WB лежит в этом округе. Если спрос заметно больше остатка, округ недообеспечен" : "Сколько заказов приходится на каждый округ покупателей. На складах WB сейчас нет вашего товара, поэтому остатки по округам не показываем: после поставки на WB рядом со спросом появится доля остатка"}
            >
              <div className={cn("hidden items-center gap-x-6 border-b pb-3 text-[12px] font-semibold uppercase tracking-[0.07em] md:grid", stockTotalReal > 0 ? "md:grid-cols-[minmax(0,1fr)_96px_120px_120px_120px]" : "md:grid-cols-[minmax(0,1fr)_96px_120px]")} style={{ ...hubSans, color: hub.textSubtle, borderColor: "rgba(1, 20, 8, 0.12)" }}>
                <span>Округ</span>
                <span className="text-right">Заказов</span>
                <span className="text-right">Доля спроса</span>
                {stockTotalReal > 0 ? <span className="text-right">Доля остатка</span> : null}
                {stockTotalReal > 0 ? <span className="text-right">Разрыв</span> : null}
              </div>
              <ul>
                {(regionsAll ? demand.districts : demand.districts.slice(0, REGIONS_SHOWN)).map((row) => {
                  const have = stockByDistrict.get(row.district) ?? 0;
                  const stockShare = stockTotalReal > 0 ? have / stockTotalReal : 0;
                  const gap = stockTotalReal > 0 ? row.share - stockShare : null;
                  const cell = "flex items-baseline justify-between gap-3 md:block md:text-right";
                  const lab = "text-[13px] md:hidden";
                  return (
                    <li key={row.district} className={cn("grid items-center gap-x-6 gap-y-2 border-b py-4", stockTotalReal > 0 ? "md:grid-cols-[minmax(0,1fr)_96px_120px_120px_120px]" : "md:grid-cols-[minmax(0,1fr)_96px_120px]")} style={rowStyle}>
                      <p className="text-[16.5px] font-semibold" style={{ ...hubSans, color: hub.text }}>{row.district}</p>
                      <p className={cell} style={MONO}><span className={lab} style={{ ...hubSans, letterSpacing: 0, color: hub.textSubtle }}>Заказов</span><span className="text-[19px] font-medium" style={{ color: hub.text }}>{formatInt(row.orders)}</span></p>
                      <p className={cell} style={MONO}><span className={lab} style={{ ...hubSans, letterSpacing: 0, color: hub.textSubtle }}>Доля спроса</span><span className="text-[19px] font-semibold" style={{ color: hub.text }}>{pct(row.share)}</span></p>
                      {stockTotalReal > 0 ? <p className={cell} style={MONO}><span className={lab} style={{ ...hubSans, letterSpacing: 0, color: hub.textSubtle }}>Доля остатка</span><span className="text-[19px] font-medium" style={{ color: hub.text }}>{pct(stockShare)}</span></p> : null}
                      {gap != null ? <p className={cell} style={MONO}><span className={lab} style={{ ...hubSans, letterSpacing: 0, color: hub.textSubtle }}>Разрыв</span><span className="text-[19px] font-medium" style={{ color: gap > 0.1 ? LEVEL_COLOR.soon14 : hub.text }}>{gap > 0 ? "+" : ""}{(gap * 100).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} п. п.</span></p> : null}
                    </li>
                  );
                })}
              </ul>
              {demand.districts.length > REGIONS_SHOWN ? (
                <div className="mt-4">
                  <HubButton size="sm" variant="secondary" onClick={() => setRegionsAll((v) => !v)}>
                    {regionsAll ? "Свернуть" : `Показать все округа (${demand.districts.length})`}
                  </HubButton>
                </div>
              ) : null}
            </Card>
          ) : (
            <Card title="Спрос и остатки по округам">
              {orders ? <p className="text-[15.5px]" style={{ ...hubSans, color: hub.textMuted }}>За этот период заказов по регионам нет.</p> : <LoadingBlock title="Загружаю заказы по регионам" height={240} />}
            </Card>
          )}
        </div>
      ) : null}

      {tab === "plan" ? (
        <Card
          first
          title="План отгрузки на склады WB"
          hint="Нужный запас = заказов в день по округу × дни запаса − остаток на складах WB этого округа, вверх до кратности короба"
          action={
            planNeeded.length > 0 ? (
              <HubButton variant="secondary" size="sm" onClick={downloadPlan}>
                Скачать план (CSV)
              </HubButton>
            ) : undefined
          }
        >
          <div className="mb-8 flex flex-wrap items-end gap-x-10 gap-y-5">
            <div>
              <Stepper label="На сколько дней нужен запас" value={coverDays} onChange={setCoverDays} min={1} max={365} step={5} suffix="дн." />
              <div className="mt-3 flex flex-wrap gap-1.5">
                {[14, 30, 45, 60, 90].map((d) => (
                  <button key={d} type="button" onClick={() => setCoverDays(String(d))} className="rounded-full border px-3.5 py-1 text-[13.5px] font-medium transition-colors hover:bg-black/[0.04]" style={{ ...hubSans, borderColor: String(d) === coverDays ? "#12201A" : "rgba(1, 20, 8, 0.16)", backgroundColor: String(d) === coverDays ? "#12201A" : "transparent", color: String(d) === coverDays ? "#FFFFFF" : hub.textMuted }}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <Stepper label="Кратность короба" value={multiple} onChange={setMultiple} min={1} max={1000} suffix="шт." />
          </div>
          {!paramsValid ? (
            <p className="text-[15px]" style={{ ...hubSans, color: hub.danger }}>
              Запас — от 1 до 365 дней, кратность — целое число от 1.
            </p>
          ) : !orders || !stocks ? (
            <LoadingBlock title="Загружаю спрос и остатки" height={200} />
          ) : planNeeded.length === 0 ? (
            <p className="text-[15.5px]" style={{ ...hubSans, color: hub.text }}>
              Остатков на складах WB хватает на {coverNum} дн. по всем округам, отгрузка не нужна.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-y-6 border-y py-7" style={{ borderColor: "rgba(1, 20, 8, 0.12)" }}>
                {[
                  { v: `${formatInt(planTotal)} шт.`, l: "всего к отгрузке" },
                  { v: formatInt(planNeeded.length), l: "позиций" },
                  { v: formatInt(new Set(planNeeded.map((r) => r.district)).size), l: "округов" },
                ].map((x, i) => (
                  <div key={x.l} className={cn("pr-4", i > 0 && "border-l pl-7")} style={{ borderColor: "rgba(1, 20, 8, 0.12)" }}>
                    <p className="text-[34px] font-semibold leading-none" style={{ ...MONO, color: hub.text }}>{x.v}</p>
                    <p className="mt-3.5 text-[14.5px]" style={{ ...hubSans, color: hub.textMuted }}>{x.l}</p>
                  </div>
                ))}
              </div>
              {fbsOnly ? (
                <p className="mt-5 text-[14.5px] leading-[1.55]" style={{ ...hubSans, color: hub.textMuted }}>
                  У WB почти нет вашего товара, поэтому план показывает, сколько понадобилось бы для закрытия спроса со складов WB. При работе с FBS это справка.
                </p>
              ) : null}
              <ul>
                {(planAll ? planNeeded.slice(0, 200) : planNeeded.slice(0, PLAN_SHOWN)).map((row) => (
                  <li key={`${row.nmId}-${row.district}`} className={cn("flex flex-wrap items-center gap-x-8 gap-y-3 py-5", ROW)} style={rowStyle}>
                    <Thumb src={photos.get(row.nmId)} />
                    <div className="min-w-[220px] flex-1">
                      <p className="line-clamp-2 text-[16px] font-semibold leading-[1.3] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
                        {titles.get(row.nmId) ?? row.nmId}
                      </p>
                      <p className="mt-2 text-[14px]" style={{ ...hubSans, color: hub.textMuted }}>
                        в округ {row.district} · {row.dailyDemand.toLocaleString("ru-RU")} в день · у вас {formatInt(ownStock.get(row.nmId) ?? 0)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[28px] font-semibold leading-none" style={{ ...MONO, color: hub.text }}>
                        {formatInt(row.need)}
                        <span className="ml-1.5 text-[14px] font-medium" style={{ ...hubSans, letterSpacing: 0, color: hub.textMuted }}>шт.</span>
                      </p>
                      <p className="mt-2.5 text-[13.5px]" style={{ ...hubSans, color: hub.textSubtle }}>отгрузить</p>
                    </div>
                  </li>
                ))}
              </ul>
              {planNeeded.length > PLAN_SHOWN ? (
                <div className="mt-4">
                  <HubButton size="sm" variant="secondary" onClick={() => setPlanAll((v) => !v)}>
                    {planAll ? "Свернуть" : `Показать все (${planNeeded.length})`}
                  </HubButton>
                </div>
              ) : null}
            </>
          )}
        </Card>
      ) : null}
    </div>
  );
}
