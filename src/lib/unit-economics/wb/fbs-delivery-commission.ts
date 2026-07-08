/** Минимальное время доставки FBS до склада WB (ч) — «самая низкая» комиссия. */
export const WB_FBS_DELIVERY_HOURS_MIN = 30;

/** Максимальное время доставки FBS до склада WB (ч) — «самая высокая» комиссия. */
export const WB_FBS_DELIVERY_HOURS_MAX = 72;

/** Надбавка к базовой комиссии FBS за каждый час после минимума, п.п. */
export const WB_FBS_DELIVERY_SURCHARGE_PER_HOUR = 0.1;

export function clampWbFbsDeliveryHours(hours: number): number {
  if (!Number.isFinite(hours)) return WB_FBS_DELIVERY_HOURS_MIN;
  return Math.min(WB_FBS_DELIVERY_HOURS_MAX, Math.max(WB_FBS_DELIVERY_HOURS_MIN, Math.round(hours)));
}

/**
 * Итоговая комиссия FBS с учётом времени доставки до склада WB.
 * Калибровка по официальному калькулятору WB: 30 ч → база, +0,1 п.п./ч до 72 ч.
 */
export function getWbFbsCommissionWithDelivery(
  baseCommissionFbs: number,
  deliveryHours: number
): number {
  const hours = clampWbFbsDeliveryHours(deliveryHours);
  const surcharge =
    Math.max(0, hours - WB_FBS_DELIVERY_HOURS_MIN) * WB_FBS_DELIVERY_SURCHARGE_PER_HOUR;
  return Math.round((baseCommissionFbs + surcharge) * 1000) / 1000;
}
