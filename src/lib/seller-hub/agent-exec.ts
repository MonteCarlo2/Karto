import type { AgentAction } from "@/lib/seller-hub/ads-agent-engine";
import {
  changeSellerHubAdBid,
  manageSellerHubPromotion,
  createSellerHubAdCampaign,
  depositSellerHubAdBudget,
  addSellerHubAdMinusPhrases,
  addSellerHubAdNm,
  setSellerHubAdDailyLimit,
  setSellerHubAdPlacements,
  removeSellerHubAdNm,
  toggleSellerHubAd,
  updateSellerHubCard,
  updateSellerHubClubDiscount,
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
    case "resume":
      return `запустить кампанию «${name(a.campaignId)}»`;
    case "add_nm":
      return `вернуть товар ${a.nmId} в кампанию «${name(a.campaignId)}»`;
    case "remove_nm":
      return `убрать товар ${a.nmId} из кампании «${name(a.campaignId)}»`;
    case "create_campaign":
      return `создать тестовую кампанию «${a.name}» (без запуска и без списания денег)`;
    case "price":
      return `изменить цену товара ${a.nmId} для покупателя с ${a.currentRub.toLocaleString("ru-RU")} ₽ до ${a.targetRub.toLocaleString("ru-RU")} ₽ (скидка продавца ${a.discount}% остаётся)`;
    case "characteristics":
      return `изменить характеристики карточки ${a.nmId}: ${a.changes.map((c) => `${c.name}: ${c.previous ?? "пусто"} → ${c.value}`).slice(0, 3).join("; ")}`;
    case "minus_phrases":
      return `добавить минус-фразы (${a.queries.length}) в кампанию «${name(a.advertId)}»: ${a.queries.slice(0, 3).join(", ")}${a.queries.length > 3 ? "…" : ""}`;
    case "daily_limit":
      return a.enabled ? `дневной лимит кампании «${name(a.campaignId)}»: ${a.limitRub.toLocaleString("ru-RU")} ₽ в сутки` : `отключить дневной лимит кампании «${name(a.campaignId)}»`;
    case "placements":
      return `места показа кампании «${name(a.advertId)}»: поиск ${a.search ? "да" : "нет"}, рекомендации ${a.recommendations ? "да" : "нет"}`;
    case "promo_join":
      return `войти в акцию «${a.promoName}»: цена товара ${a.nmId} станет ${a.planPrice.toLocaleString("ru-RU")} ₽`;
    case "club_discount":
      return `изменить скидку WB Клуба товара ${a.nmId}: ${a.previousPercent ?? "?"}% → ${a.clubPercent}%`;
    case "promo_exit":
      return `убрать товар ${a.nmId} из акции «${a.promoName}»`;
    case "content":
      return `${a.field === "title" ? "изменить название" : "изменить описание"} карточки ${a.nmId}: «${a.previousText.slice(0, 60)}${a.previousText.length > 60 ? "…" : ""}» → «${a.text.slice(0, 60)}${a.text.length > 60 ? "…" : ""}»`;
    case "bid":
      return `поставить ставку ${rub2(a.bidRub)} за 1000 показов на товар ${a.nmId} в кампании «${name(a.advertId)}»`;
  }
}

export type AgentExecResult = { ok: boolean; error?: string; createdId?: string | null };

