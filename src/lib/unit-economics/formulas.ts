import type { UnitEconTaxMode } from "./types";

export function roundRub(value: number): number {
  return Math.round(value * 100) / 100;
}

export function percentOf(price: number, amount: number): number {
  if (price <= 0) return 0;
  return roundRub((amount / price) * 100);
}

/** Объём упаковки, л (Д×Ш×В в см → литры). */
export function volumeLitersFromCm(lengthCm: number, widthCm: number, heightCm: number): number {
  const l = Math.max(0, lengthCm);
  const w = Math.max(0, widthCm);
  const h = Math.max(0, heightCm);
  return roundRub((l * w * h) / 1000);
}

/** Объёмный вес Ozon: max(физический объём, вес в кг как литры). */
export function ozonBillableLiters(volumeLiters: number, weightKg: number): number {
  return roundRub(Math.max(volumeLiters, Math.max(0, weightKg)));
}

/** WB: объёмный вес ≈ max(литры, кг). */
export function wbBillableLiters(volumeLiters: number, weightKg: number): number {
  return roundRub(Math.max(volumeLiters, Math.max(0, weightKg)));
}

export function taxAmountRub(
  taxMode: UnitEconTaxMode,
  priceRub: number,
  profitBeforeTaxRub: number
): number {
  if (taxMode === "none") return 0;
  if (taxMode === "usn6") return roundRub(priceRub * 0.06);
  if (taxMode === "usn25") return roundRub(priceRub * 0.25);
  if (taxMode === "usn15") return roundRub(Math.max(0, profitBeforeTaxRub) * 0.15);
  return 0;
}

/** Упрощённая логистика Ozon (демо до Excel-тарифов). */
export function ozonLogisticsRub(
  model: "fbo" | "fbs",
  billableLiters: number,
  buyoutPercent: number,
  logisticsMultiplier = 1
): number {
  const buyoutFactor = Math.max(0.5, Math.min(1, buyoutPercent / 100));
  const base = model === "fbo" ? 62 : 48;
  const perLiter = model === "fbo" ? 9.5 : 7.2;
  const extra = Math.max(0, billableLiters - 1) * perLiter;
  const returnReserve = model === "fbs" ? (1 - buyoutFactor) * 18 : (1 - buyoutFactor) * 12;
  return roundRub((base + extra + returnReserve) * logisticsMultiplier);
}

/** Упрощённая логистика WB (демо). */
export function wbLogisticsRub(
  model: "fbw" | "fbs",
  billableLiters: number,
  buyoutPercent: number,
  logisticsMultiplier = 1
): number {
  const buyoutFactor = Math.max(0.5, Math.min(1, buyoutPercent / 100));
  const base = model === "fbw" ? 55 : 42;
  const perLiter = model === "fbw" ? 8.8 : 6.5;
  const extra = Math.max(0, billableLiters - 1) * perLiter;
  const returnReserve = (1 - buyoutFactor) * 15;
  return roundRub((base + extra + returnReserve) * logisticsMultiplier);
}

export const ACQUIRING_PERCENT = 1.5;

/** Ozon-калькулятор: эквайринг 1%, целые рубли в строках. */
export const OZON_ACQUIRING_PERCENT = 1;

/** Доставка до места выдачи — отдельная услуга, не более 25 ₽/шт (с 01.06.2025). */
export const OZON_DELIVERY_TO_PICKUP_MAX_RUB = 25;

export function ozonWholeRub(value: number): number {
  return Math.round(value);
}

export function ozonAcquiringRub(priceRub: number): number {
  return ozonWholeRub(priceRub * (OZON_ACQUIRING_PERCENT / 100));
}

export function ozonCommissionRub(priceRub: number, commissionPercent: number): number {
  return ozonWholeRub(priceRub * (commissionPercent / 100));
}
