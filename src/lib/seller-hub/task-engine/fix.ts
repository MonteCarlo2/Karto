import type { TaskEvidence, TaskType } from "./types";

/** Действие «выполнить» прямо из задачи: поставить цену не ниже безубыточной. Деньги считает движок задач, здесь только перевод в цену и скидку WB. */
export type PriceFix = {
  /** Цена для покупателя (со скидкой продавца), ₽: не ниже безубыточной. */
  targetRub: number;
  /** Базовая цена до скидки, ₽, которую нужно отправить в WB. */
  baseRub: number;
  /** Скидка продавца, %, остаётся прежней. */
  discount: number;
  /** Текущая цена для покупателя, ₽. */
  currentRub: number;
};

const PRICE_FIX_TYPES: ReadonlySet<TaskType> = new Set(["TASK_NEGATIVE_MARGIN", "TASK_MARGIN_NEAR_ZERO"] as TaskType[]);

/** Во сколько раз за один шаг можно поднять цену. Больше — только вручную в разделе цен (защита от ошибки в данных). */
export const PRICE_FIX_MAX_RAISE = 3;

/**
 * Что предложить кнопкой для убыточной цены.
 * Берём безубыточную цену из доказательств задачи, округляем вверх до рубля и переводим в базовую цену при прежней скидке:
 * база = цель ÷ (1 − скидка). Скидка не меняется. null — кнопки нет (нет данных, цена уже достаточна или скачок слишком большой).
 */
export function suggestPriceFix(
  type: TaskType,
  evidence: TaskEvidence,
  item: { price?: number | null; discountPercent?: number | null; discountedPrice?: number | null } | null,
): PriceFix | null {
  if (!PRICE_FIX_TYPES.has(type) || !item) return null;
  const breakEven = evidence.break_even_price;
  if (typeof breakEven !== "number" || !(breakEven > 0)) return null;
  const base = item.price;
  if (base == null || !(base > 0)) return null;
  const discount = item.discountPercent == null ? 0 : item.discountPercent;
  if (!(discount >= 0 && discount < 95)) return null;
  const currentRub = item.discountedPrice != null && item.discountedPrice > 0 ? item.discountedPrice : base * (1 - discount / 100);
  const targetRub = Math.ceil(breakEven);
  if (currentRub >= targetRub) return null;
  if (targetRub > currentRub * PRICE_FIX_MAX_RAISE) return null;
  const baseRub = Math.ceil(targetRub / (1 - discount / 100));
  return { targetRub, baseRub, discount, currentRub: Math.round(currentRub) };
}
