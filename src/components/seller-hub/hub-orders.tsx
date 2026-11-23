"use client";

import { usePagedLimit } from "./use-paged-limit";
import { useCallback, useMemo, useState } from "react";
import { Check, Copy, Download, Package, QrCode, ShoppingCart } from "lucide-react";
import { manageSellerHubSupply } from "@/lib/seller-hub/client-api";
import { FBS_ORDERS_WINDOW_DAYS } from "@/lib/seller-hub/orders-window";
import { SUPPLY_WRITE_ENABLED } from "@/lib/seller-hub/feature-flags";
import { canCancelFbsOrder, openFbsSupplies, waitingHours } from "@/lib/seller-hub/fbs-actions";
import { snapshotTimeMs } from "@/lib/seller-hub/complete-days";
import type { SellerCatalogSnapshot, SellerOrderRow } from "@/lib/seller-hub/types";
import {
  formatInt,
  formatRub,
  formatSyncTime,
  hub,
  HubBadge,
  HubButton,
  HubEmptyState,
  HubInput,
  hubNumeric,
  hubSans,
} from "./hub-ui";
import { HubPanel, HubPanelHeader, StatusDot, StatusStrip, Thumb } from "./hub-fulfillment-ui";
import { Segmented } from "./hub-analytics-ui";
import { HubToast, useHubToast, type HubToastState } from "./hub-toast";
import { HubOrdersInsights } from "./hub-orders-insights";
import { downloadBase64File, downloadCsv } from "./download-file";
import { HubOrdersProducts } from "./hub-orders-products";

const STATUS_COLOR: Record<string, string> = {
  Новый: "#4F5BEA",
  "На сборке": "#F59E0B",
  "В доставке": "#7C8A82",
  Выкуплено: "#3B4248",
  Отменён: "#C2413A",
};

const SUPPLIER_LABEL: Record<string, string> = {
  new: "Новый",
  confirm: "На сборке",
  complete: "В доставке",
  cancel: "Отменён",
  cancel_carrier: "Отменён перевозчиком",
};

const WB_LABEL: Record<string, string> = {
  waiting: "Ожидает",
  sorted: "Сортируется на складе",
  sold: "Выкуплено",
  ready_for_pickup: "На ПВЗ",
  canceled: "Отменён",
  canceled_by_client: "Отменён покупателем",
  declined_by_client: "Отменён в первый час",
};

function isOrderCanceled(row: SellerOrderRow): boolean {
  const supplier = row.supplierStatus ?? "";
  const wb = row.wbStatus ?? "";
  return (
    supplier === "cancel" ||
    supplier === "cancel_carrier" ||
    wb.startsWith("cancel") ||
    wb === "declined_by_client"
  );
}

function statusBadge(row: SellerOrderRow) {
  const supplier = row.supplierStatus ?? "";
  const wb = row.wbStatus ?? "";
  if (isOrderCanceled(row)) return { tone: "danger" as const, label: "Отменён" };
  if (wb === "sold") return { tone: "ok" as const, label: "Выкуплено" };
  if (supplier === "complete") return { tone: "accent" as const, label: "В доставке" };
  if (supplier === "confirm") return { tone: "warn" as const, label: "На сборке" };
  return { tone: "accent" as const, label: "Новый" };
}

/** Только новые сборочные задания можно добавить в поставку. */
function canAddToSupply(row: SellerOrderRow): boolean {
  const supplier = row.supplierStatus ?? "";
  const wb = row.wbStatus ?? "";
  if (isOrderCanceled(row)) return false;
  if (wb === "sold") return false;
  if (supplier === "complete" || wb === "sorted" || wb === "ready_for_pickup") return false;
  if (supplier === "confirm") return false;
  return supplier === "" || supplier === "new";
}

function isNewOrder(row: SellerOrderRow): boolean {
  if (isOrderCanceled(row)) return false;
  const supplier = row.supplierStatus ?? "";
  return supplier === "" || supplier === "new";
}

/** Один форматтер на все заказы: создавать его на каждый заказ медленно при тысячах строк. */
const DAY_KEY_FMT = new Intl.DateTimeFormat("sv-SE");

