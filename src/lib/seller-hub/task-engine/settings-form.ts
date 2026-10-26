import { DEFAULT_TASK_THRESHOLDS } from "./config";
import type { TaskType } from "./types";

/**
 * Настройки задач, которые реально меняют поведение правил. Каждый рычаг подписан тем, что именно он меняет:
 * кнопок, которые ничего не делают, здесь нет (пороги «избыток запаса, дни» и «зависший капитал, ₽» из базы правилами не читаются, поэтому не показаны).
 */

export type SettingKey =
  | "leadTimeDays"
  | "supplyCoverDays"
  | "reorderReviewDays"
  | "excessCoverDays"
  | "lowStockDays"
  | "noSalesDays"
  | "salesChangePercent"
  | "lowContentScore"
  | "fullPhotoCount"
  | "targetMarginPercent"
  | "marginDropPoints";

export type SettingField = {
  key: SettingKey;
  label: string;
  unit: string;
  min: number;
  max: number;
  /** null — по умолчанию правило выключено (пока значение не задано). */
  defaultValue: number | null;
  optional?: boolean;
  group: "stock" | "sales" | "economics" | "content";
  /** Что меняет этот рычаг. */
  hint: string;
  /** Колонка в seller_hub_task_settings. */
  column: string;
};

export const SETTING_FIELDS: readonly SettingField[] = [
  { key: "leadTimeDays", label: "Срок поставки до склада WB", unit: "дн.", min: 1, max: 90, defaultValue: DEFAULT_TASK_THRESHOLDS.leadTimeDays, group: "stock", column: "lead_time_days", hint: "Задача «Запас скоро закончится» считает, сколько нужно привезти, с учётом этого срока: пока поставка едет, товар продаётся." },
  { key: "supplyCoverDays", label: "На сколько дней покрывать поставкой", unit: "дн.", min: 7, max: 180, defaultValue: DEFAULT_TASK_THRESHOLDS.supplyCoverDays, group: "stock", column: "supply_cover_days", hint: "Сколько дней продаж должно хватать после прихода поставки. Больше дней — больше рекомендуемый объём." },
  { key: "reorderReviewDays", label: "Дни на оформление заказа поставки", unit: "дн.", min: 0, max: 30, defaultValue: DEFAULT_TASK_THRESHOLDS.reorderReviewDays, group: "stock", column: "reorder_review_days", hint: "Запас на то, чтобы вы успели оформить заказ: прибавляется к сроку поставки в расчёте момента заказа." },
  { key: "excessCoverDays", label: "Избыток: запас сверх расхода за", unit: "дн.", min: 30, max: 365, defaultValue: DEFAULT_TASK_THRESHOLDS.excessCoverDays, group: "stock", column: "excess_cover_days", hint: "Избытком считается запас сверх того, что уйдёт за это число дней по текущему темпу продаж." },
  { key: "lowStockDays", label: "Мало запаса при оценке спроса", unit: "дн.", min: 1, max: 60, defaultValue: DEFAULT_TASK_THRESHOLDS.lowStockDays, group: "stock", column: "low_stock_days", hint: "Если запаса хватает меньше, чем на столько дней, задачи про падение спроса не создаются: причина в нехватке товара." },
  { key: "noSalesDays", label: "«Нет продаж»: окно без заказов", unit: "дн.", min: 14, max: 180, defaultValue: DEFAULT_TASK_THRESHOLDS.noSalesDays, group: "sales", column: "no_sales_days", hint: "Задача «Товар не продаётся» появляется, если за это время не было ни одного заказа, а остаток есть." },
  { key: "salesChangePercent", label: "Значимое изменение продаж", unit: "%", min: 5, max: 90, defaultValue: DEFAULT_TASK_THRESHOLDS.salesChangePercent, group: "sales", column: "sales_change_percent", hint: "Минимальное изменение заказов к прошлому периоду для задач про падение и рост спроса. Меньшие колебания считаются шумом." },
  { key: "targetMarginPercent", label: "Целевая маржа на 1 продажу", unit: "%", min: 0, max: 100, defaultValue: null, optional: true, group: "economics", column: "target_margin_percent", hint: "Если задана, появляется задача «Низкая маржа» для товаров ниже этой цели. Пусто — задача выключена." },
  { key: "marginDropPoints", label: "Падение маржи, считающееся значимым", unit: "п. п.", min: 1, max: 50, defaultValue: DEFAULT_TASK_THRESHOLDS.marginDropPoints, group: "economics", column: "margin_drop_points", hint: "Задача «Маржа стала хуже» появляется, когда маржа на 1 продажу упала на столько процентных пунктов и больше." },
  { key: "lowContentScore", label: "Слабая карточка: оценка ниже", unit: "из 100", min: 10, max: 95, defaultValue: DEFAULT_TASK_THRESHOLDS.lowContentScore, group: "content", column: "low_content_score", hint: "Карточки с оценкой заполненности ниже этого числа получают задачу «Слабая карточка»." },
  { key: "fullPhotoCount", label: "Фото для полного балла", unit: "шт.", min: 1, max: 30, defaultValue: DEFAULT_TASK_THRESHOLDS.fullPhotoCount, group: "content", column: "full_photo_count", hint: "Если фото в карточке меньше этого числа, появляется задача «Мало фото»." },
];

