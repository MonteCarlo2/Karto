import type { TaskActionType, TaskEvidence, TaskImpactType, TaskSeverity, TaskStatus } from "@/lib/seller-hub/task-engine/types";

export const IMPACT_OPTIONS: Array<{ id: TaskImpactType | "all"; label: string }> = [
  { id: "all", label: "Все" },
  { id: "SALES_PROTECTION", label: "Защита продаж" },
  { id: "SALES_GROWTH", label: "Рост продаж" },
  { id: "PROFIT_PROTECTION", label: "Защита прибыли" },
  { id: "PROFIT_GROWTH", label: "Рост прибыли" },
  { id: "CAPITAL_RELEASE", label: "Высвобождение капитала" },
  { id: "STOCK_RISK", label: "Складской риск" },
  { id: "OPERATIONAL", label: "Операционные" },
];

export function severityLabel(severity: TaskSeverity): string {
  switch (severity) {
    case "critical":
      return "Критическая";
    case "important":
      return "Важная";
    case "opportunity":
      return "Возможность";
    default: {
      const unexpected: never = severity;
      return unexpected;
    }
  }
}

export function statusLabel(status: TaskStatus): string {
  switch (status) {
    case "active":
      return "Активна";
    case "in_progress":
      return "В работе";
    case "snoozed":
      return "Отложена";
    case "completed":
      return "Выполнена";
    case "dismissed":
      return "Скрыта";
    default: {
      const unexpected: never = status;
      return unexpected;
    }
  }
}

export function impactLabel(impact: TaskImpactType): string {
  switch (impact) {
    case "SALES_PROTECTION":
      return "Защита продаж";
    case "SALES_GROWTH":
      return "Рост продаж";
    case "PROFIT_PROTECTION":
      return "Защита прибыли";
    case "PROFIT_GROWTH":
      return "Рост прибыли";
    case "CAPITAL_RELEASE":
      return "Высвобождение капитала";
    case "STOCK_RISK":
      return "Складской риск";
    case "OPERATIONAL":
      return "Операционная";
    default: {
      const unexpected: never = impact;
      return unexpected;
    }
  }
}

/** Текст по типу эффекта. Не обещает цифру роста и не подменяет reason задачи. */
export function impactWhy(impact: TaskImpactType): string {
  switch (impact) {
    case "SALES_PROTECTION":
      return "Есть риск потерять текущие продажи.";
    case "SALES_GROWTH":
      return "Товар уже показывает спрос — здесь есть возможность увеличить результат.";
    case "PROFIT_PROTECTION":
      return "Текущая экономика товара может приводить к потере прибыли.";
    case "PROFIT_GROWTH":
      return "Есть возможность улучшить результат по прибыли. Конкретный рост этими данными не доказан.";
    case "CAPITAL_RELEASE":
      return "Часть денег связана в запасе, который продаётся слишком медленно.";
    case "STOCK_RISK":
      return "При текущем темпе товар может закончиться до следующего пополнения.";
    case "OPERATIONAL":
      return "Есть действие, которое стоит выполнить, чтобы не оставлять проблему без внимания.";
    default: {
      const unexpected: never = impact;
      return unexpected;
    }
  }
}

export function actionLabel(action: TaskActionType): string | null {
  switch (action) {
    case "OPEN_PRODUCT":
      return "Открыть товар";
    case "OPEN_STOCKS":
      return "Открыть остатки";
    case "OPEN_PRICE_EDITOR":
      return "Проверить цену";
    case "OPEN_CONTENT_EDITOR":
      return "Улучшить карточку";
    case "OPEN_REVIEWS":
    case "OPEN_REVIEW_RESPONSES":
      return "Ответить на отзывы";
    case "OPEN_QUESTIONS":
      return "Ответить на вопросы";
    case "OPEN_SUPPLIES":
      return "Подготовить поставку";
    case "OPEN_PROMOTIONS":
      return "Открыть акции";
    case "OPEN_ADS":
      return "Открыть рекламу";
    case "NONE":
      return null;
    default: {
      const unexpected: never = action;
      return unexpected;
    }
  }
}

function pieces(value: number): string {
  return `${Math.round(value).toLocaleString("ru-RU")} шт.`;
}

