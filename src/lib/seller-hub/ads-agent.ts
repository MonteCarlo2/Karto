/**
 * Рекламный агент: правила и их проверка. Чистые функции без обращений к WB и базе.
 * Агент только решает, что сделать; выполняет решение отдельный слой (с подтверждением человека или в режиме автопилота),
 * который обязан повторно проверить границы из ads-deposit.ts и ads-bid.ts.
 */

import { AD_DEPOSIT_MAX_RUB } from "@/lib/seller-hub/ads-deposit";
import type { SellerAdCampaignRow } from "@/lib/seller-hub/types";

/** suggest — агент только предлагает, человек нажимает кнопку; auto — применяет сам в рамках лимитов правила. */
export type AdAgentMode = "suggest" | "auto";

export type AutopayParams = {
  /** Пополнять, когда остаток бюджета кампании стал меньше этой суммы, ₽. */
  minBudgetRub: number;
  /** На сколько пополнять за один раз, ₽. */
  topUpRub: number;
  /** Сколько всего можно пополнить в эту кампанию за сутки, ₽. Без этого лимита автопополнение не работает. */
  dailyCapRub: number;
};

export type AutopayRule = { kind: "autopay"; mode: AdAgentMode; params: AutopayParams };

export type AdAgentRule = AutopayRule;

export type AutopayDecision = {
  campaignId: string;
  campaignName: string;
  /** Сколько пополнить сейчас, ₽ (не больше остатка суточного лимита и не больше счёта продвижения). */
  sumRub: number;
  reason: string;
};

export type AutopaySkip = { campaignId: string; campaignName: string; reason: string };

/** Проверка параметров правила автопополнения. null — всё в порядке, иначе текст ошибки для человека. */
export function validateAutopayParams(params: AutopayParams): string | null {
  const ints = [params.minBudgetRub, params.topUpRub, params.dailyCapRub];
  if (!ints.every((value) => Number.isInteger(value) && value > 0)) {
    return "Все суммы — целые положительные числа рублей";
  }
  if (params.topUpRub > AD_DEPOSIT_MAX_RUB) {
    return `Разовое пополнение не больше ${AD_DEPOSIT_MAX_RUB.toLocaleString("ru-RU")} ₽`;
  }
  if (params.dailyCapRub < params.topUpRub) {
    return "Суточный лимит не может быть меньше одного пополнения";
  }
  return null;
}

/**
 * Что пополнить по правилу автопополнения.
 * - только активные кампании с известным остатком бюджета;
 * - пополняем, когда остаток ниже порога;
 * - за сутки не больше dailyCapRub (depositedTodayRub — уже пополненное сегодня по кампании);
 * - не больше, чем есть на счёте продвижения: если счёт неизвестен или пуст — пропускаем с причиной.
 */
export function evaluateAutopay(input: {
  params: AutopayParams;
  campaigns: SellerAdCampaignRow[];
  /** Пополнено сегодня по кампаниям (id → ₽). */
  depositedTodayRub: Record<string, number>;
  /** Счёт продвижения, ₽. null — неизвестен. */
  accountRub: number | null;
}): { deposits: AutopayDecision[]; skipped: AutopaySkip[] } {
  const invalid = validateAutopayParams(input.params);
  const deposits: AutopayDecision[] = [];
  const skipped: AutopaySkip[] = [];
  if (invalid) return { deposits, skipped };

  let account = input.accountRub;
  for (const campaign of input.campaigns) {
    if (campaign.status !== 9 || campaign.budget == null) continue;
    if (campaign.budget >= input.params.minBudgetRub) continue;
    const name = campaign.name ?? campaign.id;
    const left = input.params.dailyCapRub - (input.depositedTodayRub[campaign.id] ?? 0);
    if (left <= 0) {
      skipped.push({ campaignId: campaign.id, campaignName: name, reason: "Суточный лимит автопополнения исчерпан" });
      continue;
    }
    if (account == null) {
      skipped.push({ campaignId: campaign.id, campaignName: name, reason: "Неизвестен остаток на счёте продвижения" });
      continue;
    }
    const sum = Math.min(input.params.topUpRub, left, Math.floor(account));
    if (sum <= 0) {
      skipped.push({ campaignId: campaign.id, campaignName: name, reason: "На счёте продвижения нет денег" });
      continue;
    }
    account -= sum;
    deposits.push({
      campaignId: campaign.id,
      campaignName: name,
      sumRub: sum,
      reason: `Остаток бюджета ${Math.round(campaign.budget).toLocaleString("ru-RU")} ₽ ниже порога ${input.params.minBudgetRub.toLocaleString("ru-RU")} ₽`,
    });
  }
  return { deposits, skipped };
}
