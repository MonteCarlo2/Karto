"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Copy, Search, Warehouse, X } from "lucide-react";
import { listSellerHubWarehouses, updateSellerHubStocks } from "@/lib/seller-hub/client-api";
import { STOCK_DAY_CAP, supplyPace, type SupplyPace } from "@/lib/seller-hub/product-signal";
import type { SellerCatalogItem, SellerCatalogSnapshot, SellerFunnelSnapshot, SellerWarehouse } from "@/lib/seller-hub/types";
import { HubToast, useHubToast, type HubToastState } from "./hub-toast";
import {
  formatInt,
  formatSyncTime,
  hub,
  HubButton,
  HubEmptyState,
  HubInput,
  HubPanel,
  hubNumeric,
  hubSans,
} from "./hub-ui";
import { HubProductDrawer } from "./hub-product-drawer";

const PAGE_SIZE = 40;

type StockFilter = "all" | "ship" | "short" | "zero" | "idle";

const STOCK_FILTERS: Array<{ id: StockFilter; label: string }> = [
  { id: "all", label: "Все" },
  { id: "ship", label: "Довезти" },
  { id: "short", label: "Хватит до 14 дн." },
  { id: "zero", label: "Нет в наличии" },
  { id: "idle", label: "Нет темпа" },
];

function wbCardPhoto(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return url.replace("/images/tm/", "/images/c246x328/").replace("/images/c516x688/", "/images/c246x328/");
}

function ordersPerDayOf(item: SellerCatalogItem, funnel: SellerFunnelSnapshot | undefined): number | null {
  if (!funnel || funnel.error) return null;
  const row = funnel.byNm[item.externalId];
  if (row) return row.ordersPerDay;
  if (funnel.truncated) return null;
  return 0;
}

function paceFor(item: SellerCatalogItem, snapshot: SellerCatalogSnapshot | undefined): SupplyPace {
  const realization = snapshot?.realization;
  return supplyPace({
    stock: item.totalStock ?? null,
    ordersPerDay: ordersPerDayOf(item, snapshot?.funnel),
    realization: realization?.byNm[item.externalId],
    reportReady: Boolean(realization && !realization.error),
  });
}

function passesStockFilter(filter: StockFilter, stock: number | null, pace: SupplyPace): boolean {
  switch (filter) {
    case "all":
      return true;
    case "ship":
      return (pace.shipSpan ?? 0) > 0;
    case "short":
      return pace.days != null && pace.days <= 14 && (stock ?? 0) > 0;
    case "zero":
      return stock === 0;
    case "idle":
      return pace.daily == null && (stock ?? 0) > 0;
    default: {
      const unexpected: never = filter;
      return unexpected;
    }
  }
}

function paceSourceLabel(source: SupplyPace["source"]): string | null {
  switch (source) {
    case "orders":
      return "заказы воронки, 28 дней";
    case "sales-recent":
      return "продажи отчёта за 7 дней";
    case "sales-span":
      return "продажи отчёта за 28 дней";
    case null:
      return null;
    default: {
      const unexpected: never = source;
      return unexpected;
    }
  }
}

function coverText(pace: SupplyPace, stock: number | null): string {
  if ((stock ?? 0) <= 0) return "Нет остатка";
  if (pace.days == null) return "Нет темпа";
  if (pace.days > STOCK_DAY_CAP) return `> ${STOCK_DAY_CAP} дн.`;
  return `${formatInt(pace.days)} дн.`;
}

function coverColor(pace: SupplyPace, stock: number | null): string {
  if ((stock ?? 0) <= 0) return hub.danger;
  if (pace.days != null && pace.days <= 14) return hub.danger;
  if (pace.days == null) return hub.textMuted;
  return hub.text;
}

function formatDaily(daily: number): string {
  return daily.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
}