function rub(value: number): string {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function days(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} дн.`;
}

function pace(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 0.1) {
    return `${value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} шт./день`;
  }
  if (abs >= 0.005) {
    return `${value.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} шт./день`;
  }
  return `${value.toLocaleString("ru-RU", { maximumSignificantDigits: 3 })} шт./день`;
}

function percent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`;
}

type EvidenceFormat = "pieces" | "rub" | "days" | "pace" | "percent" | "share" | "points" | "score" | "count" | "text" | "yes";

const EVIDENCE_FIELDS: Array<{ key: string; label: string; format: EvidenceFormat }> = [
  { key: "stock", label: "Остаток", format: "pieces" },
  { key: "daily_pace", label: "Темп продаж", format: "pace" },
  { key: "cover_days", label: "Запас", format: "days" },
  { key: "sales_28d", label: "Продажи, 28 дн.", format: "pieces" },
  { key: "recent_sales_7d", label: "Продажи, 7 дн.", format: "pieces" },
  { key: "current_sales_28d", label: "Продажи сейчас", format: "pieces" },
  { key: "previous_sales_28d", label: "Предыдущие 28 дн.", format: "pieces" },
  { key: "sales_delta_units", label: "Изменение, шт.", format: "pieces" },
  { key: "change_percent", label: "Изменение", format: "percent" },
  { key: "open_count", label: "Переходы", format: "count" },
  { key: "prior_open_count", label: "Переходы ранее", format: "count" },
  { key: "add_to_cart_percent", label: "В корзину, %", format: "percent" },
  { key: "prior_add_to_cart_percent", label: "В корзину ранее, %", format: "percent" },
  { key: "cart_to_order_percent", label: "В заказ, %", format: "percent" },
  { key: "prior_cart_to_order_percent", label: "В заказ ранее, %", format: "percent" },
  { key: "missed_orders_est", label: "Упущенные заказы (оценка)", format: "pieces" },
  { key: "missed_orders_rub_est", label: "Упущенные заказы, ₽ (оценка)", format: "rub" },
  { key: "days_out_of_stock", label: "Дней без остатка", format: "days" },
  { key: "pace_before_per_day", label: "Темп до обнуления", format: "pace" },
  { key: "replenish_units", label: "Не хватает", format: "pieces" },
  { key: "sitting_rub", label: "Зависший капитал", format: "rub" },
  { key: "cost", label: "Себестоимость", format: "rub" },
  { key: "price", label: "Цена", format: "rub" },
  { key: "previous_price", label: "Прошлая цена", format: "rub" },
  { key: "promo_name", label: "Акция", format: "text" },
  { key: "plan_price", label: "Цена в акции", format: "rub" },
  { key: "promo_margin_rub", label: "Маржа в акции", format: "rub" },
  { key: "promo_margin_percent", label: "Маржа в акции, %", format: "percent" },
  { key: "ad_spend", label: "Расход на рекламу", format: "rub" },
  { key: "ad_views", label: "Показы рекламы", format: "count" },
  { key: "ad_clicks", label: "Клики по рекламе", format: "count" },
  { key: "ad_orders", label: "Заказы по рекламе", format: "count" },
  { key: "ad_order_sum", label: "Сумма заказов по рекламе", format: "rub" },
  { key: "drr_percent", label: "ДРР", format: "share" },
  { key: "threshold_rub", label: "Порог расхода", format: "rub" },
  { key: "cpo_now", label: "Цена рекламного заказа", format: "rub" },
  { key: "cpo_prev", label: "Цена заказа неделей раньше", format: "rub" },
  { key: "cpo_change_percent", label: "Изменение цены заказа", format: "percent" },
  { key: "ctr_percent", label: "Доля кликов от показов", format: "share" },
  { key: "ctr_benchmark_percent", label: "То же в среднем по вашей рекламе", format: "share" },
  { key: "cr_percent", label: "Заказов на 100 кликов", format: "share" },
  { key: "cr_benchmark_percent", label: "То же в среднем по вашей рекламе (заказов на 100 кликов)", format: "share" },
  { key: "buyout_percent", label: "Выкуп товара", format: "share" },
  { key: "shop_buyout_percent", label: "Выкуп в среднем по магазину", format: "share" },
  { key: "past_orders", label: "Заказов в периоде", format: "count" },
  { key: "past_buyouts", label: "Выкуплено", format: "count" },
  { key: "extra_returns", label: "Невыкуплено сверх нормы магазина", format: "pieces" },
  { key: "negative_reviews_28d", label: "Негативных отзывов за 28 дн.", format: "count" },
  { key: "rating_avg", label: "Оценка отзывов", format: "text" },
  { key: "rating_count", label: "Отзывов за 180 дн.", format: "count" },
  { key: "store_rating_avg", label: "Оценка в среднем по магазину", format: "text" },
  { key: "logistics_per_unit", label: "Логистика на штуку", format: "rub" },
  { key: "storage_per_unit", label: "Хранение на штуку", format: "rub" },
  { key: "margin_before_costs_rub", label: "Прибыль до логистики и хранения", format: "rub" },
  { key: "costs_share_percent", label: "Доля логистики и хранения в этой прибыли", format: "share" },
  { key: "cpc_now", label: "Цена клика", format: "rub" },
  { key: "cpc_prev", label: "Цена клика неделей раньше", format: "rub" },
  { key: "campaign_name", label: "Кампания", format: "text" },
  { key: "campaigns", label: "Кампании", format: "text" },
  { key: "window_days", label: "Период статистики", format: "days" },
  { key: "margin_rub", label: "Маржа", format: "rub" },
  { key: "margin_percent", label: "Маржа, %", format: "percent" },
  { key: "previous_margin_percent", label: "Прошлая маржа", format: "percent" },
  { key: "margin_drop_points", label: "Падение маржи", format: "points" },
  { key: "content_score", label: "Контент", format: "score" },
  { key: "photo_count", label: "Фото", format: "count" },
  { key: "age_days", label: "Возраст карточки", format: "days" },
  { key: "unanswered_feedbacks", label: "Отзывы без ответа", format: "count" },
  { key: "unanswered_questions", label: "Вопросы без ответа", format: "count" },
  { key: "demand_source", label: "Источник спроса", format: "text" },
  { key: "pace_source", label: "Источник темпа", format: "text" },
  { key: "pace_period", label: "Период темпа", format: "text" },
];

