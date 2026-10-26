"use client";

import { Fragment, useMemo, useState } from "react";
import { Package, QrCode } from "lucide-react";
import { loadSellerHubSupplyOrders, manageSellerHubSupply, type SellerHubSupplyOrders } from "@/lib/seller-hub/client-api";
import { SUPPLY_WRITE_ENABLED } from "@/lib/seller-hub/feature-flags";
import { snapshotTimeMs } from "@/lib/seller-hub/complete-days";
import type { SellerCatalogSnapshot, SellerSupplyRow } from "@/lib/seller-hub/types";
import {
  formatInt,
  formatSyncTime,
  hub,
  HubBadge,
  HubButton,
  HubEmptyState,
  HubInput,
  HubPanel,
  HubPanelHeader,
  hubSans,
  MetricTile,
} from "./hub-ui";
import { downloadBase64File } from "./download-file";
import { HubShipSpeed } from "./hub-ship-speed";
import { HubToast, useHubToast, type HubToastState } from "./hub-toast";
import type { FulfillmentData } from "./hub-fulfillment";

type SupplyOrderRows = SellerHubSupplyOrders[number]["orders"];

export function HubDeliveries({
  snapshot,
  connected,
  fulfillment,
}: {
  snapshot?: SellerCatalogSnapshot;
  connected?: boolean;
  fulfillment?: FulfillmentData;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "fbs" | "fbw" | "open" | "closed">("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [contents, setContents] = useState<Record<string, { rows?: SupplyOrderRows; error?: string; loading?: boolean }>>({});
  const [confirmCloseId, setConfirmCloseId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Поставки, переданные в доставку отсюда: до следующей выгрузки показываем их закрытыми. */
  const [closedHere, setClosedHere] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<HubToastState | null>(null);
  const { makeToast } = useHubToast();

  const nowMs = snapshotTimeMs(snapshot);
  const supplies = snapshot?.supplies;
  const rows = useMemo<SellerSupplyRow[]>(
    () => (supplies?.supplies ?? []).map((row) => (closedHere.has(row.id) && row.type === "fbs" ? { ...row, done: true, status: "Закрыта" } : row)),
    [supplies, closedHere],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (q) {
        const hay = `${row.id} ${row.name ?? ""} ${row.status ?? ""}`;
        if (!hay.toLowerCase().includes(q)) return false;
      }
      if (filter === "fbs") return row.type === "fbs";
      if (filter === "fbw") return row.type === "fbw";
      if (filter === "open") return !row.done;
      if (filter === "closed") return row.done;
      return true;
    });
  }, [rows, search, filter]);

  async function toggleContents(row: SellerSupplyRow) {
    if (expanded === row.id) {
      setExpanded(null);
      return;
    }
    setExpanded(row.id);
    if (contents[row.id]?.rows) return;
    setContents((prev) => ({ ...prev, [row.id]: { loading: true } }));
    const res = await loadSellerHubSupplyOrders({ supplies: [{ id: row.id, done: row.done }], refresh: !row.done });
    setContents((prev) => ({
      ...prev,
      [row.id]: res.ok && res.supplyOrders ? { rows: res.supplyOrders[0]?.orders ?? [] } : { error: res.error ?? "Не удалось прочитать состав" },
    }));
  }

  async function closeSupply(row: SellerSupplyRow) {
    setBusyId(row.id);
    try {
      const res = await manageSellerHubSupply({ action: "close", supplyId: row.id });
      if (!res.ok) {
        setToast(makeToast(res.error ?? "Не удалось передать поставку в доставку", "error"));
        return;
      }
      setClosedHere((prev) => new Set(prev).add(row.id));
      fulfillment?.markSupplyClosed(row.id);
      // Состав закрытой поставки больше не меняется, а прежний открытый мог устареть: читаем заново при следующем раскрытии.
      setContents((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      setToast(makeToast(`Поставка ${row.id} передана в доставку. Теперь можно скачать QR.`, "ok"));
    } catch (err) {
      setToast(makeToast(err instanceof Error ? err.message : "Ошибка при закрытии поставки", "error"));
    } finally {
      setBusyId(null);
      setConfirmCloseId(null);
    }
  }

  async function downloadQr(row: SellerSupplyRow) {
    setBusyId(row.id);
    try {
      const res = await manageSellerHubSupply({ action: "barcode", supplyId: row.id, stickerType: "png" });
      if (!res.ok || !res.barcode?.fileBase64) {
        setToast(makeToast(res.error ?? "WB не вернул QR-код поставки", "warn"));
        return;
      }
      downloadBase64File(res.barcode.fileBase64, `supply-${row.id}-qr.png`, "image/png");
      setToast(makeToast("QR-код поставки скачан", "ok"));
    } catch (err) {
      setToast(makeToast(err instanceof Error ? err.message : "Ошибка при скачивании QR", "error"));
    } finally {
      setBusyId(null);
    }
  }

  if (!supplies || rows.length === 0) {
    return (
      <HubPanel className="flex min-h-[420px] flex-col">
        <HubEmptyState
          icon={<Package className="h-7 w-7" />}
          title="Поставки пока не загружены"
          description="FBS-поставки — из «Маркетплейс», FBO-поставки на склады WB — из категории «Поставки» в токене."
        />
      </HubPanel>
    );
  }

  const openCount = rows.filter((r) => !r.done).length;
  const fbsCount = rows.filter((r) => r.type === "fbs").length;
  const fbwCount = rows.filter((r) => r.type === "fbw").length;
  const columns = ["ID", "Тип", "Название", "Статус", "Создана", "План", "Закрыта", "Кол-во", connected ? "Действия" : ""].filter(Boolean);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="Открытые" value={formatInt(openCount)} sub="ещё в работе" tone="warn" />
        <MetricTile label="Закрытые" value={formatInt(rows.length - openCount)} sub="завершённые" />
        <MetricTile label="FBS" value={formatInt(fbsCount)} sub="свой склад" />
        <MetricTile label="FBO" value={formatInt(fbwCount)} sub="склады WB" />
      </div>

      {fulfillment ? (
        <HubShipSpeed speed={fulfillment.shipSpeed} loading={fulfillment.speedLoading} error={fulfillment.speedError} suppliesTotal={fulfillment.speedSuppliesTotal} coverage={fulfillment.speedCoverage} />
      ) : null}

      <HubPanel>
        <HubPanelHeader title="План поставок" hint={`Обновлено ${formatSyncTime(snapshot?.syncedAt)}`} />

        <div className="flex flex-wrap items-center gap-3 border-b px-5 py-3 sm:px-6" style={{ borderColor: hub.borderSoft }}>
          <div className="min-w-[200px] flex-1">
            <HubInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по ID или статусу" />
          </div>
          <div className="flex flex-wrap gap-1 rounded-[11px] p-1" style={{ backgroundColor: hub.surfaceMuted }}>
            {(
              [
                ["all", "Все"],
                ["fbs", "FBS"],
                ["fbw", "FBO"],
                ["open", "Открытые"],
                ["closed", "Закрытые"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={`rounded-[8px] px-3 py-1.5 text-[12.5px] font-semibold ${filter === id ? "bg-[#B9FF4B]/45" : ""}`}
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
                {columns.map((label) => (
                  <th key={label} className="border-b px-5 py-3 text-[11.5px] font-bold uppercase tracking-[0.06em] sm:px-6" style={{ ...hubSans, color: hub.textSubtle, borderColor: hub.borderSoft }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.slice(0, 200).map((row) => {
                const key = `${row.type}:${row.id}`;
                const content = contents[row.id];
                const openDays = !row.done && row.type === "fbs" && row.createdAt && nowMs > 0 ? Math.max(0, Math.floor((nowMs - Date.parse(row.createdAt)) / 86_400_000)) : null;
                return (
                  <Fragment key={key}>
                    <tr className="border-b transition-colors duration-150 hover:bg-[#1C1915]/[0.04]" style={{ borderColor: hub.borderSoft }}>
                      <td className="whitespace-nowrap px-5 py-3 font-mono text-[12.5px] sm:px-6">{row.id}</td>
                      <td className="px-5 py-3 sm:px-6">
                        <HubBadge tone={row.type === "fbs" ? "accent" : "ok"}>{row.type === "fbs" ? "FBS" : "FBO"}</HubBadge>
                      </td>
                      <td className="max-w-[220px] truncate px-5 py-3 text-[13px] sm:px-6">{row.name ?? "—"}</td>
                      <td className="px-5 py-3 sm:px-6">
                        {row.done ? <HubBadge tone="ok">{row.status ?? "Закрыта"}</HubBadge> : <HubBadge tone="warn">{row.status ?? "Открыта"}</HubBadge>}
                        {openDays != null ? (
                          <p className="mt-1 text-[11px]" style={{ color: hub.textSubtle }}>
                            открыта {openDays} дн.
                          </p>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-[13px] sm:px-6">{row.createdAt ? new Date(row.createdAt).toLocaleDateString("ru-RU") : "—"}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-[13px] sm:px-6">{row.plannedAt ? new Date(row.plannedAt).toLocaleDateString("ru-RU") : "—"}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-[13px] sm:px-6">{row.closedAt ? new Date(row.closedAt).toLocaleDateString("ru-RU") : "—"}</td>
                      <td className="px-5 py-3 text-[13px] sm:px-6">{row.quantity != null ? formatInt(row.quantity) : "—"}</td>
                      {connected ? (
                        <td className="whitespace-nowrap px-5 py-3 sm:px-6">
                          {row.type === "fbs" ? (
                            <span className="flex flex-wrap items-center gap-1.5">
                              <HubButton size="sm" variant="ghost" onClick={() => void toggleContents(row)}>
                                {expanded === row.id ? "Скрыть состав" : "Состав"}
                              </HubButton>
                              {!SUPPLY_WRITE_ENABLED ? null : !row.done ? (
                                confirmCloseId === row.id ? (
                                  <>
                                    <HubButton size="sm" loading={busyId === row.id} onClick={() => void closeSupply(row)}>
                                      Да, в доставку
                                    </HubButton>
                                    <HubButton size="sm" variant="ghost" onClick={() => setConfirmCloseId(null)}>
                                      Нет
                                    </HubButton>
                                  </>
                                ) : (
                                  <HubButton size="sm" variant="secondary" onClick={() => setConfirmCloseId(row.id)}>
                                    В доставку
                                  </HubButton>
                                )
                              ) : (
                                <HubButton size="sm" variant="ghost" loading={busyId === row.id} onClick={() => void downloadQr(row)}>
                                  <QrCode className="h-3.5 w-3.5" />
                                  QR
                                </HubButton>
                              )}
                            </span>
                          ) : null}
                        </td>
                      ) : null}
                    </tr>
                    {expanded === row.id ? (
                      <tr className="border-b" style={{ borderColor: hub.borderSoft, backgroundColor: hub.surfaceMuted }}>
                        <td colSpan={columns.length} className="px-5 py-3 sm:px-6">
                          {content?.loading || !content ? (
                            <p className="text-[13px]" style={{ ...hubSans, color: hub.textMuted }}>
                              Читаю состав поставки…
                            </p>
                          ) : content.error ? (
                            <p className="text-[13px]" style={{ ...hubSans, color: hub.danger }}>
                              {content.error}
                            </p>
                          ) : (content.rows ?? []).length === 0 ? (
                            <p className="text-[13px]" style={{ ...hubSans, color: hub.textMuted }}>
                              В поставке нет заказов.
                            </p>
                          ) : (
                            <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                              {(content.rows ?? []).slice(0, 60).map((o) => (
                                <li key={o.id} className="text-[12.5px]" style={{ ...hubSans, color: hub.text }}>
                                  <span className="font-mono">{o.id}</span>
                                  {o.article ? ` · ${o.article}` : ""}
                                  {o.createdAt ? ` · ${new Date(o.createdAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}
                                </li>
                              ))}
                              {(content.rows ?? []).length > 60 ? (
                                <li className="text-[12.5px]" style={{ ...hubSans, color: hub.textMuted }}>
                                  и ещё {(content.rows ?? []).length - 60}
                                </li>
                              ) : null}
                            </ul>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </HubPanel>
      {toast ? <HubToast toast={toast} onDismiss={() => setToast(null)} /> : null}
    </div>
  );
}
