import type { SellerRealizationNm } from "./types";
import { stockPace, type StockPace, type StockPaceWindow } from "./product-signal";

/**
 * Риск обнуления по уже известному темпу продаж.
 * unknown — нет достоверного темпа или остатка; не выдаём за прогноз даты.
 */
export type OosRiskLevel = "out_of_stock" | "at_risk" | "ok" | "unknown";

export type OosRiskAssessment = {
  pace: StockPace | null;
  coverDays: number | null;
  paceWindow: StockPaceWindow | null;
  risk: OosRiskLevel;
};

/** Оценка по уже посчитанным дням запаса и порогу task settings (`lowStockDays`). */
export function assessOosRisk(input: {
  stock: number | null;
  coverDays: number | null;
  paceWindow?: StockPaceWindow | null;
  lowStockDays: number;
}): OosRiskAssessment {
  const paceWindow = input.paceWindow ?? null;
  if (input.stock == null) {
    return { pace: null, coverDays: null, paceWindow, risk: "unknown" };
  }
  if (input.stock <= 0) {
    return { pace: null, coverDays: null, paceWindow, risk: "out_of_stock" };
  }
  if (input.coverDays == null || !(input.lowStockDays > 0)) {
    return { pace: null, coverDays: input.coverDays, paceWindow, risk: "unknown" };
  }
  if (input.coverDays < input.lowStockDays) {
    return { pace: null, coverDays: input.coverDays, paceWindow, risk: "at_risk" };
  }
  return { pace: null, coverDays: input.coverDays, paceWindow, risk: "ok" };
}

/** Полный расчёт из остатка и строки realization (для тестов и будущих вызовов). */
export function assessOosRiskFromRealization(
  stock: number | null,
  own: SellerRealizationNm | undefined,
  lowStockDays: number,
): OosRiskAssessment {
  const pace = stockPace(stock, own);
  const coverDays = stock != null && stock > 0 ? pace.days : null;
  const paceWindow =
    coverDays != null && (pace.window === "recent" || pace.window === "span") ? pace.window : null;
  const base = assessOosRisk({ stock, coverDays, paceWindow, lowStockDays });
  return { ...base, pace };
}
