import type { UnitEconCalculatorInput } from "../types";

/** Базовый расчёт: 100% выкуп, без чистой прибыли. Расширенный — с полями как в блоке Ozon. */
export function resolveOzonBuyoutPercent(input: UnitEconCalculatorInput): number {
  if (input.useAdvancedProfitCalc) {
    return Math.max(1, Math.min(100, input.buyoutPercent));
  }
  return 100;
}

export function resolveOzonCalculatorInput(input: UnitEconCalculatorInput): UnitEconCalculatorInput {
  return {
    ...input,
    buyoutPercent: resolveOzonBuyoutPercent(input),
    costPriceRub: input.useAdvancedProfitCalc ? input.costPriceRub : 0,
    otherCostsRub: input.useAdvancedProfitCalc ? input.otherCostsRub : 0,
    profitTaxPercent: input.useAdvancedProfitCalc ? (input.profitTaxPercent ?? 0) : 0,
  };
}