export type SettingsValues = Record<SettingKey, number | null>;

export const GROUP_TITLE: Record<SettingField["group"], string> = {
  stock: "Остатки и поставки",
  sales: "Продажи и спрос",
  economics: "Цены и маржа",
  content: "Карточки",
};

export function defaultValues(): SettingsValues {
  return Object.fromEntries(SETTING_FIELDS.map((f) => [f.key, f.defaultValue])) as SettingsValues;
}

export type ValidateResult = { ok: true; values: SettingsValues } | { ok: false; errors: Partial<Record<SettingKey, string>> };

/** Проверка значений формы. Нет значения — используется стандартное. Только целые числа в допустимых границах. */
export function validateValues(input: unknown): ValidateResult {
  const raw = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const values = defaultValues();
  const errors: Partial<Record<SettingKey, string>> = {};
  for (const f of SETTING_FIELDS) {
    const v = raw[f.key];
    if (v === undefined) continue;
    if (v === null || v === "") {
      if (f.optional) values[f.key] = null;
      else errors[f.key] = "Значение нужно указать";
      continue;
    }
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isInteger(n)) errors[f.key] = "Нужно целое число";
    else if (n < f.min || n > f.max) errors[f.key] = `От ${f.min} до ${f.max}`;
    else values[f.key] = n;
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, values };
}

/**
 * Полная строка для seller_hub_task_settings. Пишем ВСЕ колонки, в том числе неиспользуемые, явными значениями:
 * иначе при создании строки база подставила бы свои значения по умолчанию (например, 28 дней вместо 56 для «нет продаж»),
 * и поведение правил изменилось бы без ведома пользователя.
 */
