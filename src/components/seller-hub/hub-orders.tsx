"use client";

import { useCallback, useMemo, useState } from "react";
import { Check, Copy, Download, Package, QrCode, ShoppingCart } from "lucide-react";
import { manageSellerHubSupply } from "@/lib/seller-hub/client-api";
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
  HubPanel,
  HubPanelHeader,
  HubSegmented,
  hubNumeric,
  hubSans,
  MetricTile,
} from "./hub-ui";
import { HubToast, useHubToast, type HubToastState } from "./hub-toast";
import { HubOrdersInsights } from "./hub-orders-insights";
import { downloadBase64File, downloadCsv } from "./download-file";
import { HubOrdersProducts } from "./hub-orders-products";

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
  const [view, setView] = useState<"orders" | "products">("orders");
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
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricTile label="Новые" value={formatInt(orders.newCount)} sub="ждут подтверждения" />
        <MetricTile label="На сборке" value={formatInt(orders.inAssembly)} sub="продавец собирает" tone="warn" />
        <MetricTile label="В доставке" value={formatInt(orders.inDelivery)} sub="едут к покупателю" />
        <MetricTile label="Выкуплены" value={formatInt(orders.delivered)} sub="покупатель забрал" tone="good" />
        <MetricTile label="Отменены" value={formatInt(orders.canceled)} sub="за 7 дней" tone="danger" />
      </div>

      <HubOrdersInsights snapshot={snapshot} />

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
              <span className="font-mono text-[12.5px]" style={{ color: hub.text }}>
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

      <HubSegmented<"orders" | "products">
        layoutId="orders-view"
        value={view}
        onChange={setView}
        options={[
          { id: "orders", label: "Все заказы" },
          { id: "products", label: "По товарам" },
        ]}
      />

      {view === "products" ? (
        <HubOrdersProducts snapshot={snapshot} />
      ) : (
      <HubPanel>
        <HubPanelHeader
          title="Сборочные задания FBS"
          hint={`Всего ${formatInt(orders.total)} за 7 дней · ${formatSyncTime(snapshot?.syncedAt)}`}
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
          <div className="flex flex-wrap gap-1 rounded-[11px] p-1" style={{ backgroundColor: hub.surfaceMuted }}>
            {(
              [
                ["all", "Все"],
                ["new", "Новые"],
                ["assembly", "Сборка"],
                ["delivery", "Доставка"],
                ["done", "Выкуп"],
                ["cancel", "Отмена"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={`rounded-[8px] px-3 py-1.5 text-[12.5px] font-semibold ${
                  filter === id ? "bg-[#B9FF4B]/45" : ""
                }`}
                style={{ ...hubSans, color: filter === id ? hub.text : hub.textMuted }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left">
            <thead style={{ backgroundColor: hub.surfaceMuted }}>
              <tr>
                {writable ? (
                  <th className="border-b px-4 py-3 sm:px-5" style={{ borderColor: hub.borderSoft }}>
                    {eligibleVisible.length > 0 ? (
                      <input
                        type="checkbox"
                        checked={allEligibleSelected}
                        onChange={toggleAll}
                        className="h-4 w-4 rounded"
                        style={{ accentColor: hub.green }}
                        aria-label="Выбрать все новые"
                      />
                    ) : null}
                  </th>
                ) : null}
                {["ID", "Артикул", "nmID", "Создан", "Ждёт, ч", "Цена", "Статус продавца", "Статус WB", writable ? "Действие" : ""].filter(Boolean).map((label) => (
                  <th
                    key={label}
                    className="border-b px-5 py-3 text-[11.5px] font-bold uppercase tracking-[0.06em] sm:px-6"
                    style={{ ...hubSans, color: hub.textSubtle, borderColor: hub.borderSoft }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.slice(0, 200).map((row) => {
                const wasCanceledHere = canceledIds.has(row.externalId);
                const badge = wasCanceledHere ? { tone: "danger" as const, label: "Отменён" } : statusBadge(row);
                const selectable = canAddToSupply(row) && !wasCanceledHere;
                const cancellable = canCancelFbsOrder(row) && !wasCanceledHere;
                const waited = wasCanceledHere || nowMs <= 0 ? null : waitingHours(row, nowMs);
                const isSelected = selectedOrderIds.has(row.externalId);
                return (
                  <tr
                    key={row.id}
                    className={`border-b transition-colors duration-150 hover:bg-[#1C1915]/[0.04] ${isSelected ? "bg-[#B9FF4B]/20" : ""}`}
                    style={{ borderColor: hub.borderSoft }}
                  >
                    {writable ? (
                      <td className="px-4 py-3 sm:px-5">
                        {selectable ? (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleOrder(row.externalId)}
                            className="h-4 w-4 rounded"
                            style={{ accentColor: hub.green }}
                          />
                        ) : null}
                      </td>
                    ) : null}
                    <td className="whitespace-nowrap px-5 py-3 font-mono text-[12.5px] sm:px-6">{row.externalId}</td>
                    <td className="px-5 py-3 text-[13px] sm:px-6">
                      {row.article ?? "—"}
                    </td>
                    <td className="px-5 py-3 font-mono text-[12.5px] sm:px-6">{row.nmId ?? "—"}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-[13px] sm:px-6">
                      {row.createdAt ? new Date(row.createdAt).toLocaleString("ru-RU") : "—"}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-[13px] tabular-nums sm:px-6" style={{ ...hubSans, color: hub.textMuted }}>
                      {waited != null ? waited.toLocaleString("ru-RU") : "—"}
                    </td>
                    <td
                      className="px-5 py-3 text-[13.5px] font-semibold sm:px-6"
                      style={{ ...hubSans, ...hubNumeric, color: hub.text }}
                    >
                      {row.price != null ? formatRub(row.price) : "—"}
                    </td>
                    <td className="px-5 py-3 sm:px-6">
                      <HubBadge tone={badge.tone}>{badge.label}</HubBadge>
                      {row.supplierStatus ? (
                        <p className="mt-1 text-[11px]" style={{ color: hub.textSubtle }}>
                          {SUPPLIER_LABEL[row.supplierStatus] ?? "статус уточняется"}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-5 py-3 text-[13px] sm:px-6" style={{ color: hub.textMuted }}>
                      {row.wbStatus ? (WB_LABEL[row.wbStatus] ?? "статус уточняется") : "—"}
                    </td>
                    {writable ? (
                      <td className="whitespace-nowrap px-5 py-3 sm:px-6">
                        {!cancellable ? null : confirmCancelId === row.externalId ? (
                          <span className="flex items-center gap-1.5">
                            <HubButton size="sm" variant="secondary" loading={cancelingId === row.externalId} onClick={() => void handleCancelOrder(row.externalId)}>
                              Да, отменить
                            </HubButton>
                            <HubButton size="sm" variant="ghost" onClick={() => setConfirmCancelId(null)}>
                              Нет
                            </HubButton>
                          </span>
                        ) : (
                          <HubButton size="sm" variant="ghost" onClick={() => setConfirmCancelId(row.externalId)}>
                            Отменить
                          </HubButton>
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </HubPanel>
      )}

      {toast ? <HubToast toast={toast} onDismiss={() => setToast(null)} /> : null}
    </div>
  );
}