export async function executeAgentAction(a: AgentAction): Promise<AgentExecResult> {
  if (a.type === "deposit") return depositSellerHubAdBudget({ campaignId: Number(a.campaignId), sum: a.sumRub });
  if (a.type === "pause") return toggleSellerHubAd({ campaignId: Number(a.campaignId), action: "pause" });
  if (a.type === "resume") return toggleSellerHubAd({ campaignId: Number(a.campaignId), action: "start" });
  if (a.type === "add_nm") return addSellerHubAdNm({ advertId: Number(a.campaignId), nmId: Number(a.nmId) });
  if (a.type === "remove_nm") return removeSellerHubAdNm({ advertId: Number(a.campaignId), nmId: Number(a.nmId) });
  if (a.type === "create_campaign") {
    const created = await createSellerHubAdCampaign({ nmId: Number(a.nmId), name: a.name });
    return { ok: created.ok, error: created.error, createdId: created.ok && created.campaignId ? String(created.campaignId) : null };
  }
  if (a.type === "characteristics") return updateSellerHubCard({ nmId: Number(a.nmId), characteristics: a.changes.map((c) => ({ id: c.charcId, value: c.value, numeric: c.numeric })) });
  if (a.type === "minus_phrases") {
    const res = await addSellerHubAdMinusPhrases({ advertId: Number(a.advertId), nmId: Number(a.nmId), queries: a.queries });
    return { ok: res.ok, error: res.error };
  }
  if (a.type === "daily_limit") return setSellerHubAdDailyLimit({ advertId: Number(a.campaignId), enabled: a.enabled, dailyLimit: a.limitRub, carryOver: a.carryOver });
  if (a.type === "placements") return setSellerHubAdPlacements({ advertId: Number(a.advertId), search: a.search, recommendations: a.recommendations });
  if (a.type === "club_discount") return updateSellerHubClubDiscount({ nmId: Number(a.nmId), clubDiscount: a.clubPercent });
  if (a.type === "promo_join") {
    const nm = Number(a.nmId);
    const res = await manageSellerHubPromotion({
      promotionId: Number(a.promoId),
      nmIds: [nm],
      action: "add",
      isAuto: false,
      promoTermsByNmId: { [nm]: { planPrice: a.planPrice, ...(a.planDiscount != null ? { planDiscount: a.planDiscount } : {}) } },
      catalogByNmId: { [nm]: { basePrice: a.basePrice ?? undefined, discountedPrice: a.discountedPrice ?? undefined, discountPercent: a.discountPercent ?? undefined } },
    });
    return { ok: res.ok, error: res.error };
  }
  if (a.type === "promo_exit") {
    const res = await manageSellerHubPromotion({ promotionId: Number(a.promoId), nmIds: [Number(a.nmId)], action: "remove" });
    return { ok: res.ok, error: res.error };
  }
  if (a.type === "content") {
    // Отправляется только изменённое поле: остальное в карточке сервер оставляет как есть.
    return updateSellerHubCard({ nmId: Number(a.nmId), ...(a.field === "title" ? { title: a.text } : { description: a.text }) });
  }
  if (a.type === "price") {
    const res = await updateSellerHubPrices({ updates: [{ nmId: Number(a.nmId), price: a.baseRub, discount: a.discount, expected: { price: a.currentBaseRub ?? null, discount: a.discount } }] });
    // Цена принята WB, если загрузка подтверждена или обработана; остальное считаем неудачей и показываем сообщение WB.
    return { ok: res.outcome === "confirmed" || res.outcome === "processed", error: res.ok ? undefined : (res.error ?? res.message) };
  }
  if (a.type !== "bid") return { ok: false, error: "Неизвестное действие" };
  return changeSellerHubAdBid({ advertId: Number(a.advertId), nmId: Number(a.nmId), bidRub: a.bidRub });
}

/** Обновлённый список кампаний после успешного действия: экран показывает результат, пока данные кабинета не перечитаны. */
export function applyActionToCampaigns(a: AgentAction, campaigns: SellerAdCampaignRow[], createdId?: string | null): SellerAdCampaignRow[] {
  switch (a.type) {
    case "deposit":
      return campaigns.map((c) => (c.id === a.campaignId ? { ...c, budget: (c.budget ?? 0) + a.sumRub } : c));
    case "pause":
      return campaigns.map((c) => (c.id === a.campaignId ? { ...c, status: 4, statusLabel: "На паузе" } : c));
    case "resume":
      return campaigns.map((c) => (c.id === a.campaignId ? { ...c, status: 9, statusLabel: "Идут показы" } : c));
    case "add_nm":
      return campaigns;
    case "remove_nm":
      return campaigns.map((c) => (c.id === a.campaignId ? { ...c, bids: (c.bids ?? []).filter((b) => b.nmId !== a.nmId) } : c));
    case "create_campaign":
      return createdId ? [...campaigns, { id: createdId, name: a.name, status: 4, statusLabel: "Готова к запуску", paymentType: "cpm", budget: 0, bidType: "manual", bids: [] }] : campaigns;
    case "daily_limit":
      return campaigns.map((c) => (c.id === a.campaignId ? { ...c, dailyLimit: a.enabled ? { limitRub: a.limitRub, carryOver: a.carryOver, requiredRub: c.dailyLimit?.requiredRub ?? null } : null } : c));
    case "price":
    case "content":
    case "promo_exit":
    case "promo_join":
    case "club_discount":
    case "minus_phrases":
    case "characteristics":
      return campaigns;
    case "placements":
      return campaigns.map((c) => (c.id === a.advertId ? { ...c, placements: { search: a.search, recommendations: a.recommendations } } : c));
    case "bid":
      return campaigns.map((c) => (c.id === a.advertId ? { ...c, bids: (c.bids ?? []).map((b) => (b.nmId === a.nmId ? { ...b, searchRub: a.bidRub } : b)) } : c));
  }
}
