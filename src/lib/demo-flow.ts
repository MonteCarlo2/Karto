/**
 * Демо-поток: один раз на новый аккаунт, 30 дней, урезанные лимиты.
 * Если у пользователя появляется платный Поток — демо снимается.
 */

import {
  CREDIT_PHOTO_4K,
  FLOW_CREDITS_BASE,
  photoCreditCost,
} from "@/lib/credits-pricing";

export const DEMO_FLOW_PLAN_TYPE = "demo_flow" as const;

/** Сколько демо-потоков выдаём новому аккаунту */
export const DEMO_FLOW_VOLUME = 1;

/** Фото 2K в одной демо-сессии (4 карточки + 1 доп.) */
export const DEMO_FLOW_VISUAL_LIMIT = 5;

/** Разрешение WaveSpeed для демо */
export const DEMO_FLOW_IMAGE_RESOLUTION = "2k" as const;

/** Кредитов в сессии демо-потока (только фото 2K, без видео). */
export function demoFlowSessionCreditsTotal(): number {
  return DEMO_FLOW_VISUAL_LIMIT * photoCreditCost(DEMO_FLOW_IMAGE_RESOLUTION);
}

/** Человекочитаемо для UI: «375 кред. — хватит на 5 фото 2K». */
export function demoFlowCreditsLabelRu(): string {
  const total = demoFlowSessionCreditsTotal();
  return `${total.toLocaleString("ru-RU")} кред. — хватит на ${DEMO_FLOW_VISUAL_LIMIT} фото 2K`;
}

/**
 * В демо генерируются только 2 стиля описания (продающий + структурированный) за один раз.
 * Редактирование/перегенерация в демо недоступны.
 */
export const DEMO_FLOW_DESCRIPTION_STYLES = [2, 3] as const;
export const DEMO_FLOW_DESCRIPTION_STYLE_NAMES: Record<2 | 3, string> = {
  2: "Продающий",
  3: "Структурированный",
};

export const DEMO_FLOW_LABEL_RU = "Демо";
export const DEMO_FLOW_UNIT_RU = "демо-поток";

export const DEMO_FLOW_SHORT_DETAIL_RU = `2 стиля описания, ${demoFlowCreditsLabelRu()}. Только фото, без видео. Один раз на новый аккаунт, 30 дней.`;

export type FlowSessionKind = "demo" | "paid";

export function demoFlowVisualLimit(): number {
  return DEMO_FLOW_VISUAL_LIMIT;
}

export function paidFlowVisualLimit(): number {
  return Math.floor(FLOW_CREDITS_BASE / CREDIT_PHOTO_4K);
}

export function visualLimitForSession(isDemo: boolean): number {
  return isDemo ? DEMO_FLOW_VISUAL_LIMIT : paidFlowVisualLimit();
}
