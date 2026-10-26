/** Изменение ставки товара в рекламной кампании: проверка запроса до обращения к WB. Ставки у WB — в копейках. */

/** Потолок ставки, ₽ за 1000 показов: защита от опечатки с лишними нулями. */
export const AD_BID_MAX_RUB = 20_000;
/** Во сколько раз за один шаг можно поднять текущую ставку. Больше — только в кабинете WB. */
export const AD_BID_MAX_RAISE = 3;

export type AdBidRequest = {
  advertId: number;
  nmId: number;
  /** Ставка в поиске, ₽, не больше 2 знаков после запятой. */
  bidRub: number;
};

export type AdBidParse = { ok: true; request: AdBidRequest } | { ok: false; error: string };

export const rubToKopecks = (rub: number): number => Math.round(rub * 100);

/** Целое число копеек? 250.5 ₽ — да, 250.555 ₽ — нет. */
function isMoney(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
}

export function parseAdBidRequest(body: unknown): AdBidParse {
  if (typeof body !== "object" || body === null) return { ok: false, error: "Нужен JSON" };
  const { advertId, nmId, bidRub, confirmRub } = body as Record<string, unknown>;
  if (typeof advertId !== "number" || !Number.isInteger(advertId) || advertId <= 0) {
    return { ok: false, error: "Укажите кампанию" };
  }
  if (typeof nmId !== "number" || !Number.isInteger(nmId) || nmId <= 0) {
    return { ok: false, error: "Укажите артикул" };
  }
  if (typeof bidRub !== "number" || !(bidRub > 0) || !isMoney(bidRub)) {
    return { ok: false, error: "Ставка — положительное число рублей, не больше 2 знаков после запятой" };
  }
  if (bidRub > AD_BID_MAX_RUB) {
    return { ok: false, error: `Ставка не может быть больше ${AD_BID_MAX_RUB.toLocaleString("ru-RU")} ₽` };
  }
  if (confirmRub !== bidRub) return { ok: false, error: "Ставка не подтверждена" };
  return { ok: true, request: { advertId, nmId, bidRub } };
}

/**
 * Проверка новой ставки относительно минимальной (по данным WB) и текущей.
 * minKopecks / currentKopecks: null — не знаем, тогда эта проверка пропускается, а решение остаётся за WB.
 */
export function checkBidSafety(input: {
  newKopecks: number;
  currentKopecks: number | null;
  minKopecks: number | null;
}): { ok: true } | { ok: false; error: string } {
  const rub = (kopecks: number) => `${(kopecks / 100).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`;
  if (input.minKopecks != null && input.newKopecks < input.minKopecks) {
    return { ok: false, error: `Ставка ниже минимальной для этого товара: минимум ${rub(input.minKopecks)}` };
  }
  if (input.currentKopecks != null && input.currentKopecks > 0 && input.newKopecks > input.currentKopecks * AD_BID_MAX_RAISE) {
    return {
      ok: false,
      error: `Ставку нельзя поднять больше чем в ${AD_BID_MAX_RAISE} раза за один шаг (сейчас ${rub(input.currentKopecks)}). Повысьте её поэтапно.`,
    };
  }
  return { ok: true };
}
