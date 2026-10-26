"use client";

import { X } from "lucide-react";
import { writeHubCardSeed } from "@/lib/seller-hub/card-seed";
import type { SellerCatalogItem } from "@/lib/seller-hub/types";
import { formatInt, formatRub, hub, HubButton, hubSans } from "./hub-ui";

export function coverDays(
  item: SellerCatalogItem,
  ordersByNm: Map<number, number>,
  periodDays: number,
): number | null {
  if (item.totalStock == null || item.totalStock <= 0 || periodDays <= 0) return null;
  const nm = Number(item.externalId);
  if (!Number.isFinite(nm)) return null;
  const count = ordersByNm.get(nm) ?? 0;
  if (count <= 0) return null;
  return Math.round((item.totalStock * periodDays) / count);
}

export function cardFill(item: SellerCatalogItem): { score: number; gaps: string[] } {
  const gaps: string[] = [];
  const checks: Array<[boolean, string]> = [
    [Boolean(item.imageUrl), "нет фото"],
    [item.title.trim().length >= 20, "название короче 20 символов"],
    [(item.description?.trim().length ?? 0) >= 200, "описание короче 200 символов или его нет в снимке"],
    [Boolean(item.brand), "не указан бренд"],
    [Boolean(item.category), "не указана категория"],
    [
      item.dimensions?.length != null && item.dimensions.width != null && item.dimensions.height != null,
      "нет габаритов",
    ],
  ];
  let filled = 0;
  for (const [ok, gap] of checks) {
    if (ok) filled += 1;
    else gaps.push(gap);
  }
  return { score: Math.round((filled / checks.length) * 100), gaps };
}

export function auditChatText(
  item: SellerCatalogItem,
  days: number | null,
  periodDays: number,
): string {
  const fill = cardFill(item);
  const price = item.discountedPrice ?? item.price;
  const priceLine =
    price == null
      ? "Цены в снимке нет."
      : `Цена ${formatRub(price)}${item.discountPercent != null && item.discountPercent > 0 ? `, скидка ${item.discountPercent}%` : ", скидки нет"}. Сравнение с конкурентами не считаю: в снимке WB нет их цен.`;
  const stockLine =
    item.totalStock == null
      ? "Остаток в снимке не пришёл."
      : days != null
        ? `Остаток ${formatInt(item.totalStock)} шт. По заказам этого артикула за ${periodDays} дн. хватит примерно на ${formatInt(days)} дн., до ${runOutDate(days)}.`
        : `Остаток ${formatInt(item.totalStock)} шт. Заказов этого артикула в снимке нет, срок запаса не считаю.`;
  const fillLine =
    fill.gaps.length === 0
      ? "Карточка заполнена: фото, название, описание, бренд, категория и габариты на месте."
      : `В карточке не хватает: ${fill.gaps.join("; ")}.`;
  return [
    "АУДИТ",
    `Аудит «${item.title}»`,
    fillLine,
    stockLine,
    priceLine,
    "В кабинет ничего не отправляю. Описание можно собрать в генераторе, цену поменять в разделе цен.",
  ].join("\n");
}

function runOutDate(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

export function HubCardAudit({
  item,
  days,
  periodDays,
  onClose,
  onOpenPrices,
}: {
  item: SellerCatalogItem;
  days: number | null;
  periodDays: number;
  onClose: () => void;
  onOpenPrices?: (itemId: string) => void;
}) {
  const fill = cardFill(item);
  const price = item.discountedPrice ?? item.price;
  const priceText = price != null ? formatRub(price) : "цены нет в снимке";
  const stockText =
    item.totalStock == null
      ? "Остаток в снимке не пришёл."
      : days != null
        ? `При темпе заказов из снимка (${periodDays} дн.) ${formatInt(item.totalStock)} шт хватит примерно на ${formatInt(days)} дн.`
        : `${formatInt(item.totalStock)} шт. Заказов этого артикула в снимке нет, поэтому срок запаса не считаю.`;

  const seed = () =>
    writeHubCardSeed({
      title: item.title,
      vendorCode: item.vendorCode,
      externalId: item.externalId,
      description: item.description ?? "",
    });

  return (
    <aside
      className="fixed bottom-5 right-5 z-50 flex w-[min(420px,calc(100%-2rem))] flex-col overflow-hidden rounded-md border bg-white shadow-[0_16px_40px_rgba(14,17,22,0.16)]"
      style={{ borderColor: hub.border }}
      role="dialog"
      aria-label="Аудит карточки"
    >
      <div className="flex items-start justify-between gap-3 border-b px-4 py-3" style={{ borderColor: hub.borderSoft }}>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.06em]" style={{ color: hub.textSubtle }}>
            Аудит карточки
          </p>
          <p className="mt-1 line-clamp-2 text-[14px] font-semibold" style={{ ...hubSans, color: hub.text }}>
            {item.title}
          </p>
        </div>
        <button type="button" onClick={onClose} className="rounded-[4px] p-1 hover:bg-black/[0.05]" aria-label="Закрыть аудит">
          <X className="h-4 w-4" style={{ color: hub.textMuted }} />
        </button>
      </div>
      <div className="space-y-3 px-4 py-4">
        <p className="text-[13.5px] leading-[1.55]" style={{ ...hubSans, color: hub.text }}>
          Заполненность {fill.score}/100
          {fill.gaps.length > 0 ? `: ${fill.gaps.join("; ")}.` : ": фото, название, описание, бренд, категория и габариты на месте."}
        </p>
        <p className="text-[13.5px] leading-[1.55]" style={{ ...hubSans, color: hub.text }}>
          {stockText}
        </p>
        <p className="text-[13.5px] leading-[1.55]" style={{ ...hubSans, color: hub.text }}>
          Цена в кабинете {priceText}
          {item.discountPercent != null && item.discountPercent > 0 ? `, скидка ${item.discountPercent}%` : ""}.
          Медианы конкурентов в снимке WB нет, поэтому сравнение с нишей не показываю.
        </p>
      </div>
      <div className="flex flex-wrap gap-2 border-t px-4 py-3" style={{ borderColor: hub.borderSoft }}>
        <a href="/studio/description" onClick={seed}>
          <HubButton size="sm">Обновить описание</HubButton>
        </a>
        <HubButton size="sm" variant="secondary" onClick={() => onOpenPrices?.(item.id)}>
          Изменить цену
        </HubButton>
      </div>
    </aside>
  );
}