export function HubOrders({
  snapshot,
  connected,
  onSupplyCreated,
}: {
  snapshot?: SellerCatalogSnapshot;
  connected?: boolean;
  onSupplyCreated?: (supplyId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "new" | "assembly" | "delivery" | "done" | "cancel">("all");
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<number>>(new Set());
  const [creatingSupply, setCreatingSupply] = useState(false);
  const [closingSupply, setClosingSupply] = useState(false);
  const [downloadingStickers, setDownloadingStickers] = useState(false);
  const [downloadingQr, setDownloadingQr] = useState(false);
  const [lastSupplyId, setLastSupplyId] = useState<string | null>(null);
  const [lastSupplyOrderIds, setLastSupplyOrderIds] = useState<number[]>([]);
  const [supplyDelivered, setSupplyDelivered] = useState(false);
  const [copiedSupplyId, setCopiedSupplyId] = useState(false);
  const [toast, setToast] = useState<HubToastState | null>(null);
  /** "new" — создать новую поставку, иначе ID открытой поставки, в которую добавляем. */
  const [targetSupply, setTargetSupply] = useState<string>("new");
  const [view, setView] = useState<"orders" | "overview">("orders");
  const paged = usePagedLimit(`${filter}|${search}`);
  const [confirmCancelId, setConfirmCancelId] = useState<number | null>(null);
  const [cancelingId, setCancelingId] = useState<number | null>(null);
  const [canceledIds, setCanceledIds] = useState<Set<number>>(new Set());
  const { makeToast } = useHubToast();
  /** Сборка поставок, QR, стикеры и отмена скрыты решением владельца (см. feature-flags.ts): это делают в кабинете WB. */
  const writable = Boolean(connected) && SUPPLY_WRITE_ENABLED;

  const orders = snapshot?.orders;
  const openSupplies = useMemo(() => openFbsSupplies(snapshot?.supplies?.supplies), [snapshot?.supplies]);
  const targetOpen = targetSupply !== "new" && openSupplies.some((s) => s.id === targetSupply);
  const nowMs = snapshotTimeMs(snapshot);
  const rows = useMemo(() => orders?.orders ?? [], [orders]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (q) {
        const hay = `${row.externalId} ${row.article ?? ""} ${row.nmId ?? ""}`;
        if (!hay.toLowerCase().includes(q)) return false;
      }
      const supplier = row.supplierStatus ?? "";
      const wb = row.wbStatus ?? "";
      if (filter === "new") return isNewOrder(row);
      if (filter === "assembly") return supplier === "confirm";
      if (filter === "delivery") return supplier === "complete" || wb === "sorted" || wb === "ready_for_pickup";
      if (filter === "done") return wb === "sold";
      if (filter === "cancel") return isOrderCanceled(row);
      return true;
    });
  }, [rows, search, filter]);

  const eligibleVisible = useMemo(() => visible.filter(canAddToSupply), [visible]);

  const productMeta = useMemo(() => new Map((snapshot?.items ?? []).map((i) => [i.externalId, { title: i.title || i.vendorCode || undefined, photo: i.imageUrl ?? undefined }])), [snapshot?.items]);

  /** Заказы по дням: «Сегодня», «Вчера», дальше дата; в заголовке число заказов и сумма. */
  const dayGroups = useMemo(() => {
    const keyOf = (iso?: string) => (iso ? DAY_KEY_FMT.format(new Date(iso)) : "none");
    const todayKey = DAY_KEY_FMT.format(new Date(nowMs > 0 ? nowMs : Date.now()));
    const yesterdayKey = DAY_KEY_FMT.format(new Date((nowMs > 0 ? nowMs : Date.now()) - 86_400_000));
    const groups = new Map<string, { key: string; label: string; rows: SellerOrderRow[]; sum: number }>();
    for (const row of visible) {
      const key = keyOf(row.createdAt);
      const g = groups.get(key) ?? { key, label: key === todayKey ? "Сегодня" : key === yesterdayKey ? "Вчера" : key === "none" ? "Без даты" : new Date(`${key}T12:00:00`).toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" }), rows: [], sum: 0 };
      g.rows.push(row);
      g.sum += row.price ?? 0;
      groups.set(key, g);
    }
    return [...groups.values()];
  }, [visible, nowMs]);

  /** Строки, которые реально рисуем: заголовок дня показывает честные итоги по всем заказам дня, а строк пока первые. */
  const pagedGroups = useMemo(() => {
    let left = paged.limit;
    const out: Array<(typeof dayGroups)[number] & { shown: SellerOrderRow[] }> = [];
    for (const g of dayGroups) {
      if (left <= 0) break;
      const shown = g.rows.slice(0, left);
      left -= shown.length;
      out.push({ ...g, shown });
    }
    return out;
  }, [dayGroups, paged.limit]);
  const hiddenOrders = Math.max(0, visible.length - paged.limit);

  const counts = useMemo(() => {
    const c = { all: rows.length, new: 0, assembly: 0, delivery: 0, done: 0, cancel: 0 };
    for (const row of rows) {
      const supplier = row.supplierStatus ?? "";
      const wb = row.wbStatus ?? "";
      if (isNewOrder(row)) c.new += 1;
      if (supplier === "confirm") c.assembly += 1;
      if (supplier === "complete" || wb === "sorted" || wb === "ready_for_pickup") c.delivery += 1;
      if (wb === "sold") c.done += 1;
      if (isOrderCanceled(row)) c.cancel += 1;
    }
    return c;
  }, [rows]);

  const toggleOrder = useCallback((orderId: number) => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    const eligibleIds = eligibleVisible.map((r) => r.externalId);
    const allSelected = eligibleIds.length > 0 && eligibleIds.every((id) => selectedOrderIds.has(id));
    if (allSelected) {
      setSelectedOrderIds((prev) => {
        const next = new Set(prev);
        eligibleIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedOrderIds((prev) => {
        const next = new Set(prev);
        eligibleIds.forEach((id) => next.add(id));
        return next;
      });
    }
  }, [eligibleVisible, selectedOrderIds]);

  const handleCreateSupply = useCallback(async () => {
    if (!connected || selectedOrderIds.size === 0) return;
    const orderIds = Array.from(selectedOrderIds);
    setCreatingSupply(true);
    try {
      let supplyId: string;
      if (targetOpen) {
        supplyId = targetSupply;
      } else {
        const createResult = await manageSellerHubSupply({
          action: "create",
          supplyName: `Поставка ${new Date().toLocaleDateString("ru-RU")}`,
        });

        if (!createResult.ok || !createResult.supplyId) {
          setToast(makeToast(createResult.error ?? "Не удалось создать поставку", "error"));
          return;
        }
        supplyId = createResult.supplyId;
      }

      const addResult = await manageSellerHubSupply({
        action: "add_orders",
        supplyId,
        orderIds,
      });

      if (!addResult.ok) {
        setToast(makeToast(addResult.error ?? "Поставка создана, но не удалось добавить заказы", "warn"));
      } else {
        setToast(
          makeToast(
            targetOpen ? `В поставку ${supplyId} добавлено заказов: ${orderIds.length}` : `Поставка ${supplyId} создана с ${orderIds.length} заказами`,
            "ok",
          ),
        );
      }

      setLastSupplyId(supplyId);
      setLastSupplyOrderIds(orderIds);
      setSupplyDelivered(false);
      setSelectedOrderIds(new Set());
      onSupplyCreated?.(supplyId);
    } catch (err) {
      setToast(
        makeToast(err instanceof Error ? err.message : "Ошибка при создании поставки", "error")
      );
    } finally {
      setCreatingSupply(false);
    }
  }, [connected, selectedOrderIds, makeToast, onSupplyCreated, targetOpen, targetSupply]);

  const handleCancelOrder = useCallback(
    async (orderId: number) => {
      if (!connected) return;
      setCancelingId(orderId);
      try {
        const result = await manageSellerHubSupply({ action: "cancel", orderId });
        if (!result.ok) {
          setToast(makeToast(result.error ?? "Не удалось отменить заказ", "error"));
          return;
        }
        setCanceledIds((prev) => new Set(prev).add(orderId));
        setSelectedOrderIds((prev) => {
          const next = new Set(prev);
          next.delete(orderId);
          return next;
        });
        setToast(makeToast(`Заказ ${orderId} отменён`, "ok"));
      } catch (err) {
        setToast(makeToast(err instanceof Error ? err.message : "Ошибка при отмене заказа", "error"));
      } finally {
        setCancelingId(null);
        setConfirmCancelId(null);
      }
    },
    [connected, makeToast],
  );

  const handleCloseSupply = useCallback(async () => {
    if (!connected || !lastSupplyId) return;
    setClosingSupply(true);
    try {
      const result = await manageSellerHubSupply({
        action: "close",
        supplyId: lastSupplyId,
      });

      if (!result.ok) {
        setToast(makeToast(result.error ?? "Не удалось передать поставку в доставку", "error"));
        return;
      }

      setSupplyDelivered(true);
      setToast(makeToast(`Поставка ${lastSupplyId} передана в доставку. Теперь можно скачать QR.`, "ok"));
    } catch (err) {
      setToast(
        makeToast(err instanceof Error ? err.message : "Ошибка при закрытии поставки", "error")
      );
    } finally {
      setClosingSupply(false);
    }
  }, [connected, lastSupplyId, makeToast]);

  const handleDownloadStickers = useCallback(async () => {
    if (!connected || lastSupplyOrderIds.length === 0) return;
    setDownloadingStickers(true);
    try {
      const result = await manageSellerHubSupply({
        action: "stickers",
        orderIds: lastSupplyOrderIds,
        stickerType: "png",
      });

      if (!result.ok) {
        setToast(makeToast(result.error ?? "Не удалось получить стикеры", "error"));
        return;
      }

      const stickers = result.stickers ?? [];
      const withFile = stickers.filter((s) => s.fileBase64);
      if (withFile.length === 0) {
        setToast(makeToast("WB не вернул файлы стикеров. Проверьте статус заказов.", "warn"));
        return;
      }

      for (const sticker of withFile) {
        downloadBase64File(
          sticker.fileBase64!,
          `sticker-${sticker.orderId}.png`,
          "image/png"
        );
      }
      setToast(makeToast(`Скачано стикеров: ${withFile.length}`, "ok"));
    } catch (err) {
      setToast(
        makeToast(err instanceof Error ? err.message : "Ошибка при скачивании стикеров", "error")
      );
    } finally {
      setDownloadingStickers(false);
    }
  }, [connected, lastSupplyOrderIds, makeToast]);

  const handleDownloadQr = useCallback(async () => {
    if (!connected || !lastSupplyId) return;
    setDownloadingQr(true);
    try {
      const result = await manageSellerHubSupply({
        action: "barcode",
        supplyId: lastSupplyId,
        stickerType: "png",
      });

      if (!result.ok) {
        setToast(
          makeToast(
            result.error ??
              "QR недоступен. Сначала передайте поставку в доставку — как в кабинете WB.",
            "warn"
          )
        );
        return;
      }

      if (!result.barcode?.fileBase64) {
        setToast(makeToast("WB не вернул QR-код поставки", "warn"));
        return;
      }

      downloadBase64File(result.barcode.fileBase64, `supply-${lastSupplyId}-qr.png`, "image/png");
      setToast(makeToast("QR-код поставки скачан", "ok"));
    } catch (err) {
      setToast(
        makeToast(err instanceof Error ? err.message : "Ошибка при скачивании QR", "error")
      );
    } finally {
      setDownloadingQr(false);
    }
  }, [connected, lastSupplyId, makeToast]);

  const copySupplyId = useCallback(() => {
    if (!lastSupplyId) return;
    void navigator.clipboard.writeText(lastSupplyId);
    setCopiedSupplyId(true);
    setTimeout(() => setCopiedSupplyId(false), 2000);
  }, [lastSupplyId]);

  const dismissSupplyPanel = useCallback(() => {
    setLastSupplyId(null);
    setLastSupplyOrderIds([]);
    setSupplyDelivered(false);
  }, []);

  if (!orders || rows.length === 0) {
    return (
      <HubPanel className="flex min-h-[420px] flex-col">
        <HubEmptyState
          icon={<ShoppingCart className="h-7 w-7" />}
          title="Заказы пока не загружены"
          description="После выгрузки здесь появятся FBS-сборочные задания: новые, на сборке, в доставке и выкупленные. Нужна категория «Маркетплейс» в токене."
        />
      </HubPanel>
    );
  }

  const allEligibleSelected =
    eligibleVisible.length > 0 && eligibleVisible.every((r) => selectedOrderIds.has(r.externalId));

  return (
    <div className="space-y-4">
      {lastSupplyId ? (
        <HubPanel>
          <HubPanelHeader
            title="Текущая поставка"
            hint={
              supplyDelivered
                ? "Поставка в доставке — скачайте QR и передайте на склад WB"
                : "Заказы добавлены в поставку — распечатайте стикеры и передайте в доставку"
            }
          />
          <div className="flex flex-wrap items-center gap-3 px-5 py-4 sm:px-6">
            <div
              className="flex items-center gap-2 rounded-[10px] border px-3 py-1.5"
              style={{ borderColor: hub.borderSoft, backgroundColor: hub.surfaceMuted }}
            >
              <Package className="h-3.5 w-3.5" style={{ color: hub.textMuted }} />
              <span className="font-mono text-[14px]" style={{ color: hub.text }}>
                {lastSupplyId}
              </span>
              <button
                type="button"
                onClick={copySupplyId}
                className="rounded-[5px] p-0.5 transition-colors hover:bg-black/[0.05]"
                style={{ color: hub.textMuted }}
                aria-label="Скопировать ID поставки"
              >
                {copiedSupplyId ? (
                  <Check className="h-3.5 w-3.5" style={{ color: hub.green }} />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
            <HubBadge tone="accent">{lastSupplyOrderIds.length} заказов</HubBadge>
            <div className="flex flex-wrap gap-2">
              <HubButton
                size="sm"
                variant="secondary"
                loading={downloadingStickers}
                onClick={() => void handleDownloadStickers()}
                disabled={lastSupplyOrderIds.length === 0}
              >
                <Download className="h-3.5 w-3.5" />
                Стикеры заказов
              </HubButton>
              {!supplyDelivered ? (
                <HubButton size="sm" loading={closingSupply} onClick={() => void handleCloseSupply()}>
                  В доставку
                </HubButton>
              ) : (
                <HubButton
                  size="sm"
                  variant="secondary"
                  loading={downloadingQr}
                  onClick={() => void handleDownloadQr()}
                >
                  <QrCode className="h-3.5 w-3.5" />
                  QR поставки
                </HubButton>
              )}
              <HubButton size="sm" variant="ghost" onClick={dismissSupplyPanel}>
                Скрыть
              </HubButton>
            </div>
          </div>
        </HubPanel>
      ) : null}

      <div>
        <Segmented<"orders" | "overview">
          size="sm"
          label="Вид заказов"
          layoutId="orders-view"
          value={view}
          onChange={setView}
          options={[
            { id: "orders", label: `Список заказов · ${orders.total}` },
            { id: "overview", label: "Обзор и товары" },
          ]}
        />
      </div>

      {view === "overview" ? (
        <>
          <HubOrdersInsights snapshot={snapshot} />
          <HubOrdersProducts snapshot={snapshot} />
        </>
      ) : (
      <HubPanel>
        <HubPanelHeader
          title="Сборочные задания FBS"
          hint={`Всего ${formatInt(orders.total)} за последние ${FBS_ORDERS_WINDOW_DAYS} дн. · ${formatSyncTime(snapshot?.syncedAt)}`}
          action={
            writable && selectedOrderIds.size > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={targetOpen ? targetSupply : "new"}
                  onChange={(e) => setTargetSupply(e.target.value)}
                  aria-label="Куда добавить заказы"
                  className="rounded-[9px] border px-2 py-1.5 text-[12.5px]"
                  style={{ ...hubSans, borderColor: hub.border, backgroundColor: hub.surface, color: hub.text }}
                >
                  <option value="new">В новую поставку</option>
                  {openSupplies.map((s) => (
                    <option key={s.id} value={s.id}>
                      В открытую: {s.name ? `${s.name} (${s.id})` : s.id}
                    </option>
                  ))}
                </select>
                <HubButton size="sm" loading={creatingSupply} onClick={() => void handleCreateSupply()}>
                  <Package className="h-3.5 w-3.5" />
                  {targetOpen ? "Добавить в поставку" : "Создать поставку"} ({selectedOrderIds.size})
                </HubButton>
              </div>
            ) : undefined
          }
        />

        <StatusStrip<typeof filter>
          label="Этап заказа"
          value={filter}
          onChange={setFilter}
          items={[
            { id: "all", label: "Все", count: counts.all },
            { id: "new", label: "Новые", count: counts.new, color: "#4F5BEA" },
            { id: "assembly", label: "На сборке", count: counts.assembly, color: "#F59E0B" },
            { id: "delivery", label: "В доставке", count: counts.delivery, color: "#7C8A82" },
            { id: "done", label: "Выкуплены", count: counts.done, color: "#3B4248" },
            { id: "cancel", label: "Отменены", count: counts.cancel, color: "#C2413A" },
          ]}
        />
        <div
          className="flex flex-wrap items-center gap-3 border-b px-5 py-3 sm:px-6"
          style={{ borderColor: hub.borderSoft }}
        >
          <div className="min-w-[200px] flex-1">
            <HubInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по ID, артикулу, nmID"
            />
          </div>
          <HubButton
            size="sm"
            variant="secondary"
            onClick={() =>
              downloadCsv(
                `karto-zakazy-${new Date().toISOString().slice(0, 10)}.csv`,
                ["ID задания", "Артикул", "nmID", "Создан", "Цена, ₽", "Статус продавца", "Статус WB"],
                visible.map((r) => [r.externalId, r.article, r.nmId, r.createdAt, r.price, r.supplierStatus, r.wbStatus]),
              )
            }
          >
            Скачать CSV
          </HubButton>
        </div>

        <div className="pb-2">
          {writable && eligibleVisible.length > 0 ? (
            <label className="flex cursor-pointer items-center gap-2.5 border-b px-5 py-2.5 text-[14.5px]" style={{ ...hubSans, color: hub.textMuted, borderColor: "rgba(1, 20, 8, 0.08)" }}>
              <input type="checkbox" checked={allEligibleSelected} onChange={toggleAll} className="h-4 w-4 rounded" style={{ accentColor: hub.green }} aria-label="Выбрать все новые" />
              Выбрать все, которые можно добавить в поставку ({eligibleVisible.length})
            </label>
          ) : null}
          <div className="hidden items-center gap-x-4 px-5 py-2.5 text-[12px] font-semibold uppercase tracking-[0.07em] lg:flex" style={{ ...hubSans, color: hub.textSubtle, backgroundColor: "rgba(1, 20, 8, 0.045)" }}>
            {writable ? <span className="w-5 shrink-0" /> : null}
            <span className="w-[60px] shrink-0" />
            <span className="min-w-[180px] flex-1">Товар и заказ</span>
            <span className="w-[96px] shrink-0">Создан</span>
            <span className="w-[170px] shrink-0">Статус</span>
            <span className="w-[104px] shrink-0 text-right">Цена</span>
          </div>
          {pagedGroups.map((group) => (
            <section key={group.key}>
              <div className="flex items-baseline justify-between gap-3 border-b px-5 py-2.5" style={{ backgroundColor: "rgba(1, 20, 8, 0.045)", borderColor: "rgba(1, 20, 8, 0.1)", borderLeft: "3px solid #B9FF4B" }}>
                <h4 className="text-[14px] font-semibold capitalize" style={{ ...hubSans, color: hub.text }}>
                  {group.label}
                  <span className="ml-2 font-medium normal-case" style={{ color: hub.textSubtle }}>
                    {group.rows.length}
                  </span>
                </h4>
                <span className="text-[14px]" style={{ ...hubSans, ...hubNumeric, color: hub.textMuted }}>
                  {formatRub(group.sum)}
                </span>
              </div>
              <ul>
                {group.shown.map((row) => {
                  const wasCanceledHere = canceledIds.has(row.externalId);
                  const badge = wasCanceledHere ? { tone: "danger" as const, label: "Отменён" } : statusBadge(row);
                  const color = STATUS_COLOR[badge.label] ?? "#7C8A82";
                  const selectable = canAddToSupply(row) && !wasCanceledHere;
                  const cancellable = canCancelFbsOrder(row) && !wasCanceledHere;
                  const waited = wasCanceledHere || nowMs <= 0 ? null : waitingHours(row, nowMs);
                  const isSelected = selectedOrderIds.has(row.externalId);
                  const info = row.nmId != null ? productMeta.get(String(row.nmId)) : undefined;
                  const supplierText = row.supplierStatus ? (SUPPLIER_LABEL[row.supplierStatus] ?? "статус уточняется") : null;
                  return (
                    <li
                      key={row.id}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-5 py-3.5 transition-colors duration-150 hover:bg-black/[0.025]"
                      style={{ borderColor: "rgba(1, 20, 8, 0.07)", backgroundColor: isSelected ? "rgba(40, 52, 62, 0.07)" : undefined }}
                    >
                      {writable ? (
                        <span className="flex w-5 shrink-0 justify-center">
                          {selectable ? <input type="checkbox" checked={isSelected} onChange={() => toggleOrder(row.externalId)} className="h-4 w-4 rounded" style={{ accentColor: hub.green }} aria-label="Выбрать заказ" /> : null}
                        </span>
                      ) : null}
                      <Thumb src={info?.photo} />
                      <div className="min-w-[180px] flex-1">
                        <p className="line-clamp-2 text-[16px] font-semibold leading-[1.3] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
                          {info?.title ?? row.article ?? `Артикул ${row.nmId ?? "—"}`}
                        </p>
                        <p className="mt-0.5 text-[13.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
                          <span className="font-mono">№ {row.externalId}</span>
                          {row.article ? ` · ${row.article}` : ""}
                          {row.nmId ? ` · ${row.nmId}` : ""}
                        </p>
                      </div>
                      <div className="w-[96px] shrink-0 text-[14.5px]" style={{ ...hubSans, ...hubNumeric, color: hub.textMuted }}>
                        <p>{row.createdAt ? new Date(row.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "—"}</p>
                        {waited != null ? (
                          <p className="text-[13px] font-medium" style={{ color: waited >= 24 ? hub.danger : waited >= 6 ? hub.warn : hub.textSubtle }}>
                            ждёт {waited.toLocaleString("ru-RU")} ч
                          </p>
                        ) : null}
                      </div>
                      <div className="w-[170px] shrink-0">
                        <StatusDot color={color}>{badge.label}</StatusDot>
                        <p className="mt-1 pl-1 text-[13px] leading-tight" style={{ ...hubSans, color: hub.textSubtle }}>
                          {row.wbStatus ? (WB_LABEL[row.wbStatus] ?? "статус уточняется") : supplierText && supplierText !== badge.label ? supplierText : ""}
                        </p>
                      </div>
                      <p className="w-[104px] shrink-0 text-right text-[16.5px] font-medium" style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.04em", color: hub.text }}>
                        {row.price != null ? formatRub(row.price) : "—"}
                      </p>
                      {writable && cancellable ? (
                        <span className="flex shrink-0 items-center gap-1.5">
                          {confirmCancelId === row.externalId ? (
                            <>
                              <HubButton size="sm" variant="secondary" loading={cancelingId === row.externalId} onClick={() => void handleCancelOrder(row.externalId)}>
                                Да, отменить
                              </HubButton>
                              <HubButton size="sm" variant="ghost" onClick={() => setConfirmCancelId(null)}>
                                Нет
                              </HubButton>
                            </>
                          ) : (
                            <HubButton size="sm" variant="ghost" onClick={() => setConfirmCancelId(row.externalId)}>
                              Отменить
                            </HubButton>
                          )}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {hiddenOrders > 0 ? (
            <div className="flex justify-center px-5 py-5">
              <HubButton size="sm" variant="secondary" onClick={paged.more}>
                Показать ещё {Math.min(paged.step, hiddenOrders)} из {formatInt(hiddenOrders)}
              </HubButton>
            </div>
          ) : null}
          {visible.length === 0 ? (
            <p className="px-5 py-10 text-center text-[15.5px]" style={{ ...hubSans, color: hub.textMuted }}>
              По таким условиям заказов нет.
            </p>
          ) : null}
        </div>
      </HubPanel>
      )}

      {toast ? <HubToast toast={toast} onDismiss={() => setToast(null)} /> : null}
    </div>
  );
}
