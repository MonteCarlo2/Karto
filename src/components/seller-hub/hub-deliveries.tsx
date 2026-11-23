"use client";

import { useEffect, useMemo, useState } from "react";
import { usePagedLimit } from "./use-paged-limit";
import { CalendarDays, CheckCircle2, ChevronDown, ListChecks, PackageOpen } from "lucide-react";
import { Package, QrCode } from "lucide-react";
import { loadSellerHubSupplyOrders, manageSellerHubSupply, type SellerHubSupplyOrders } from "@/lib/seller-hub/client-api";
import { ruPlural } from "@/lib/seller-hub/task-engine/ru-plural";
import { SUPPLY_WRITE_ENABLED } from "@/lib/seller-hub/feature-flags";
import { snapshotTimeMs } from "@/lib/seller-hub/complete-days";
import type { SellerCatalogSnapshot, SellerSupplyRow } from "@/lib/seller-hub/types";
import {
  formatInt,
  formatSyncTime,
  hub,
  HubButton,
  HubEmptyState,
  HubInput,
  hubNumeric,
  hubSans,
} from "./hub-ui";
import { FilterTabs, HubPanel, HubPanelHeader, StatusDot, Thumb } from "./hub-fulfillment-ui";
import { downloadBase64File } from "./download-file";
import { HubOrderHours } from "./hub-order-hours";
import { clearEvidenceFocus, peekEvidenceFocus, revealEvidence } from "./evidence-focus";
import { HubShipSpeed } from "./hub-ship-speed";
import { HubToast, useHubToast, type HubToastState } from "./hub-toast";
import type { FulfillmentData } from "./hub-fulfillment";