function Horizon({ use, ship }: { use: number | null; ship: number | null }) {
  if (use == null || ship == null) {
    return <span style={{ color: hub.textSubtle }}>—</span>;
  }
  const pieces = Math.max(0, Math.ceil(use - 1e-9));
  if (ship > 0) {
    return (
      <span className="text-[15px] font-semibold" style={{ color: hub.ink }}>
        довези {formatInt(ship)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 text-[15px] font-semibold" style={{ color: hub.text }} title="хватает">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: "#3C9A32" }} aria-hidden />
      {formatInt(pieces)} шт
    </span>
  );
}

function StockSplit({ fbo, fbs }: { fbo: number | null; fbs: number | null }) {
  if (fbo == null && fbs == null) {
    return <span style={{ color: hub.textSubtle }}>—</span>;
  }
  const fboN = fbo ?? 0;
  const fbsN = fbs ?? 0;
  const total = fboN + fbsN;
  const fboPct = total > 0 ? (fboN / total) * 100 : 0;
  return (
    <div className="min-w-[124px]">
      <p className="text-[16px] font-semibold" style={{ ...hubNumeric, color: hub.text }}>
        {formatInt(total)}
      </p>
      <div className="mt-1 flex h-2 w-full overflow-hidden rounded-full bg-black/[0.08]" aria-hidden>
        {fboN > 0 ? (
          <span className="h-full" style={{ width: `${fboPct}%`, backgroundColor: hub.lime, minWidth: fbsN > 0 ? 4 : undefined }} />
        ) : null}
        {fbsN > 0 ? (
          <span className="h-full" style={{ width: `${100 - fboPct}%`, backgroundColor: hub.blue, minWidth: fboN > 0 ? 4 : undefined }} />
        ) : null}
      </div>
      <p className="mt-1 text-[12px] font-medium" style={{ ...hubSans }}>
        <span style={{ color: "#3C9A32" }}>FBO {fbo == null ? "—" : formatInt(fboN)}</span>
        <span style={{ color: hub.textSubtle }}> · </span>
        <span style={{ color: hub.blue }}>FBS {fbs == null ? "—" : formatInt(fbsN)}</span>
      </p>
    </div>
  );
}

function CopyArticle({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label="Скопировать артикул"
      className={`ml-1 inline-flex rounded-[4px] p-0.5 align-middle transition-opacity hover:bg-black/[0.05] focus-visible:opacity-100 ${
        done ? "opacity-100" : "opacity-0 group-hover:opacity-100"
      }`}
      onClick={(event) => {
        event.stopPropagation();
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          window.setTimeout(() => setDone(false), 1400);
        });
      }}
    >
      {done ? <Check className="h-3.5 w-3.5" style={{ color: hub.green }} /> : <Copy className="h-3.5 w-3.5" style={{ color: hub.textSubtle }} />}
    </button>
  );
}

