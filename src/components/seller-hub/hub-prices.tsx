"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Pencil, Tag, X } from "lucide-react";
import { updateSellerHubPrices } from "@/lib/seller-hub/client-api";
import { appendHubJournal, readHubJournal } from "@/lib/seller-hub/journal";
import { claimPriceSubmit, priceJournalEntry, priceWriteView, releasePriceSubmit } from "@/lib/seller-hub/price-write";
import type { SellerCatalogItem, SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import {
  formatInt,
  formatRub,
  formatSyncTime,
  hub,
  HubAskRow,
  HubButton,
  HubEmptyState,
  HubInput,
  HubPanel,
  HubPanelHeader,
  HubStatStrip,
  hubNumeric,
  hubSans,
} from "./hub-ui";
import { HubProductDrawer } from "./hub-product-drawer";
import { HubToast, useHubToast, type HubToastState } from "./hub-toast";

type EditState = {
  itemId: string;
  price: string;
  discount: string;
};

export function HubPrices({
  snapshot,
  connected,
  onUpdate,
  onAsk,
  focusId,
  onFocusConsumed,
}: {
  snapshot?: SellerCatalogSnapshot;
  connected?: boolean;
  onUpdate?: (items: SellerCatalogItem[]) => void;
  onAsk?: (prompt: string) => void;
  focusId?: string | null;
  onFocusConsumed?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "discounted" | "no-price">("all");
  const [selectedItem, setSelectedItem] = useState<SellerCatalogItem | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const priceLockRef = useRef(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkDiscount, setBulkDiscount] = useState("");
  const [bulkReady, setBulkReady] = useState(false);
  const [toast, setToast] = useState<HubToastState | null>(null);
  const { makeToast } = useHubToast();

  const items = useMemo(() => snapshot?.items ?? [], [snapshot]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((item) => {
        if (q) {
          const hay = `${item.title} ${item.vendorCode} ${item.externalId}`;
          if (!hay.toLowerCase().includes(q)) return false;
        }
        const price = item.discountedPrice ?? item.price;
        if (filter === "no-price") return price == null;
        if (filter === "discounted") return (item.discountPercent ?? 0) > 0;
        return true;
      })
      .sort(
        (a, b) =>
          (b.discountedPrice ?? b.price ?? -1) - (a.discountedPrice ?? a.price ?? -1)
      );
  }, [items, search, filter]);

  const startEdit = useCallback(
    (e: React.MouseEvent, item: SellerCatalogItem) => {
      e.stopPropagation();
      setEditState({
        itemId: item.id,
        price: item.price != null ? String(Math.round(item.price)) : "",
        discount: item.discountPercent != null ? String(item.discountPercent) : "",
      });
    },
    []
  );

  const cancelEdit = useCallback(() => {
    setEditState(null);
  }, []);

  useEffect(() => {
    if (!focusId) return;
    const item = items.find((row) => row.id === focusId);
    if (item) {
      setEditState({
        itemId: item.id,
        price: item.price != null ? String(Math.round(item.price)) : "",
        discount: item.discountPercent != null ? String(item.discountPercent) : "",
      });
    }
    onFocusConsumed?.();
  }, [focusId, items, onFocusConsumed]);

  const applyBulk = useCallback(async () => {
    if (!connected || !bulkReady) return;
    const discount = Number(bulkDiscount);
    if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
      setToast(makeToast("Скидка должна быть от 0 до 100", "error"));
      return;
    }
    const targets = items.filter((item) => picked.has(item.id));
    const updates = targets
      .map((item) => {
        const nmId = Number(item.externalId);
        if (!Number.isFinite(nmId)) return null;
        return { nmId, discount, expected: { price: item.price ?? null, discount: item.discountPercent ?? null } };
      })
      .filter((row): row is NonNullable<typeof row> => row != null);
    if (updates.length === 0) return;
    if (!claimPriceSubmit(priceLockRef)) return;
    setSaving(true);
    try {
      const result = await updateSellerHubPrices({ updates });
      const view = priceWriteView({
        outcome: result.outcome,
        uploadId: result.uploadId,
        error: result.error,
        read: result.verified ? "match" : result.outcome === "processed" ? "unread" : undefined,
      });
      appendHubJournal(priceJournalEntry({
        rows: targets.flatMap((item) => {
          const nmId = Number(item.externalId);
          if (!Number.isFinite(nmId)) return [];
          return [{ nmId, beforePrice: item.price, beforeDiscount: item.discountPercent, discount }];
        }),
        view: { ...view, text: result.message },
      }));
      setToast(makeToast(result.message, view.tone));
      if (!view.applyLocal) return;
      const next = items.map((item) => {
        if (!picked.has(item.id) || item.price == null) return item;
        return {
          ...item,
          discountPercent: discount,
          discountedPrice: Math.round(item.price * (1 - discount / 100)),
        };
      });
      onUpdate?.(next);
      setPicked(new Set());
      setBulkReady(false);
      setBulkDiscount("");
    } finally {
      releasePriceSubmit(priceLockRef);
      setSaving(false);
    }
  }, [connected, bulkDiscount, bulkReady, items, makeToast, onUpdate, picked]);

  const saveEdit = useCallback(
    async (item: SellerCatalogItem) => {
      if (!connected || !editState) return;

      const nmId = Number(item.externalId);
      if (!nmId) {
        setToast(makeToast("Не удалось определить nmID товара", "error"));
        return;
      }

      const priceVal = editState.price.trim() ? Number(editState.price) : undefined;
      const discountVal = editState.discount.trim() ? Number(editState.discount) : undefined;

      if (priceVal != null && (isNaN(priceVal) || priceVal < 0)) {
        setToast(makeToast("Введите корректную цену", "error"));
        return;
      }
      if (discountVal != null && (isNaN(discountVal) || discountVal < 0 || discountVal > 100)) {
        setToast(makeToast("Скидка должна быть от 0 до 100", "error"));
        return;
      }

      if (!claimPriceSubmit(priceLockRef)) return;
      setSaving(true);
      try {
        const result = await updateSellerHubPrices({
          updates: [{ nmId, price: priceVal, discount: discountVal, expected: { price: item.price ?? null, discount: item.discountPercent ?? null } }],
        });
        const view = priceWriteView({
          outcome: result.outcome,
          uploadId: result.uploadId,
          error: result.error,
          read: result.verified ? "match" : result.outcome === "processed" ? "unread" : undefined,
        });
        appendHubJournal(priceJournalEntry({
          rows: [{
            nmId,
            beforePrice: item.price,
            beforeDiscount: item.discountPercent,
            price: priceVal,
            discount: discountVal,
          }],
          view: { ...view, text: result.message },
        }));
        setToast(makeToast(result.message, view.tone));
        if (!view.applyLocal) return;

        const updatedItems = items.map((i) => {
          if (i.id !== item.id) return i;
          const newPrice = priceVal ?? i.price;
          const newDiscount = discountVal ?? i.discountPercent;
          const newDiscounted =
            newPrice != null && newDiscount != null
              ? Math.round(newPrice * (1 - newDiscount / 100))
              : i.discountedPrice;
          return { ...i, price: newPrice, discountPercent: newDiscount, discountedPrice: newDiscounted };
        });
        onUpdate?.(updatedItems);
        setEditState(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Ошибка при сохранении цены";
        appendHubJournal(priceJournalEntry({
          rows: [{
            nmId,
            beforePrice: item.price,
            beforeDiscount: item.discountPercent,
            price: priceVal,
            discount: discountVal,
          }],
          view: priceWriteView({ outcome: "failed", error: message }),
        }));
        setToast(makeToast(message, "error"));
      } finally {
        releasePriceSubmit(priceLockRef);
        setSaving(false);
      }
    },
    [connected, editState, items, makeToast, onUpdate]
  );

  if (items.length === 0) {
    return (
      <HubPanel className="flex min-h-[420px] flex-col">
        <HubEmptyState
          icon={<Tag className="h-7 w-7" />}
          title="Цены пока не загружены"
          description="Выгрузите каталог с категорией «Цены и скидки» в API-токене."
        />
      </HubPanel>
    );
  }

  const discounted = items.filter((item) => (item.discountPercent ?? 0) > 0).length;
  const noPrice = items.filter((item) => (item.discountedPrice ?? item.price) == null).length;
  const avgDiscount =
    discounted > 0
      ? Math.round(
          items
            .filter((item) => (item.discountPercent ?? 0) > 0)
            .reduce((sum, item) => sum + (item.discountPercent ?? 0), 0) / discounted
        )
      : 0;

  return (
    <div className="space-y-4">
      <HubStatStrip
        items={[
          { label: "Позиции", value: formatInt(items.length), hint: "с ценой в снимке" },
          { label: "Со скидкой", value: formatInt(discounted), tone: discounted > 0 ? "good" : "default" },
          { label: "Средняя скидка", value: discounted > 0 ? `${avgDiscount}%` : "—", hint: "только среди скидочных" },
          { label: "Без цены", value: formatInt(noPrice), tone: noPrice > 0 ? "danger" : "good" },
        ]}
      />
      <HubPanel>
        <div className="border-b px-5 py-4" style={{ borderColor: hub.borderSoft }}>
          <h2 className="text-[16px] font-semibold" style={hubSans}>Последние правки через KARTO</h2>
          <PriceJournal />
        </div>
      </HubPanel>
      <HubPanel>
        <HubPanelHeader
          title="Цены и скидки"
          hint={`Данные из WB API · ${formatSyncTime(snapshot?.syncedAt)}`}
        />

        <div
          className="flex flex-wrap items-center gap-3 border-b px-5 py-3 sm:px-6"
          style={{ borderColor: hub.borderSoft }}
        >
          <div className="min-w-[200px] flex-1">
            <HubInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по названию или артикулу"
            />
          </div>
          <div className="flex gap-1 rounded-[11px] p-1" style={{ backgroundColor: hub.surfaceMuted }}>
            {(
              [
                ["all", "Все"],
                ["discounted", "Со скидкой"],
                ["no-price", "Без цены"],
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
          <HubButton
            size="sm"
            variant="secondary"
            disabled={picked.size === 0}
            onClick={() => setBulkReady(true)}
          >
            Редактировать выбранные{picked.size > 0 ? ` (${picked.size})` : ""}
          </HubButton>
        </div>
        {bulkReady && picked.size > 0 ? (
          <div className="flex flex-wrap items-end gap-3 border-b px-5 py-3" style={{ borderColor: hub.borderSoft, backgroundColor: hub.greenSoft }}>
            <label className="text-[13px] font-semibold" style={{ color: hub.text }}>
              Скидка на выбранные, %
              <input
                type="number"
                min={0}
                max={100}
                value={bulkDiscount}
                onChange={(event) => setBulkDiscount(event.target.value)}
                className="mt-1 block w-28 rounded-[10px] border bg-white px-3 py-2"
                style={{ borderColor: hub.border, color: hub.text }}
              />
            </label>
            <HubButton size="sm" onClick={() => void applyBulk()} loading={saving} disabled={!connected}>
              Применить в WB
            </HubButton>
            <HubButton size="sm" variant="secondary" onClick={() => setBulkReady(false)}>
              Отмена
            </HubButton>
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left">
            <thead className="sticky top-0 z-10" style={{ backgroundColor: hub.surfaceMuted }}>
              <tr>
                {["Товар", "Артикул", "Цена", "Со скидкой", "Скидка %", ""].map((label) => (
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
              {visible.slice(0, 200).map((item) => {
                const final = item.discountedPrice ?? item.price;
                const base = item.price;
                const hasDiscount =
                  base != null && item.discountedPrice != null && item.discountedPrice < base;
                const isEditing = editState?.itemId === item.id;

                return (
                  <tr
                    key={item.id}
                    className={`group border-b transition-colors duration-150 ${isEditing ? "bg-[#B9FF4B]/16" : "cursor-pointer hover:bg-[#1C1915]/[0.04]"}`}
                    style={{ borderColor: hub.borderSoft }}
                    onClick={isEditing ? undefined : () => setSelectedItem(item)}
                  >
                    <td className="max-w-[240px] px-5 py-3 text-[13.5px] font-medium sm:px-6" style={{ color: hub.text }}>
                      <label className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={picked.has(item.id)}
                          onChange={() =>
                            setPicked((current) => {
                              const next = new Set(current);
                              if (next.has(item.id)) next.delete(item.id);
                              else next.add(item.id);
                              return next;
                            })
                          }
                          style={{ accentColor: hub.green }}
                        />
                        <span className="truncate">{item.title}</span>
                      </label>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 font-mono text-[12px] sm:px-6" style={{ color: hub.textSubtle }}>
                      {item.vendorCode}
                      <HubAskRow article={item.vendorCode} onAsk={onAsk} />
                    </td>

                    {isEditing ? (
                      <>
                        <td className="px-5 py-2 sm:px-6">
                          <input
                            type="number"
                            value={editState.price}
                            onChange={(e) => setEditState((s) => s ? { ...s, price: e.target.value } : s)}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="Цена ₽"
                            className="w-24 rounded-[8px] border px-2 py-1 text-[13px]"
                            style={{ borderColor: hub.inputBorder, backgroundColor: hub.inputBg, color: hub.text, ...hubSans }}
                          />
                        </td>
                        <td className="px-5 py-2 sm:px-6" />
                        <td className="px-5 py-2 sm:px-6">
                          <input
                            type="number"
                            value={editState.discount}
                            onChange={(e) => setEditState((s) => s ? { ...s, discount: e.target.value } : s)}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="Скидка %"
                            min={0}
                            max={100}
                            className="w-20 rounded-[8px] border px-2 py-1 text-[13px]"
                            style={{ borderColor: hub.inputBorder, backgroundColor: hub.inputBg, color: hub.text, ...hubSans }}
                          />
                        </td>
                        <td className="whitespace-nowrap px-5 py-2 sm:px-6">
                          <div className="flex items-center gap-1.5">
                            <HubButton size="sm" loading={saving} onClick={() => void saveEdit(item)}>
                              <Check className="h-3.5 w-3.5" />
                              Сохранить
                            </HubButton>
                            <button
                              type="button"
                              onClick={() => cancelEdit()}
                              className="rounded-[8px] p-1.5 transition-colors hover:bg-black/[0.05]"
                              style={{ color: hub.textMuted }}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td
                          className="px-5 py-3 text-[13.5px] sm:px-6"
                          style={{ ...hubSans, ...hubNumeric, color: hasDiscount ? hub.textSubtle : hub.text }}
                        >
                          {base != null ? (
                            <span className={hasDiscount ? "line-through" : "font-semibold"}>
                              {formatRub(base)}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td
                          className="px-5 py-3 text-[13.5px] font-semibold sm:px-6"
                          style={{ ...hubSans, ...hubNumeric, color: hub.text, backgroundColor: hub.blueSoft }}
                        >
                          {final != null ? formatRub(final) : "—"}
                        </td>
                        <td
                          className="px-5 py-3 text-[13.5px] font-semibold sm:px-6"
                          style={{
                            ...hubSans,
                            ...hubNumeric,
                            color: hub.text,
                            backgroundColor: item.discountPercent ? hub.greenSoft : undefined,
                          }}
                        >
                          {item.discountPercent != null && item.discountPercent > 0
                            ? `−${item.discountPercent}%`
                            : item.discountPercent === 0
                              ? "0%"
                              : "—"}
                        </td>
                        <td className="px-5 py-3 sm:px-6">
                          {connected ? (
                            <button
                              type="button"
                              onClick={(e) => startEdit(e, item)}
                              className="rounded-[7px] p-1.5 opacity-0 transition-all group-hover:opacity-100 hover:bg-black/[0.06]"
                              style={{ color: hub.textMuted }}
                              aria-label="Редактировать цену"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </HubPanel>

      {selectedItem ? (
        <HubProductDrawer
          item={selectedItem}
          promotions={snapshot?.promotions}
          onClose={() => setSelectedItem(null)}
        />
      ) : null}

      {toast ? <HubToast toast={toast} onDismiss={() => setToast(null)} /> : null}
    </div>
  );
}

function PriceJournal() {
  const rows = readHubJournal().filter((row) => /цен|скид/i.test(row.title)).slice(0, 4);
  if (rows.length === 0) {
    return (
      <p className="mt-2 text-[13px]" style={{ color: hub.textMuted }}>
        Правок через KARTO ещё не было. История по каждому SKU в снимке WB не хранится — здесь только то, что вы применили.
      </p>
    );
  }
  return (
    <ul className="mt-3 space-y-2">
      {rows.map((row) => (
        <li key={row.id} className="text-[13px]" style={{ color: hub.text }}>
          <span className="font-semibold">{row.title}</span>
          <span style={{ color: hub.textMuted }}> · {new Date(row.at).toLocaleString("ru-RU")}</span>
        </li>
      ))}
    </ul>
  );
}