export function rowFromValues(values: SettingsValues): Record<string, number | null> {
  const row: Record<string, number | null> = {
    // Колонки, которые правилами не читаются: фиксируем прежние стандартные значения.
    sales_change_min_units: DEFAULT_TASK_THRESHOLDS.salesChangeMinUnits,
    excess_stock_days: DEFAULT_TASK_THRESHOLDS.excessStockDays,
    stagnant_capital_rub: 0,
  };
  for (const f of SETTING_FIELDS) row[f.column] = values[f.key];
  row.low_margin_percent = values.targetMarginPercent;
  return row;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

/** Значения формы из строки базы. Пустая колонка — стандартное значение. */
export function valuesFromRow(row: Record<string, unknown> | null): SettingsValues {
  const values = defaultValues();
  if (!row) return values;
  for (const f of SETTING_FIELDS) {
    const stored = num(row[f.column]);
    if (f.key === "targetMarginPercent") values[f.key] = stored ?? num(row.low_margin_percent);
    else if (stored != null) values[f.key] = Math.round(stored);
  }
  return values;
}

export type TaskTypeInfo = { type: TaskType; label: string; group: "stock" | "sales" | "economics" | "content" | "reviews"; hint: string };

export const TASK_TYPE_INFO: readonly TaskTypeInfo[] = [
  { type: "TASK_STOCK_OUT", label: "Товар закончился", group: "stock", hint: "Остаток 0 при наличии продаж." },
  { type: "TASK_LOW_STOCK", label: "Запас скоро закончится", group: "stock", hint: "С расчётом, сколько привезти." },
  { type: "TASK_EXCESS_STOCK", label: "Избыток запаса", group: "stock", hint: "Запас сверх расхода за выбранное число дней." },
  { type: "TASK_STAGNANT_CAPITAL", label: "Зависший капитал", group: "stock", hint: "Деньги в товаре, который продаётся медленно." },
  { type: "TASK_SALES_DROP", label: "Падение продаж", group: "sales", hint: "Статистически значимое снижение заказов." },
  { type: "TASK_SALES_GROWTH", label: "Рост продаж", group: "sales", hint: "Значимый рост: проверить запас." },
  { type: "TASK_CONVERSION_DROP", label: "Падение конверсии", group: "sales", hint: "Карточку смотрят, но реже заказывают." },
  { type: "TASK_LOW_TRAFFIC", label: "Мало просмотров", group: "sales", hint: "Карточку стали реже открывать." },
  { type: "TASK_NO_SALES", label: "Товар не продаётся", group: "sales", hint: "Нет заказов за выбранное окно при наличии остатка." },
  { type: "TASK_NEGATIVE_MARGIN", label: "Убыточная цена", group: "economics", hint: "С 1 продажи остаётся минус." },
  { type: "TASK_MARGIN_NEAR_ZERO", label: "Маржа около нуля", group: "economics", hint: "Прибыль в пределах шума логистики." },
  { type: "TASK_LOW_MARGIN", label: "Низкая маржа (по вашей цели)", group: "economics", hint: "Работает, только если задана целевая маржа." },
  { type: "TASK_MARGIN_DETERIORATION", label: "Маржа стала хуже", group: "economics", hint: "Падение маржи между периодами." },
  { type: "TASK_COST_MISSING", label: "Нет себестоимости", group: "economics", hint: "Без неё маржа не считается." },
  { type: "TASK_LOW_CONTENT_SCORE", label: "Слабая карточка", group: "content", hint: "Оценка заполненности ниже порога." },
  { type: "TASK_CONTENT_OPPORTUNITY", label: "Карточку можно усилить", group: "content", hint: "Есть продажи и потенциал улучшения." },
  { type: "TASK_LOW_PHOTO_COUNT", label: "Мало фото", group: "content", hint: "Меньше фото, чем нужно для полного балла." },
  { type: "TASK_UNANSWERED_REVIEWS", label: "Отзывы без ответа", group: "reviews", hint: "Общее число неотвеченных отзывов." },
  { type: "TASK_UNANSWERED_POSITIVE_REVIEWS", label: "Положительные отзывы без ответа", group: "reviews", hint: "Отзывы 4–5★ без ответа." },
  { type: "TASK_UNANSWERED_NEGATIVE_REVIEW", label: "Негативный отзыв без ответа", group: "reviews", hint: "Отзыв 1–3★ без ответа дольше суток." },
  { type: "TASK_PROMO_LOSS", label: "Акция уводит товар в минус", group: "economics", hint: "Товар в акции, цена которой не покрывает себестоимость и списания WB." },
  { type: "TASK_PROMO_OPPORTUNITY", label: "Товар можно добавить в акцию", group: "sales", hint: "Цена входа в акцию даёт плюс, товар в наличии." },
  { type: "TASK_AD_NO_ORDERS", label: "Реклама без заказов", group: "economics", hint: "Расход на рекламу товара больше маржи с одной продажи, заказов по рекламе нет." },
  { type: "TASK_AD_DRR_OVER_MARGIN", label: "ДРР выше маржи", group: "economics", hint: "Доля расходов на рекламу выше маржи товара." },
  { type: "TASK_AD_CAMPAIGN_STOPPED", label: "Рекламная кампания остановилась", group: "sales", hint: "Кампания, что приводила заказы, стоит без бюджета, на паузе или упирается в лимит." },
  { type: "TASK_AD_NO_STOCK", label: "Реклама на товаре без остатка", group: "economics", hint: "Остаток 0, а товар в активной кампании." },
  { type: "TASK_AD_EFFICIENCY_DROP", label: "Реклама дорожает", group: "sales", hint: "Заказ по рекламе подорожал к прошлой неделе, причина подтверждена статистикой." },
  { type: "TASK_AD_WEAK_CARD", label: "Слабая карточка под рекламой", group: "content", hint: "Клики или заказы под рекламой вдвое ниже, чем у ваших других товаров." },
  { type: "TASK_AD_SCALE_UP", label: "Рекламу можно увеличить", group: "sales", hint: "ДРР заметно ниже маржи, заказов достаточно, товара хватает." },
  { type: "TASK_LOW_BUYOUT", label: "Низкий выкуп", group: "sales", hint: "Товар выкупают значимо реже ваших остальных." },
  { type: "TASK_LOW_RATING", label: "Низкая оценка отзывов", group: "reviews", hint: "Оценка ниже 4,5 или заметно ниже ваших остальных товаров." },
  { type: "TASK_COSTS_EAT_MARGIN", label: "Логистика и хранение съедают маржу", group: "economics", hint: "Забирают половину и более прибыли с продажи." },
  { type: "TASK_NEGATIVE_SHARE_UP", label: "Рост негатива в отзывах", group: "reviews", hint: "Доля негативных отзывов выросла." },
  { type: "TASK_UNANSWERED_QUESTIONS", label: "Вопросы без ответа", group: "reviews", hint: "Общее число неотвеченных вопросов." },
  { type: "TASK_UNANSWERED_QUESTION", label: "Вопрос по товару без ответа", group: "reviews", hint: "Вопрос без ответа дольше суток." },
  { type: "TASK_FEEDBACKS_ACCESS", label: "Нет доступа к отзывам", group: "reviews", hint: "В токене нет категории «Отзывы и вопросы»." },
];

const KNOWN_TYPES = new Set<string>(TASK_TYPE_INFO.map((t) => t.type));

/** Список отключённых типов из запроса: только известные типы, без повторов. null — форма некорректна. */
export function validateDisabledTypes(input: unknown): TaskType[] | null {
  if (input === undefined) return [];
  if (!Array.isArray(input)) return null;
  const out: TaskType[] = [];
  for (const v of input) {
    if (typeof v !== "string" || !KNOWN_TYPES.has(v)) return null;
    if (!out.includes(v as TaskType)) out.push(v as TaskType);
  }
  return out;
}