export function HubStocks({
  snapshot,
  connected,
  onUpdate,
}: {
  snapshot?: SellerCatalogSnapshot;
  connected?: boolean;
  onUpdate?: (items: SellerCatalogItem[]) => void;
  onAsk?: (prompt: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StockFilter>("all");
  const [page, setPage] = useState(0);
  const [selectedItem, setSelectedItem] = useState<SellerCatalogItem | null>(null);
  const [editing, setEditing] = useState(false);
  const [fbsDrafts, setFbsDrafts] = useState<Record<string, string>>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [warehouses, setWarehouses] = useState<SellerWarehouse[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | undefined>();
  const [toast, setToast] = useState<HubToastState | null>(null);
  const { makeToast } = useHubToast();
  const items = useMemo(() => snapshot?.items ?? [], [snapshot]);

  useEffect(() => {
    if (!connected) return;
    void listSellerHubWarehouses().then((result) => {
      if (!result.ok || !result.warehouses?.length) return;
      setWarehouses(result.warehouses);
      setSelectedWarehouseId((prev) => prev ?? result.warehouses![0].id);
    });
  }, [connected]);

  const paces = useMemo(() => {
    const map = new Map<string, SupplyPace>();
    for (const item of items) map.set(item.id, paceFor(item, snapshot));
    return map;
  }, [items, snapshot]);

  const counts = useMemo(() => {
    const next = Object.fromEntries(STOCK_FILTERS.map((option) => [option.id, 0])) as Record<StockFilter, number>;
    next.all = items.length;
    for (const item of items) {
      const pace = paces.get(item.id);
      if (!pace) continue;
      for (const option of STOCK_FILTERS) {
        if (option.id === "all") continue;
        if (passesStockFilter(option.id, item.totalStock ?? null, pace)) next[option.id] += 1;
      }
    }
    return next;
  }, [items, paces]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((item) => {
        if (q) {
          const hay = `${item.title} ${item.vendorCode} ${item.externalId} ${item.barcode ?? ""}`;
          if (!hay.toLowerCase().includes(q)) return false;
        }
        const pace = paces.get(item.id);
        if (!pace) return false;
        return passesStockFilter(filter, item.totalStock ?? null, pace);
      })
      .sort((a, b) => {
        const stockA = a.totalStock ?? 0;
        const stockB = b.totalStock ?? 0;
        if (stockA === 0 && stockB !== 0) return -1;
        if (stockB === 0 && stockA !== 0) return 1;
        const daysA = paces.get(a.id)?.days ?? Number.MAX_SAFE_INTEGER;
        const daysB = paces.get(b.id)?.days ?? Number.MAX_SAFE_INTEGER;
        return daysA - daysB;
      });
  }, [items, search, filter, paces]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = visible.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const beginEdit = useCallback(() => {
    if (!connected) return;
    const next: Record<string, string> = {};
    for (const item of items) {
      next[item.id] = item.stockFbs != null ? String(item.stockFbs) : "0";
    }
    setFbsDrafts(next);
    setEditing(true);
  }, [connected, items]);

  const discardEdit = useCallback(() => {
    setEditing(false);
    setFbsDrafts({});
  }, []);

  const saveEdits = useCallback(async () => {
    if (!connected) return;
    if (!selectedWarehouseId && warehouses.length === 0) {
      setToast(
        makeToast(
          "Не найден склад FBS. Проверьте категорию «Маркетплейс» в токене и создайте склад в кабинете WB.",
          "error",
        ),
      );
      return;
    }

    const changed = items.filter((item) => {
      const raw = fbsDrafts[item.id];
      if (raw == null) return false;
      const amount = Number(raw);
      return Number.isFinite(amount) && amount >= 0 && amount !== (item.stockFbs ?? null);
    });
    if (changed.length === 0) {
      discardEdit();
      return;
    }
    const invalid = changed.find((item) => !Number.isFinite(Number(item.externalId)));
    if (invalid) {
      setToast(makeToast(`Некорректный nmID у ${invalid.vendorCode}`, "error"));
      return;
    }
    if (changed.some((item) => (item.chrtIds?.length ?? item.skus?.length ?? item.sizesCount ?? 1) > 1)) {
      setToast(makeToast("У части товаров несколько размеров: одно число запишется на каждый размер.", "warn"));
    }

    const updates: { nmId?: number; chrtId?: number; amount: number }[] = [];
    for (const item of changed) {
      const amount = Number(fbsDrafts[item.id]);
      if (item.chrtIds && item.chrtIds.length > 0) {
        for (const chrtId of item.chrtIds) updates.push({ chrtId, amount });
      } else {
        updates.push({ nmId: Number(item.externalId), amount });
      }
    }

    setSavingEdit(true);
    try {
      const result = await updateSellerHubStocks({
        warehouseId: selectedWarehouseId,
        updates,
      });
      if (!result.ok || result.verified !== true) {
        setToast(
          makeToast(
            result.error ?? result.errors?.join("; ") ?? "Остаток на Wildberries не изменился",
            "error",
          ),
        );
        return;
      }
      if (result.warehouses && result.warehouses.length > 0) {
        setWarehouses(result.warehouses);
        setSelectedWarehouseId((current) => current ?? result.warehouses![0].id);
      }
      const amounts = new Map(changed.map((item) => [item.id, Number(fbsDrafts[item.id])]));
      onUpdate?.(
        items.map((item) => {
          const next = amounts.get(item.id);
          if (next == null) return item;
          return { ...item, stockFbs: next, totalStock: (item.stockFbo ?? 0) + next };
        }),
      );
      setToast(makeToast("Остаток FBS записан в Wildberries", "ok"));
      discardEdit();
    } catch (err) {
      setToast(makeToast(err instanceof Error ? err.message : "Ошибка при сохранении", "error"));
    } finally {
      setSavingEdit(false);
    }
  }, [connected, discardEdit, fbsDrafts, items, makeToast, onUpdate, selectedWarehouseId, warehouses.length]);

  if (items.length === 0) {
    return (
      <HubPanel className="flex min-h-[420px] flex-col rounded-md">
        <HubEmptyState
          icon={<Warehouse className="h-7 w-7" />}
          title="Остатки пока не загружены"
          description="Выгрузите каталог — KARTO подтянет остатки FBO (склады WB) и FBS (ваши склады)."
        />
      </HubPanel>
    );
  }

  const units = items.reduce((sum, item) => sum + (item.totalStock ?? 0), 0);
  const waitingReport = !snapshot?.funnel && !snapshot?.realization;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-baseline gap-2 rounded-full bg-white px-4 py-2 text-[14px]" style={{ color: hub.textSubtle }}>
          SKU <span className="text-[18px] font-semibold tabular-nums" style={{ color: hub.text }}>{formatInt(items.length)}</span>
        </span>
        <span className="inline-flex items-baseline gap-2 rounded-full bg-white px-4 py-2 text-[14px]" style={{ color: hub.textSubtle }}>
          Штук <span className="text-[18px] font-semibold tabular-nums" style={{ color: hub.text }}>{formatInt(units)}</span>
        </span>
        <span className="inline-flex items-baseline gap-2 rounded-full bg-white px-4 py-2 text-[14px]" style={{ color: hub.textSubtle }}>
          Довезти <span className="text-[18px] font-semibold tabular-nums" style={{ color: hub.text }}>{formatInt(counts.ship)}</span>
        </span>
        <span className="inline-flex items-baseline gap-2 rounded-full bg-white px-4 py-2 text-[14px]" style={{ color: hub.textSubtle }}>
          Обнулено <span className="text-[18px] font-semibold tabular-nums" style={{ color: counts.zero > 0 ? hub.danger : hub.text }}>{formatInt(counts.zero)}</span>
        </span>
      </div>
      <HubPanel className="rounded-md">
        <div className="border-b px-5 py-5 sm:px-6" style={{ borderColor: hub.borderSoft }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="inline-flex items-center gap-2 text-[28px] font-semibold leading-tight tracking-[-0.03em]" style={{ ...hubSans, color: hub.text }}>
              Остатки
              <button
                type="button"
                aria-label="Как считается"
                title="Темп — заказы за 28 дней. Если заказов не было, беру продажи отчёта. Штуки на 7 и 28 дней округлены вверх. Довезти — сколько целых штук не хватает."
                className="inline-flex h-7 w-7 items-center justify-center rounded-full outline-none hover:bg-black/[0.05] focus-visible:ring-2 focus-visible:ring-[#1F4E3D]"
                style={{ color: hub.textMuted }}
              >
                <CircleHelp className="h-4 w-4" />
              </button>
            </h2>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[13px]" style={{ ...hubSans, color: hub.textMuted }}>
                {formatSyncTime(snapshot?.syncedAt)}
              </span>
              {editing ? (
                <>
                  <button
                    type="button"
                    disabled={savingEdit}
                    onClick={() => void saveEdits()}
                    className="inline-flex h-[42px] items-center rounded-[11px] bg-[#B9FF4B] px-4 text-[14px] font-semibold text-[#0E1116] outline-none hover:bg-[#C6FF68] disabled:opacity-45"
                    style={hubSans}
                  >
                    {savingEdit ? "Сохраняю" : "Сохранить"}
                  </button>
                  <button
                    type="button"
                    disabled={savingEdit}
                    onClick={discardEdit}
                    className="inline-flex h-[42px] items-center rounded-[11px] border-2 bg-white px-4 text-[14px] font-semibold outline-none hover:bg-[#F4F6F8] disabled:opacity-45"
                    style={{ ...hubSans, borderColor: hub.ink, color: hub.ink }}
                  >
                    Не сохранять
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={!connected}
                  onClick={beginEdit}
                  title={connected ? "Изменить остаток FBS и записать его в Wildberries" : "Подключите кабинет"}
                  className="inline-flex h-[42px] items-center rounded-[11px] border-2 bg-white px-4 text-[14px] font-semibold outline-none hover:bg-[#F4F6F8] disabled:cursor-not-allowed disabled:opacity-45"
                  style={{ ...hubSans, borderColor: hub.ink, color: hub.ink }}
                >
                  Редактировать
                </button>
              )}
            </div>
          </div>
          <div className="mt-4 max-w-md">
            {warehouses.length > 0 ? (
              <div className="relative">
                <Warehouse
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                  style={{ color: hub.textMuted }}
                />
                <select
                  id="fbs-warehouse"
                  aria-label="Склад FBS"
                  value={selectedWarehouseId ?? warehouses[0]?.id ?? ""}
                  onChange={(e) => setSelectedWarehouseId(e.target.value ? Number(e.target.value) : undefined)}
                  className="h-12 w-full cursor-pointer appearance-none rounded-[12px] border bg-white pl-10 pr-8 text-[16px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[#1F4E3D]"
                  style={{ borderColor: hub.border, color: hub.text, ...hubSans }}
                >
                  {warehouses.map((wh) => (
                    <option key={wh.id} value={wh.id}>
                      {wh.name}
                      {wh.city ? `, ${wh.city}` : ""}
                      {" · FBS"}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2"
                  style={{ color: hub.textMuted }}
                />
              </div>
            ) : (
              <p className="text-[15px]" style={{ ...hubSans, color: hub.textMuted }}>
                {connected ? "Склад FBS в токене не найден." : "Подключите кабинет, чтобы выбрать склад FBS."}
              </p>
            )}
          </div>
        </div>

        <div
          className="flex flex-wrap items-center gap-3 border-b px-5 py-3 sm:px-6"
          style={{ borderColor: hub.borderSoft }}
        >
          <div className="relative min-w-[220px] flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
              style={{ color: hub.textSubtle }}
            />
            <HubInput
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder="Найти товар: название, артикул, штрихкод"
              className="pl-9 pr-10"
              aria-label="Поиск по остаткам"
            />
            {search ? (
              <button
                type="button"
                aria-label="Очистить поиск"
                className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full outline-none hover:bg-black/[0.05] focus-visible:ring-2 focus-visible:ring-[#1F4E3D]"
                style={{ color: hub.textMuted }}
                onClick={() => {
                  setSearch("");
                  setPage(0);
                }}
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Фильтры остатков">
            {STOCK_FILTERS.map((option) => {
              const active = filter === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    setFilter(option.id);
                    setPage(0);
                  }}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-[11px] border bg-white px-3.5 text-[14px] outline-none transition hover:bg-[#F4F6F8] focus-visible:ring-2 focus-visible:ring-[#1F4E3D]"
                  style={{
                    ...hubSans,
                    borderColor: active ? hub.ink : hub.border,
                    borderWidth: active ? 2 : 1,
                    color: active ? hub.ink : hub.textMuted,
                    fontWeight: active ? 600 : 500,
                  }}
                >
                  {option.label}
                  <span className="tabular-nums" style={{ ...hubNumeric, color: active ? hub.ink : hub.textSubtle }}>
                    {formatInt(counts[option.id])}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left">
            <thead className="sticky top-0 z-10" style={{ backgroundColor: hub.surfaceMuted }}>
              <tr>
                {["Товар", "Артикул", "FBO", "FBS", "Всего", "Заказано, 28 дн.", "Темп", "Хватит", "На 7 дней", "На 28 дней"].map((label) => (
                  <th
                    key={label}
                    className="border-b px-5 py-3.5 text-[14px] font-semibold sm:px-6"
                    style={{ ...hubSans, color: hub.textMuted, borderColor: hub.borderSoft }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((item) => {
                const pace = paces.get(item.id) ?? paceFor(item, snapshot);
                const source = paceSourceLabel(pace.source);
                const idle = pace.daily == null
                  ? waitingReport
                    ? "Жду отчёт кабинета"
                    : "Заказов и продаж за 28 дней не было"
                  : null;
                const funnel = snapshot?.funnel;
                const funnelRow = funnel && !funnel.error ? funnel.byNm[item.externalId] : undefined;
                const ordersKnown = Boolean(funnelRow) || Boolean(funnel && !funnel.error && !funnel.truncated);
                const orders = funnelRow ? funnelRow.orders : ordersKnown ? 0 : null;
                const report = snapshot?.realization;
                const soldRow = report && !report.error ? report.byNm[item.externalId] : undefined;
                const soldQty = report && !report.error ? (soldRow?.qty ?? 0) : null;
                const soldRecent = soldRow?.recentQty;

                return (
                  <tr
                    key={item.id}
                    className="group cursor-pointer border-b transition-colors duration-150 hover:bg-[#1C1915]/[0.04]"
                    style={{ borderColor: hub.borderSoft }}
                    onClick={() => {
                      if (!editing) setSelectedItem(item);
                    }}
                  >
                    <td className="px-5 py-3 sm:px-6">
                      <div className="flex min-w-[280px] max-w-[420px] items-center gap-3">
                        <span
                          className="flex h-[75px] w-[56px] shrink-0 items-center justify-center overflow-hidden bg-[#F4F6F8]"
                          style={{ boxShadow: `inset 0 0 0 1px ${hub.border}` }}
                        >
                          {wbCardPhoto(item.imageUrl) ? (
                            <img src={wbCardPhoto(item.imageUrl)} alt="" className="max-h-full max-w-full object-contain" />
                          ) : (
                            <span className="text-[12px]" style={{ color: hub.textSubtle }}>нет фото</span>
                          )}
                        </span>
                        <span className="text-[16px] font-semibold leading-snug" style={{ color: hub.text }} title={item.title}>
                          {item.title}
                        </span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-2 py-3">
                      <span className="inline-flex items-center font-mono text-[12px]" style={{ color: hub.textSubtle }}>
                        {item.vendorCode}
                        <CopyArticle text={item.vendorCode} />
                      </span>
                    </td>
                    <td
                      className="whitespace-nowrap px-5 py-3 text-[16px] font-semibold sm:px-6"
                      style={{ ...hubSans, ...hubNumeric, color: hub.text }}
                      title="Остаток FBO меняется поставкой на склад WB"
                    >
                      {item.stockFbo != null ? formatInt(item.stockFbo) : "—"}
                    </td>
                    <td
                      className="whitespace-nowrap px-5 py-3 text-[16px] font-semibold sm:px-6"
                      style={{ ...hubSans, ...hubNumeric, color: hub.text }}
                      onClick={(event) => event.stopPropagation()}
                    >
                      {editing ? (
                        <input
                          type="number"
                          min={0}
                          aria-label={`Остаток FBS ${item.vendorCode}`}
                          value={fbsDrafts[item.id] ?? ""}
                          onChange={(event) => {
                            const value = event.target.value;
                            setFbsDrafts((current) => ({ ...current, [item.id]: value }));
                          }}
                          className="h-10 w-24 rounded-[10px] border-2 px-2 text-[16px] font-semibold outline-none"
                          style={{ borderColor: hub.ink, backgroundColor: hub.inputBg, color: hub.text, ...hubSans }}
                        />
                      ) : (
                        <span>{item.stockFbs != null ? formatInt(item.stockFbs) : "—"}</span>
                      )}
                    </td>
                    <td className="px-5 py-3 sm:px-6">
                      <StockSplit
                        fbo={item.stockFbo ?? null}
                        fbs={
                          editing
                            ? Number.isFinite(Number(fbsDrafts[item.id]))
                              ? Number(fbsDrafts[item.id])
                              : null
                            : (item.stockFbs ?? null)
                        }
                      />
                    </td>
                    <td className="min-w-[196px] px-4 py-3 sm:px-5">
                      <span className="flex flex-col items-start">
                        <span className="text-[22px] font-semibold leading-none" style={{ ...hubSans, ...hubNumeric, color: hub.text }}>
                          {orders == null ? "—" : formatInt(orders)}
                        </span>
                        <span className="mt-1.5 whitespace-nowrap text-[13px] leading-4" style={{ ...hubSans, color: hub.textMuted }}>
                          {orders == null ? "воронка не прочитана" : "за 28 дней"}
                        </span>
                        {soldQty != null ? (
                          <span className="whitespace-nowrap text-[13px] leading-4" style={{ ...hubSans, color: hub.textMuted }}>
                            продано {formatInt(soldQty)}
                            {soldRecent != null ? ` · 7 дн. ${formatInt(soldRecent)}` : ""}
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td className="min-w-[160px] px-5 py-3 sm:px-6">
                      {pace.daily != null ? (
                        <span className="flex flex-col items-start gap-0.5">
                          <span className="text-[16px] font-semibold" style={{ ...hubSans, ...hubNumeric, color: hub.text }}>
                            {formatDaily(pace.daily)} шт/день
                          </span>
                          {source ? (
                            <span className="text-[13px]" style={{ ...hubSans, color: hub.textMuted }}>{source}</span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-[14px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>{idle}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-[16px] font-semibold sm:px-6" style={{ ...hubSans, ...hubNumeric, color: coverColor(pace, item.totalStock ?? null) }}>
                      {coverText(pace, item.totalStock ?? null)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-[16px] font-semibold sm:px-6" style={{ ...hubSans, ...hubNumeric, color: hub.text }}>
                      <Horizon use={pace.weekUse} ship={pace.shipWeek} />
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-[16px] font-semibold sm:px-6" style={{ ...hubSans, ...hubNumeric, color: hub.text }}>
                      <Horizon use={pace.spanUse} ship={pace.shipSpan} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visible.length === 0 ? (
            <p className="px-6 py-14 text-center text-[15px]" style={{ ...hubSans, color: hub.textMuted }}>
              По текущему фильтру товаров нет.
            </p>
          ) : null}
        </div>

        <div
          className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3 sm:px-6"
          style={{ borderColor: hub.borderSoft }}
        >
          <p className="text-[14px]" style={{ ...hubSans, color: hub.textMuted }}>
            Показано {formatInt(pageRows.length)} из {formatInt(visible.length)} · всего {formatInt(items.length)}
          </p>
          {pageCount > 1 ? (
            <div className="flex items-center gap-2">
              <HubButton
                variant="secondary"
                size="sm"
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                disabled={safePage === 0}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Назад
              </HubButton>
              <span className="text-[14px] font-semibold" style={{ ...hubSans, ...hubNumeric, color: hub.textMuted }}>
                {safePage + 1} / {pageCount}
              </span>
              <HubButton
                variant="secondary"
                size="sm"
                onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
                disabled={safePage >= pageCount - 1}
              >
                Вперёд
                <ChevronRight className="h-3.5 w-3.5" />
              </HubButton>
            </div>
          ) : null}
        </div>
      </HubPanel>

      {selectedItem ? (
        <HubProductDrawer
          item={selectedItem}
          promotions={snapshot?.promotions}
          connected={connected}
          onPatched={(patch) => {
            onUpdate?.(items.map((row) => (row.id === patch.id ? { ...row, ...patch } : row)));
            setSelectedItem((current) => (current && current.id === patch.id ? { ...current, ...patch } : current));
          }}
          onClose={() => setSelectedItem(null)}
        />
      ) : null}

      {toast ? <HubToast toast={toast} onDismiss={() => setToast(null)} /> : null}
    </div>
  );
}
