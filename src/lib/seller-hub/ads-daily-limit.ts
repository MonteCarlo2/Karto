/**
 * Дневной лимит рекламной кампании (расход в сутки): проверка запроса до обращения к WB.
 * WB: PUT /api/advert/v0/daily-limits, только кампании с оплатой за клики (CPC), лимит от 1000 ₽.
 * Лимит только ограничивает расход, поэтому действие безопасное; отключение лимита снимает защиту и требует отдельного подтверждения.
 */

export const AD_DAILY_LIMIT_MIN_RUB = 1000;
export const AD_DAILY_LIMIT_MAX_RUB = 1_000_000;

export type AdDailyLimitRequest = { advertId: number; enabled: boolean; dailyLimit: number; carryOver: boolean };

export function parseAdDailyLimitRequest(body: unknown): { ok: true; request: AdDailyLimitRequest } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) return { ok: false, error: "Нужен JSON" };
  const { advertId, enabled, dailyLimit, carryOver, confirm } = body as Record<string, unknown>;
  if (typeof advertId !== "number" || !Number.isInteger(advertId) || advertId <= 0) return { ok: false, error: "Укажите кампанию" };
  if (typeof enabled !== "boolean") return { ok: false, error: "Укажите, включён ли лимит" };
  if (typeof dailyLimit !== "number" || !Number.isInteger(dailyLimit) || dailyLimit < AD_DAILY_LIMIT_MIN_RUB || dailyLimit > AD_DAILY_LIMIT_MAX_RUB) {
    return { ok: false, error: `Лимит в сутки: целое число рублей от ${AD_DAILY_LIMIT_MIN_RUB} до ${AD_DAILY_LIMIT_MAX_RUB}` };
  }
  const carry = carryOver === true;
  if (confirm !== `${advertId}:${enabled}:${dailyLimit}`) return { ok: false, error: "Изменение не подтверждено" };
  return { ok: true, request: { advertId, enabled, dailyLimit, carryOver: carry } };
}

/** Тело запроса WB. */
export const adDailyLimitWbBody = (r: AdDailyLimitRequest) => ({ advertIds: [r.advertId], enabled: r.enabled, dailyLimit: r.dailyLimit, carryOverEnabled: r.carryOver });
