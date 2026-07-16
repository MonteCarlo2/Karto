/**
 * Демо-поток: один раз на новый аккаунт, 30 дней, урезанные лимиты.
 * Если у пользователя появляется платный Поток — демо снимается.
 */

export const DEMO_FLOW_PLAN_TYPE = "demo_flow" as const;

/** Сколько демо-потоков выдаём новому аккаунту */
export const DEMO_FLOW_VOLUME = 1;

/** Генераций визуала в одной демо-сессии (4 карточки + 1 доп.) */
export const DEMO_FLOW_VISUAL_LIMIT = 5;

/**
 * В демо генерируются только 2 стиля описания (продающий + структурированный) за один раз.
 * Редактирование/перегенерация в демо недоступны.
 */
export const DEMO_FLOW_DESCRIPTION_STYLES = [2, 3] as const;
export const DEMO_FLOW_DESCRIPTION_STYLE_NAMES: Record<2 | 3, string> = {
  2: "Продающий",
  3: "Структурированный",
};

/** Разрешение WaveSpeed для демо */
export const DEMO_FLOW_IMAGE_RESOLUTION = "2k" as const;

export const DEMO_FLOW_LABEL_RU = "Демо";
export const DEMO_FLOW_UNIT_RU = "демо-поток";

export const DEMO_FLOW_SHORT_DETAIL_RU =
  "2 стиля описания и 5 фото в 2K. Один раз на новый аккаунт, 30 дней.";

export type FlowSessionKind = "demo" | "paid";

export function demoFlowVisualLimit(): number {
  return DEMO_FLOW_VISUAL_LIMIT;
}

export function paidFlowVisualLimit(): number {
  return 12;
}

export function visualLimitForSession(isDemo: boolean): number {
  return isDemo ? DEMO_FLOW_VISUAL_LIMIT : paidFlowVisualLimit();
}