function formatEvidence(format: EvidenceFormat, value: number | string | boolean): string | null {
  if (typeof value === "boolean") return value ? "Да" : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  switch (format) {
    case "pieces":
      return pieces(value);
    case "rub":
      return rub(value);
    case "days":
      return days(value);
    case "pace":
      return pace(value);
    case "percent":
      return percent(value);
    case "share":
      return `${value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`;
    case "points":
      return `${value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} п.п.`;
    case "score":
      return `${Math.round(value)} из 100`;
    case "count":
      return Math.round(value).toLocaleString("ru-RU");
    case "text":
      return String(value);
    case "yes":
      return null;
    default: {
      const unexpected: never = format;
      return unexpected;
    }
  }
}

export type EvidenceRow = { label: string; value: string };

export function evidenceText(evidence: TaskEvidence, key: string): string | null {
  const field = EVIDENCE_FIELDS.find((item) => item.key === key);
  if (!field) return null;
  const raw = evidence[key];
  if (raw == null || typeof raw === "boolean") return null;
  return formatEvidence(field.format, raw);
}

export function evidenceRows(evidence: TaskEvidence): EvidenceRow[] {
  const rows: EvidenceRow[] = [];
  for (const field of EVIDENCE_FIELDS) {
    const raw = evidence[field.key];
    if (raw == null || typeof raw === "boolean") continue;
    const value = formatEvidence(field.format, raw);
    if (!value) continue;
    rows.push({ label: field.label, value });
  }
  if (evidence.price_changed === true) rows.push({ label: "Цена с прошлого снимка", value: "Менялась" });
  return rows;
}

export function evidenceNote(evidence: TaskEvidence): string | null {
  const gap = evidence.content_gap;
  return typeof gap === "string" && gap.trim() ? gap.trim() : null;
}

/** Открытый эпизод в базе. Активный список — isActionableTask: будущее откладывание туда не входит. */
export function isOpenStatus(status: TaskStatus): boolean {
  return status === "active" || status === "in_progress" || status === "snoozed";
}
