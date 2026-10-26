/** Пополнение бюджета рекламной кампании: проверка запроса до обращения к WB. Деньги двигаются только при явном подтверждении. */

/** Страховочный потолок разовой суммы, ₽. Больше пополнять в KARTO нельзя: крупные суммы — в кабинете WB. */
export const AD_DEPOSIT_MAX_RUB = 100_000;

export type AdDepositRequest = {
  campaignId: number;
  /** Целое число рублей. */
  sum: number;
};

export type AdDepositParse = { ok: true; request: AdDepositRequest } | { ok: false; error: string };

/**
 * Разбор тела запроса. Требуем:
 * - целый campaignId > 0;
 * - целую сумму от 1 до AD_DEPOSIT_MAX_RUB;
 * - confirmSum, равный sum: подтверждение суммы, которую человек видел на экране.
 */
export function parseAdDepositRequest(body: unknown): AdDepositParse {
  if (typeof body !== "object" || body === null) return { ok: false, error: "Нужен JSON" };
  const { campaignId, sum, confirmSum } = body as Record<string, unknown>;
  if (typeof campaignId !== "number" || !Number.isInteger(campaignId) || campaignId <= 0) {
    return { ok: false, error: "Укажите кампанию" };
  }
  if (typeof sum !== "number" || !Number.isInteger(sum) || sum < 1) {
    return { ok: false, error: "Сумма пополнения — целое число рублей" };
  }
  if (sum > AD_DEPOSIT_MAX_RUB) {
    return {
      ok: false,
      error: `Через KARTO можно пополнить не больше ${AD_DEPOSIT_MAX_RUB.toLocaleString("ru-RU")} ₽ за раз`,
    };
  }
  if (confirmSum !== sum) {
    return { ok: false, error: "Сумма не подтверждена" };
  }
  return { ok: true, request: { campaignId, sum } };
}

/** Тело запроса к WB: источник — счёт продвижения (type 0), в ответе вернуть новый бюджет. */
export function adDepositWbBody(request: AdDepositRequest): { sum: number; type: 0; return: true } {
  return { sum: request.sum, type: 0, return: true };
}
