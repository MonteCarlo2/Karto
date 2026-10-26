"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Ticket } from "lucide-react";
import { HubPromoBoard } from "./hub-promo-board";
import { loadSellerHubFunnel, loadSellerHubRealization, manageSellerHubPromotion } from "@/lib/seller-hub/client-api";
import { appendHubJournal } from "@/lib/seller-hub/journal";
import { recordVerifiedPromoEntry } from "@/lib/seller-hub/promo-observations";
import { funnelNeedsReload } from "@/lib/services/wildberries/funnel-parse";
import type { SellerCatalogItem, SellerCatalogSnapshot, SellerFunnelSnapshot, SellerRealizationSnapshot } from "@/lib/seller-hub/types";
import { hub, HubEmptyState, HubPanel, hubSans } from "./hub-ui";
import { HubToast, useHubToast, type HubToastState } from "./hub-toast";

const PROMO_TERMS_STORAGE_PREFIX = "karto-wb-promo-terms";

type StoredPromoTerms = {
  discount?: number;
  planPrice?: number;
  planDiscount?: number;
  qualifiedPrice?: number;
};

function writeStoredPromoTerms(promotionId: number, nmId: number, terms: StoredPromoTerms): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${PROMO_TERMS_STORAGE_PREFIX}:${promotionId}:${nmId}`, JSON.stringify(terms));
  } catch {
    /* ignore quota */
  }
}

export function HubPromotions({
  snapshot,
  connected,
  catalogItems,
  onUpdate,
  onRealization,
  onFunnel,
}: {
  snapshot?: SellerCatalogSnapshot;
  connected?: boolean;
  catalogItems?: SellerCatalogItem[];
  onUpdate?: (items: SellerCatalogItem[]) => void;
  onRealization?: (realization: SellerRealizationSnapshot) => void;
  onFunnel?: (funnel: SellerFunnelSnapshot) => void;
  onAsk?: (prompt: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<HubToastState | null>(null);
  const { makeToast } = useHubToast();

  useEffect(() => {
    if (!connected || !onRealization || (snapshot?.items.length ?? 0) === 0) return;
    const realization = snapshot?.realization;
    if (realization?.loadedAt) return;
    let cancelled = false;
    void loadSellerHubRealization().then((result) => {
      if (cancelled || !result.realization) return;
      onRealization(result.realization);
    });
    return () => {
      cancelled = true;
    };
  }, [connected, onRealization, snapshot?.items.length, snapshot?.realization?.error, snapshot?.realization?.loadedAt, snapshot?.realization?.version]);

  useEffect(() => {
    if (!connected || !onFunnel || (snapshot?.items.length ?? 0) === 0) return;
    const funnel = snapshot?.funnel;
    if (!funnelNeedsReload(funnel, snapshot?.syncedAt)) return;
    let cancelled = false;
    void loadSellerHubFunnel().then((result) => {
      if (cancelled || !result.funnel) return;
      onFunnel(result.funnel);
    });
    return () => {
      cancelled = true;
    };
  }, [connected, onFunnel, snapshot?.items.length, snapshot?.funnel?.error, snapshot?.funnel?.loadedAt, snapshot?.funnel?.version, snapshot?.syncedAt]);

  const promotions = useMemo(() => snapshot?.promotions ?? [], [snapshot]);
  const items = useMemo(() => snapshot?.items ?? [], [snapshot]);
  const allCatalogItems = useMemo(() => catalogItems ?? items, [catalogItems, items]);

  const promoItems = useMemo(() => {
    const byPromo = new Map<string, SellerCatalogItem[]>();
    for (const item of allCatalogItems) {
      for (const pid of item.promotionIds ?? []) {
        const list = byPromo.get(pid) ?? [];
        list.push(item);
        byPromo.set(pid, list);
      }
    }
    return byPromo;
  }, [allCatalogItems]);

  const promoWarnings = useMemo(
    () =>
      (snapshot?.warnings ?? []).filter(
        (warning) =>
          warning.toLowerCase().includes("акц") ||
          warning.toLowerCase().includes("promo") ||
          warning.toLowerCase().includes("продвижение") ||
          warning.toLowerCase().includes("calendar"),
      ),
    [snapshot],
  );

  const applyPromotionIdsUpdate = useCallback(
    (promoIdStr: string, nmIds: Set<number>, mode: "add" | "remove") => {
      const updatedItems = items.map((item) => {
        const nmId = Number(item.externalId);
        if (!nmIds.has(nmId)) return item;
        const existing = item.promotionIds ?? [];
        if (mode === "add") {
          if (existing.includes(promoIdStr)) return item;
          return { ...item, promotionIds: [...existing, promoIdStr] };
        }
        return { ...item, promotionIds: existing.filter((id) => id !== promoIdStr) };
      });
      onUpdate?.(updatedItems);
    },
    [items, onUpdate],
  );

  const handleExit = useCallback(
    async (promo: { id: string; name: string }, nmIds: number[]): Promise<boolean> => {
      if (!connected || nmIds.length === 0) return false;
      const promotionId = Number(promo.id);
      setSaving(true);
      try {
        const result = await manageSellerHubPromotion({
          promotionId,
          nmIds,
          action: "remove",
        });
        if (!result.ok) {
          setToast(makeToast(result.error ?? "Не удалось сбросить скидку", "error"));
          return false;
        }
        applyPromotionIdsUpdate(String(promotionId), new Set(nmIds), "remove");
        appendHubJournal({
          title: "Скидка сброшена, чтобы выйти из цены акции",
          detail: `${promo.name}: ${nmIds.length} SKU`,
          actor: "user",
        });
        for (const nmId of nmIds) {
          const savedTerms = result.savedPromoTerms?.[nmId];
          const savedDiscount = result.savedDiscounts?.[nmId];
          if (savedTerms || savedDiscount != null) {
            writeStoredPromoTerms(promotionId, nmId, {
              discount: savedDiscount,
              planPrice: savedTerms?.planPrice,
              planDiscount: savedTerms?.planDiscount,
              qualifiedPrice: savedTerms?.qualifiedPrice,
            });
            if (savedDiscount != null && savedDiscount > 0) {
              const item = allCatalogItems.find((row) => Number(row.externalId) === nmId);
              recordVerifiedPromoEntry(promotionId, nmId, savedDiscount, item?.price ?? undefined);
            }
          }
        }
        setToast(makeToast(result.warning ?? "WB принял скидку 0%", result.warning ? "warn" : "ok"));
        return true;
      } catch (err) {
        setToast(makeToast(err instanceof Error ? err.message : "Ошибка записи цены", "error"));
        return false;
      } finally {
        setSaving(false);
      }
    },
    [connected, allCatalogItems, applyPromotionIdsUpdate, makeToast],
  );

  const handleApply = useCallback(
    async (promo: { id: string; name: string; type?: string }, nmIds: number[]): Promise<boolean> => {
      if (!connected || nmIds.length === 0) return false;
      const promotionId = Number(promo.id);
      const promoTermsByNmId: Record<number, { planPrice?: number; planDiscount?: number }> = {};
      const catalogByNmId: Record<number, { basePrice?: number; discountedPrice?: number; discountPercent?: number }> = {};
      for (const nmId of nmIds) {
        const term = snapshot?.promotionEntryTerms?.[String(promotionId)]?.[String(nmId)];
        if (term) {
          promoTermsByNmId[nmId] = { planPrice: term.planPrice, planDiscount: term.planDiscount };
        }
        const item = allCatalogItems.find((row) => Number(row.externalId) === nmId);
        if (!item) continue;
        catalogByNmId[nmId] = {
          basePrice: item.price ?? undefined,
          discountedPrice: item.discountedPrice ?? undefined,
          discountPercent: item.discountPercent ?? undefined,
        };
      }
      setSaving(true);
      try {
        const result = await manageSellerHubPromotion({
          promotionId,
          nmIds,
          action: "add",
          isAuto: promo.type === "auto",
          promoTermsByNmId,
          catalogByNmId,
        });
        if (!result.ok) {
          setToast(makeToast(result.error ?? "Не удалось записать цену акции", "error"));
          return false;
        }
        applyPromotionIdsUpdate(String(promotionId), new Set(nmIds), "add");
        appendHubJournal({
          title: "Цена акции записана в WB",
          detail: `${promo.name}: ${nmIds.length} SKU`,
          actor: "user",
        });
        setToast(makeToast(result.warning ?? "WB принял цену акции", result.warning ? "warn" : "ok"));
        return true;
      } catch (err) {
        setToast(makeToast(err instanceof Error ? err.message : "Ошибка записи цены", "error"));
        return false;
      } finally {
        setSaving(false);
      }
    },
    [connected, allCatalogItems, applyPromotionIdsUpdate, makeToast, snapshot?.promotionEntryTerms],
  );

  if (promotions.length === 0) {
    return (
      <HubPanel className="flex min-h-[420px] flex-col gap-0">
        {promoWarnings.length > 0 ? (
          <div className="border-b px-5 py-3 sm:px-6" style={{ borderColor: hub.borderSoft }}>
            {promoWarnings.map((warning) => (
              <p key={warning} className="text-[13px] leading-[1.5]" style={{ ...hubSans, color: hub.warn }}>
                {warning}
              </p>
            ))}
          </div>
        ) : null}
        <HubEmptyState
          icon={<Ticket className="h-7 w-7" />}
          title="Акции не найдены"
          description={
            !snapshot
              ? "Нажмите «Обновить данные», чтобы загрузить акции из WB."
              : "WB не вернул акций с вашими товарами. Проверьте категорию «Цены и скидки» и обновите данные."
          }
        />
      </HubPanel>
    );
  }

  return (
    <div className="space-y-4">
      {promoWarnings.length > 0 ? (
        <div className="rounded-2xl border px-4 py-3" style={{ borderColor: "rgba(194,65,12,0.25)", backgroundColor: hub.warnSoft }}>
          {promoWarnings.map((warning) => (
            <p key={warning} className="text-[13px] leading-[1.5]" style={{ ...hubSans, color: hub.warn }}>
              {warning}
            </p>
          ))}
        </div>
      ) : null}
      <HubPromoBoard
        promotions={promotions}
        items={allCatalogItems}
        linkedByPromo={promoItems}
        terms={snapshot?.promotionEntryTerms}
        realization={snapshot?.realization}
        funnel={snapshot?.funnel}
        connected={connected}
        busy={saving}
        onApply={handleApply}
        onExit={handleExit}
      />
      {toast ? <HubToast toast={toast} onDismiss={() => setToast(null)} /> : null}
    </div>
  );
}