/** Заказы поставки по товарам: сколько штук каждого. */
function groupSupply(rows: SupplyOrderRows, known: Map<number, { nmId?: number; article?: string }>): Array<{ nmId?: number; article?: string; count: number }> {
  const map = new Map<string, { nmId?: number; article?: string; count: number }>();
  for (const o of rows) {
    // WB в составе поставки иногда отдаёт только номер заказа: достаём товар из заказов, которые мы уже знаем.
    const nmId = o.nmId ?? known.get(o.id)?.nmId;
    const article = o.article ?? known.get(o.id)?.article;
    const key = `${nmId ?? ""}|${article ?? ""}`;
    const g = map.get(key) ?? { nmId, article, count: 0 };
    g.count += 1;
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

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
  const [groupsAll, setGroupsAll] = useState<Record<string, boolean>>({});
  const [dView, setDView] = useState<"list" | "speed">(() => (peekEvidenceFocus("speed") ? "speed" : "list"));
  const evidenceAnchor = peekEvidenceFocus("speed")?.anchor;
  useEffect(() => {
    if (!evidenceAnchor || dView !== "speed") return;
    const stop = revealEvidence(evidenceAnchor);
    return () => {
      stop();
      clearEvidenceFocus();
    };
    // фокус одноразовый: берём один раз при открытии вкладки
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [filter, setFilter] = useState<"all" | "fbs" | "fbw" | "open" | "closed">("all");
  const paged = usePagedLimit(`${filter}|${search}`);
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
  const knownOrders = useMemo(() => new Map((snapshot?.orders?.orders ?? []).map((o) => [o.externalId, { nmId: o.nmId, article: o.article }])), [snapshot?.orders]);
  const productMeta = useMemo(() => {
    const map = new Map<string, { title?: string; photo?: string }>();
    for (const i of snapshot?.items ?? []) {
      const meta = { title: i.title || i.vendorCode || undefined, photo: i.imageUrl ?? undefined };
      map.set(i.externalId, meta);
      if (i.vendorCode) map.set(`v:${i.vendorCode}`, meta);
    }
    return map;
  }, [snapshot?.items]);
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
    }).sort((a, b) => Number(a.done) - Number(b.done) || (Date.parse(b.createdAt ?? "") || 0) - (Date.parse(a.createdAt ?? "") || 0));
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
  const oldestOpen = (() => {
    const ages = rows.filter((r) => !r.done && r.createdAt && nowMs > 0).map((r) => Math.max(0, Math.floor((nowMs - Date.parse(r.createdAt!)) / 86_400_000)));
    return ages.length > 0 ? Math.max(...ages) : null;
  })();
  const closedWithin = (days: number) => rows.filter((r) => r.done && r.closedAt && nowMs > 0 && nowMs - Date.parse(r.closedAt) <= days * 86_400_000).length;
  const closed7 = closedWithin(7);
  const closed30 = closedWithin(30);
  const fbsCount = rows.filter((r) => r.type === "fbs").length;
  const fbwCount = rows.filter((r) => r.type === "fbw").length;

  return (
    <div className="space-y-4">
      {fulfillment ? (
        <div className="border-b" style={{ borderColor: "rgba(1, 20, 8, 0.12)" }}>
          <FilterTabs<"list" | "speed">
            label="Вид поставок"
            value={dView}
            onChange={setDView}
            options={[
              { id: "list", label: "План поставок", count: rows.length },
              { id: "speed", label: "Скорость отгрузки" },
            ]}
          />
        </div>
      ) : null}

      {dView === "list" ? (
        <div className="grid gap-3 md:grid-cols-3">
          {[
            { icon: PackageOpen, label: "Открытые поставки", value: formatInt(openCount), note: oldestOpen != null ? `самая старая открыта ${oldestOpen} дн.` : "все закрыты", tint: "#F59E0B", warn: (oldestOpen ?? 0) >= 3 },
            { icon: CheckCircle2, label: "Передано за 7 дней", value: formatInt(closed7), note: "поставок отправлено в доставку", tint: "#10B981", warn: false },
            { icon: CalendarDays, label: "Передано за 30 дней", value: formatInt(closed30), note: "поставок отправлено в доставку", tint: "#4F5BEA", warn: false },
          ].map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.label} className="flex items-start gap-4 rounded-[18px] border p-5" style={{ borderColor: "rgba(1, 20, 8, 0.12)", backgroundColor: hub.surface }}>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${c.tint}1F`, color: c.tint }}>
                  <Icon className="h-[22px] w-[22px]" />
                </span>
                <div className="min-w-0">
                  <p className="text-[14.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
                    {c.label}
                  </p>
                  <p className="mt-3 text-[32px] font-medium leading-none" style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.05em", color: hub.text }}>
                    {c.value}
                  </p>
                  <p className="mt-3 text-[14px]" style={{ ...hubSans, color: c.warn ? "#B42323" : hub.textMuted }}>
                    {c.note}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {fulfillment && dView === "speed" ? (
        <div className="space-y-4">
          <HubShipSpeed speed={fulfillment.shipSpeed} loading={fulfillment.speedLoading} error={fulfillment.speedError} suppliesTotal={fulfillment.speedSuppliesTotal} coverage={fulfillment.speedCoverage} />
          <HubOrderHours orders={snapshot?.orders?.orders ?? []} supplies={snapshot?.supplies?.supplies ?? []} nowMs={fulfillment.nowMs} />
        </div>
      ) : (
      <HubPanel>
        <HubPanelHeader title="План поставок" hint={`Обновлено ${formatSyncTime(snapshot?.syncedAt)}`} />

        <div className="border-b px-5 pt-1 sm:px-6" style={{ borderColor: hub.borderSoft }}>
          <FilterTabs<typeof filter>
            label="Тип и статус поставок"
            value={filter}
            onChange={setFilter}
            options={[
              { id: "all", label: "Все", count: rows.length },
              { id: "open", label: "Открытые", count: openCount },
              { id: "closed", label: "Закрытые", count: rows.length - openCount },
              { id: "fbs", label: "FBS", count: fbsCount },
              { id: "fbw", label: "FBO", count: fbwCount },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 border-b px-5 py-3 sm:px-6" style={{ borderColor: hub.borderSoft }}>
          <div className="min-w-[200px] flex-1">
            <HubInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по ID или статусу" />
          </div>
        </div>

        <div className="hidden items-center gap-x-4 px-5 py-2.5 text-[12px] font-semibold uppercase tracking-[0.07em] lg:grid lg:grid-cols-[minmax(0,1fr)_52px_150px_180px_64px_auto]" style={{ ...hubSans, color: hub.textSubtle, backgroundColor: "rgba(1, 20, 8, 0.045)" }}>
          <span>Поставка</span>
          <span className="w-[56px] shrink-0 lg:w-auto">Тип</span>
          <span className="w-[160px] shrink-0 lg:w-auto">Статус</span>
          <span className="w-[190px] shrink-0 lg:w-auto">Даты</span>
          <span className="w-[80px] shrink-0 lg:w-auto text-right">Кол-во</span>
          {connected ? <span className="text-right">Действия</span> : null}
        </div>
        <ul>
          {visible.slice(0, paged.limit).map((row) => {
            const key = `${row.type}:${row.id}`;
            const content = contents[row.id];
            const openDays = !row.done && row.type === "fbs" && row.createdAt && nowMs > 0 ? Math.max(0, Math.floor((nowMs - Date.parse(row.createdAt)) / 86_400_000)) : null;
            const dateOf = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("ru-RU") : null);
            return (
              <li key={key} className="border-b" style={{ borderColor: "rgba(1, 20, 8, 0.07)" }}>
                <div style={{ borderLeftColor: row.done ? "rgba(1, 20, 8, 0.2)" : "#F59E0B" }} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-l-[3px] px-5 py-4 transition-colors hover:bg-black/[0.025] lg:grid lg:grid-cols-[minmax(0,1fr)_52px_150px_180px_64px_auto]">
                  <div className="min-w-[200px] flex-1 lg:min-w-0">
                    <p className="text-[16px] font-semibold leading-[1.3] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
                      {row.name ?? "Поставка"}
                    </p>
                    <p className="mt-0.5 font-mono text-[13.5px]" style={{ color: hub.textSubtle }}>
                      {row.id}
                    </p>
                  </div>
                  <span className="w-[56px] shrink-0 lg:w-auto">
                    <span className="rounded-[7px] px-2.5 py-1 text-[13px] font-bold" style={{ ...hubSans, color: row.type === "fbs" ? "#3D49C9" : "#6A3DD0", backgroundColor: row.type === "fbs" ? "rgba(79, 91, 234, 0.12)" : "rgba(139, 92, 246, 0.13)" }}>
                      {row.type === "fbs" ? "FBS" : "FBO"}
                    </span>
                  </span>
                  <div className="w-[160px] shrink-0 lg:w-auto">
                    {row.done ? <StatusDot color="#9AA0A6">{row.status ?? "Закрыта"}</StatusDot> : <StatusDot color="#F59E0B">{row.status ?? "Открыта"}</StatusDot>}
                    {openDays != null ? (
                      <p className="mt-1 pl-1 text-[13px]" style={{ ...hubSans, color: openDays >= 3 ? hub.danger : hub.textSubtle }}>
                        открыта {openDays} дн.
                      </p>
                    ) : null}
                  </div>
                  <div className="w-[190px] shrink-0 lg:w-auto text-[14px] leading-[1.5]" style={{ ...hubSans, ...hubNumeric, color: hub.textMuted }}>
                    {dateOf(row.createdAt) ? <p>Создана {dateOf(row.createdAt)}</p> : null}
                    {dateOf(row.plannedAt) ? <p>План {dateOf(row.plannedAt)}</p> : null}
                    {dateOf(row.closedAt) ? <p>Закрыта {dateOf(row.closedAt)}</p> : null}
                  </div>
                  <p className="w-[80px] shrink-0 lg:w-auto text-right text-[17px] font-medium" style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.04em", color: hub.text }}>
                    {row.quantity != null ? formatInt(row.quantity) : "—"}
                  </p>
                  {connected ? (
                    <span className="flex w-[150px] shrink-0 lg:w-auto flex-wrap items-center justify-end gap-1.5">
                      {row.type === "fbs" ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void toggleContents(row)}
                            aria-expanded={expanded === row.id}
                            className="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[14px] font-semibold transition-colors hover:bg-[rgba(185,255,75,0.28)]"
                            style={{ ...hubSans, color: hub.text, borderColor: "rgba(1, 20, 8, 0.22)", backgroundColor: expanded === row.id ? "rgba(185, 255, 75, 0.35)" : hub.surface }}
                          >
                            <ListChecks className="h-4 w-4" />
                            {expanded === row.id ? "Скрыть" : "Состав"}
                            <ChevronDown className="h-4 w-4 transition-transform" style={{ transform: expanded === row.id ? "rotate(180deg)" : undefined }} />
                          </button>
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
                        </>
                      ) : null}
                    </span>
                  ) : null}
                </div>
                {expanded === row.id ? (
                  <div className="px-5 pb-4 pt-1" style={{ backgroundColor: "rgba(1, 20, 8, 0.035)" }}>
                    {content?.loading || !content ? (
                      <p className="py-2 text-[14.5px]" style={{ ...hubSans, color: hub.textMuted }}>
                        Читаю состав поставки…
                      </p>
                    ) : content.error ? (
                      <p className="py-2 text-[14.5px]" style={{ ...hubSans, color: hub.danger }}>
                        {content.error}
                      </p>
                    ) : (content.rows ?? []).length === 0 ? (
                      <p className="py-2 text-[14.5px]" style={{ ...hubSans, color: hub.textMuted }}>
                        В поставке нет заказов.
                      </p>
                    ) : (
                      <div className="py-3">
                        <p className="mb-3 text-[14.5px] font-medium" style={{ ...hubSans, color: hub.textMuted }}>
                          В поставке {formatInt((content.rows ?? []).length)} {ruPlural((content.rows ?? []).length, "заказ", "заказа", "заказов")}, {formatInt(groupSupply(content.rows ?? [], knownOrders).length)} {ruPlural(groupSupply(content.rows ?? [], knownOrders).length, "товар", "товара", "товаров")}
                        </p>
                        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          {groupSupply(content.rows ?? [], knownOrders).slice(0, groupsAll[row.id] ? 500 : 30).map((g) => {
                            const meta = g.nmId != null ? productMeta.get(String(g.nmId)) : g.article ? productMeta.get(`v:${g.article}`) : undefined;
                            return (
                              <li key={`${g.nmId ?? ""}-${g.article ?? ""}`} className="flex items-center gap-3.5 rounded-[14px] border p-3" style={{ borderColor: "rgba(1, 20, 8, 0.1)", backgroundColor: hub.surface }}>
                                <Thumb src={meta?.photo} />
                                <div className="min-w-0 flex-1">
                                  <p className="line-clamp-2 text-[15px] font-semibold leading-[1.3] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
                                    {meta?.title ?? g.article ?? (g.nmId != null ? `Артикул ${g.nmId}` : "Товар не определён")}
                                  </p>
                                  <p className="mt-0.5 text-[13px]" style={{ ...hubSans, color: hub.textSubtle }}>
                                    {g.article || g.nmId != null ? `${g.article ? `${g.article} · ` : ""}${g.nmId ?? ""}` : "состав старше 30 дней: WB уже не отдаёт товар"}
                                  </p>
                                </div>
                                <span className="shrink-0 text-[24px] font-medium leading-none" style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace", letterSpacing: "-0.05em", color: hub.text }}>
                                  ×{g.count}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                        {groupSupply(content.rows ?? [], knownOrders).length > 30 && !groupsAll[row.id] ? (
                          <div className="mt-3">
                            <HubButton size="sm" variant="secondary" onClick={() => setGroupsAll((prev) => ({ ...prev, [row.id]: true }))}>
                              Показать все товары ({formatInt(groupSupply(content.rows ?? [], knownOrders).length)})
                            </HubButton>
                          </div>
                        ) : null}
                        {groupSupply(content.rows ?? [], knownOrders).length > 30 ? (
                          <p className="mt-3 text-[14px]" style={{ ...hubSans, color: hub.textMuted }}>
                            и ещё {groupSupply(content.rows ?? [], knownOrders).length - 30} товаров
                          </p>
                        ) : null}
                      </div>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        {visible.length > paged.limit ? (
          <div className="flex justify-center px-5 py-5">
            <HubButton size="sm" variant="secondary" onClick={paged.more}>
              Показать ещё {Math.min(paged.step, visible.length - paged.limit)} из {formatInt(visible.length - paged.limit)}
            </HubButton>
          </div>
        ) : null}
      </HubPanel>
      )}
      {toast ? <HubToast toast={toast} onDismiss={() => setToast(null)} /> : null}
    </div>
  );
}
