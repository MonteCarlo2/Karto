import type { AgentAction } from "@/lib/seller-hub/ads-agent-engine";
import {
  changeSellerHubAdBid,
  createSellerHubAdCampaign,
  depositSellerHubAdBudget,
  removeSellerHubAdNm,
  toggleSellerHubAd,
  updateSellerHubPrices,
} from "@/lib/seller-hub/client-api";
import type { SellerAdCampaignRow } from "@/lib/seller-hub/types";

/**
 * Исполнитель действий агента рекламы (браузерная сторона). Каждое действие идёт в серверный маршрут с теми же проверками,
 * что и у ручных кнопок; запись попадает в журнал действий. Человек подтверждает действие до вызова.
 */

const rub2 = (v: number) => `${v.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`;

export function describeAgentAction(a: AgentAction, campaigns: SellerAdCampaignRow[]): string {
  const name = (id: string) => campaigns.find((c) => c.id === id)?.name ?? id;
  switch (a.type) {
    case "deposit":
      return `пополнить кампанию «${name(a.campaignId)}» на ${a.sumRub.toLocaleString("ru-RU")} ₽ со счёта продвижения`;
    case "pause":
      return `поставить кампанию «${name(a.campaignId)}» на паузу`;
    case "remove_nm":
      return `убрать товар ${a.nmId} из кампании «${name(a.campaignId)}»`;
    case "create_campaign":
      return `создать тестовую кампанию «${a.name}» (без запуска и без списания денег)`;
    case "price":
      return `изменить цену товара ${a.nmId} для покупателя с ${a.currentRub.toLocaleString("ru-RU")} ₽ до ${a.targetRub.toLocaleString("ru-RU")} ₽ (скидка продавца ${a.discount}% остаётся)`;
    case "bid":
      return `поставить ставку ${rub2(a.bidRub)} за 1000 показов на товар ${a.nmId} в кампании «${name(a.advertId)}»`;
  }
}

export type AgentExecResult = { ok: boolean; error?: string; createdId?: string | null };

export async function executeAgentAction(a: AgentAction): Promise<AgentExecResult> {
  if (a.type === "deposit") return depositSellerHubAdBudget({ campaignId: Number(a.campaignId), sum: a.sumRub });
  if (a.type === "pause") return toggleSellerHubAd({ campaignId: Number(a.campaignId), action: "pause" });
  if (a.type === "remove_nm") return removeSellerHubAdNm({ advertId: Number(a.campaignId), nmId: Number(a.nmId) });
  if (a.type === "create_campaign") {
    const created = await createSellerHubAdCampaign({ nmId: Number(a.nmId), name: a.name });
    return { ok: created.ok, error: created.error, createdId: created.ok && created.campaignId ? String(created.campaignId) : null };
  }
  if (a.type === "price") {
    const res = await updateSellerHubPrices({ updates: [{ nmId: Number(a.nmId), price: a.baseRub, discount: a.discount, expected: { price: a.currentBaseRub ?? null, discount: a.discount } }] });
    // Цена принята WB, если загрузка подтверждена или обработана; остальное считаем неудачей и показываем сообщение WB.
    return { ok: res.outcome === "confirmed" || res.outcome === "processed", error: res.ok ? undefined : (res.error ?? res.message) };
  }
  return changeSellerHubAdBid({ advertId: Number(a.advertId), nmId: Number(a.nmId), bidRub: a.bidRub });
}

/** Обновлённый список кампаний после успешного действия: экран показывает результат, пока данные кабинета не перечитаны. */
export function applyActionToCampaigns(a: AgentAction, campaigns: SellerAdCampaignRow[], createdId?: string | null): SellerAdCampaignRow[] {
  switch (a.type) {
    case "deposit":
      return campaigns.map((c) => (c.id === a.campaignId ? { ...c, budget: (c.budget ?? 0) + a.sumRub } : c));
    case "pause":
      return campaigns.map((c) => (c.id === a.campaignId ? { ...c, status: 4, statusLabel: "На паузе" } : c));
    case "remove_nm":
      return campaigns.map((c) => (c.id === a.campaignId ? { ...c, bids: (c.bids ?? []).filter((b) => b.nmId !== a.nmId) } : c));
    case "create_campaign":
      return createdId ? [...campaigns, { id: createdId, name: a.name, status: 4, statusLabel: "Готова к запуску", paymentType: "cpm", budget: 0, bidType: "manual", bids: [] }] : campaigns;
    case "price":
      return campaigns;
    case "bid":
      return campaigns.map((c) => (c.id === a.advertId ? { ...c, bids: (c.bids ?? []).map((b) => (b.nmId === a.nmId ? { ...b, searchRub: a.bidRub } : b)) } : c));
  }
}
