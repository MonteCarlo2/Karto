/**
 * Пользовательские настройки Seller Hub, которые хранятся в Supabase (таблица seller_hub_user_settings)
 * и поэтому одинаковы на всех устройствах. Разрешены только перечисленные ключи с проверкой значения.
 */

import { isValidKeepQueries } from "./ads-keep-queries";
import { isAnalyticsPeriod } from "./analytics-periods";
import { isValidMarksString, isValidMutedString } from "./events-marks";
import { isValidRubricListString } from "./news/analysis";

type Validator = (value: unknown) => boolean;

const oneOf = (allowed: readonly string[]): Validator => (value) => typeof value === "string" && allowed.includes(value);
const intRange = (min: number, max: number): Validator => (value) =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
const bool: Validator = (value) => typeof value === "boolean";

export const USER_SETTING_VALIDATORS = {
  "ads.days": oneOf(["7", "14", "30"]),
  "ads.compare": bool,
  "ads.keepQueries": isValidKeepQueries,
  /** Автоматический анализ нейросетью при изменении данных (разбор кампаний, план по карточкам, оценка новых и изменённых карточек). */
  "ai.auto": bool,
  /** Через сколько часов ожидания заказа напоминать об отгрузке. */
  "fulfillment.remindHours": intRange(1, 168),
  /** Запас на своём складе в днях, ниже которого предупреждаем. */
  "fulfillment.coverDays": intRange(1, 60),
  /** С какого часа по Москве напоминать о вечерней отправке; 24 — не напоминать. */
  "fulfillment.eveningHour": intRange(0, 24),
  /** Период раздела «Аналитика», дней: 7, 14, 28, 60 или 90. */
  "analytics.period": isAnalyticsPeriod,
  /** Аналитика остатков: меньше скольких дней запаса товар считается «скоро закончится» и больше скольких — «залёживается». */
  "analytics.lowStockDays": intRange(1, 180),
  "analytics.overStockDays": intRange(1, 720),
  /** Момент (ISO), до которого события «Событий» считаются прочитанными. */
  "events.seenAt": (value) => typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value)),
  /** Пометки на уведомлениях: прочитано / непрочитано, закреплено, в архиве (компактный JSON). */
  "events.marks": isValidMarksString,
  /** Направления «Событий», скрытые пользователем (через запятую). */
  "events.mutedGroups": isValidMutedString,
  /** Чувствительность умных уведомлений: low, normal или high. */
  /** Показывать в ленте и общие новости WB (по умолчанию только персональные, по вашим категориям и важные). */
  "events.newsGeneral": bool,
  /** Рубрики новостей WB, которые пользователь скрыл (через |). */
  "events.newsMutedRubrics": isValidRubricListString,
  "events.sensitivity": oneOf(["low", "normal", "high"]),
  /** Период отчёта «Прибыли и убытки», дней. */
  "finance.period": isAnalyticsPeriod,
  /** Ставка налога для отчёта «Прибыли и убытки», %. 0 — налог не показывать. */
  "finance.taxRate": intRange(0, 40),
  /** База налога: выручка, сумма к перечислению или прибыль до налога. */
  "finance.taxBase": oneOf(["revenue", "pay", "profit"]),
  "logistics.days": oneOf(["30", "60", "90"]),
  "logistics.coverDays": intRange(1, 365),
  "logistics.multiple": intRange(1, 1000),
} as const satisfies Record<string, Validator>;

export type UserSettingKey = keyof typeof USER_SETTING_VALIDATORS;

export function isUserSettingKey(key: string): key is UserSettingKey {
  return Object.prototype.hasOwnProperty.call(USER_SETTING_VALIDATORS, key);
}

/** Значение допустимо для ключа? Неизвестный ключ — нет. */
export function isValidUserSetting(key: string, value: unknown): boolean {
  return isUserSettingKey(key) && USER_SETTING_VALIDATORS[key](value);
}

/** Из набора строк базы оставляем только известные ключи с допустимыми значениями: мусор и старые ключи отбрасываем. */
export function pickValidSettings(rows: Array<{ setting_key: string; value: unknown }>): Partial<Record<UserSettingKey, unknown>> {
  const out: Partial<Record<UserSettingKey, unknown>> = {};
  for (const row of rows) {
    if (isValidUserSetting(row.setting_key, row.value)) out[row.setting_key as UserSettingKey] = row.value;
  }
  return out;
}
