import type { TaskType } from "./types";

/** Пороги движка. Правила читают этот объект, а не свои числа. */
export type TaskThresholds = {
  lowStockDays: number;
  /**
   * Минимальное относительное изменение заказов/выкупов для задач спроса, %.
   * Раньше было 25; теперь существенность после статистического теста.
   */
  salesChangePercent: number;
  /**
   * @deprecated Не главный критерий спроса. Оставлен для чтения старых настроек.
   * Пол теста — demandMinEvents.
   */
  salesChangeMinUnits: number;
  excessStockDays: number;
  noSalesDays: number;
  lowContentScore: number;
  /** null — правило низкой маржи выключено, пока порог не задан. */
  lowMarginPercent: number | null;
  /** Задача капитала, если зависшая закупка не меньше этой суммы. Формула sittingRub не меняется. */
  stagnantCapitalRub: number;
  marginDropPoints: number;
  /** Полный балл фото в текущей шкале контента. */
  fullPhotoCount: number;
  /**
   * @deprecated Заменён на demandMinEvents. Чтение старых строк настроек.
   */
  funnelMinOpenCount: number;
  /** Относительное падение конверсии для существенности, %. */
  conversionDropPercent: number;
  /**
   * @deprecated Классификация трафика идёт через poisson по переходам.
   * Оставлен как ориентир относительного падения переходов (−25%).
   */
  trafficStablePercent: number;
  /** Относительное падение переходов для TASK_LOW_TRAFFIC, %. */
  trafficDropPercent: number;
  /** Сумма событий по двум окнам, ниже которой тест не запускаем. */
  demandMinEvents: number;
  /** FDR q для задач спроса одного типа за reconcile. */
  demandFdrQ: number;
  /**
   * @deprecated Алиас severityTurnoverCriticalShare (стандарт §1).
   * Сохраняем ключ для старых строк настроек.
   */
  demandSeverityCriticalShare: number;
  /**
   * @deprecated Алиас severityTurnoverImportantShare.
   */
  demandSeverityImportantShare: number;
  /** Доля оборота → critical (стандарт §1). */
  severityTurnoverCriticalShare: number;
  /** Доля оборота → important. */
  severityTurnoverImportantShare: number;
  /** Доля валовой прибыли → critical (если себестоимость ≥ 80% оборота). */
  severityGrossCriticalShare: number;
  /** Доля валовой прибыли → important. */
  severityGrossImportantShare: number;
  /** Покрытие оборота товарами с себестоимостью для ветки валовой прибыли. */
  severityCostCoverageShare: number;
  /** Срок поставки L, дни (стандарт §3.2). */
  leadTimeDays: number;
  /** Z уровня сервиса для страхового запаса (1.65 ≈ 95%). */
  serviceLevelZ: number;
  /** Дни на разбор заказа поставки поверх L. */
  reorderReviewDays: number;
  /** Покрытие после прихода поставки, дни. */
  supplyCoverDays: number;
  /** Горизонт «нормального» запаса для излишка, дни (§3.3). */
  excessCoverDays: number;
  /** Изменение цены ≥ этого % попадает в вероятную причину. */
  priceCausePercent: number;
  /** Карточка младше этого возраста (дн.) не сравнивается по двум окнам. */
  demandMinAgeDays: number;
  /** Длина окна спроса в днях (экспозиция по умолчанию). */
  demandWindowDays: number;
};

export const DEFAULT_TASK_THRESHOLDS: TaskThresholds = {
  lowStockDays: 7,
  salesChangePercent: 20,
  salesChangeMinUnits: 5,
  excessStockDays: 180,
  noSalesDays: 56,
  lowContentScore: 70,
  lowMarginPercent: null,
  stagnantCapitalRub: 5000,
  marginDropPoints: 5,
  fullPhotoCount: 7,
  funnelMinOpenCount: 100,
  conversionDropPercent: 20,
  trafficStablePercent: 15,
  trafficDropPercent: 25,
  demandMinEvents: 10,
  demandFdrQ: 0.05,
  demandSeverityCriticalShare: 0.05,
  demandSeverityImportantShare: 0.01,
  severityTurnoverCriticalShare: 0.05,
  severityTurnoverImportantShare: 0.01,
  severityGrossCriticalShare: 0.2,
  severityGrossImportantShare: 0.05,
  severityCostCoverageShare: 0.8,
  leadTimeDays: 14,
  serviceLevelZ: 1.65,
  reorderReviewDays: 7,
  supplyCoverDays: 28,
  excessCoverDays: 90,
  priceCausePercent: 5,
  demandMinAgeDays: 56,
  demandWindowDays: 28,
};

export type TaskSkuOverride = {
  nmId: string;
  type: TaskType;
  disabled: boolean;
  lowStockDays?: number | null;
  excessStockDays?: number | null;
  lowContentScore?: number | null;
  lowMarginPercent?: number | null;
};

export type TaskSettings = {
  thresholds: TaskThresholds;
  disabledTypes: TaskType[];
  skuOverrides: TaskSkuOverride[];
  /** @deprecated Налог из маржи убран; поле игнорируется в расчётах. */
  taxRatePercent?: number | null;
};

/**
 * Ноль в seller_hub_task_settings — значение колонки по умолчанию, не выбор селлера.
 * Экрана настроек нет, поэтому его нельзя отличить от «порог выключен».
 * Положительное число — явная настройка и применяется как есть.
 */
export function resolveStagnantCapitalRub(stored: number | null): number {
  if (stored == null || stored === 0) return DEFAULT_TASK_THRESHOLDS.stagnantCapitalRub;
  return stored;
}

export const DEFAULT_TASK_SETTINGS: TaskSettings = {
  thresholds: DEFAULT_TASK_THRESHOLDS,
  disabledTypes: [],
  skuOverrides: [],
};

export function thresholdsFor(settings: TaskSettings, nmId: string | null, type: TaskType): TaskThresholds | null {
  if (settings.disabledTypes.includes(type)) return null;
  const override = nmId
    ? settings.skuOverrides.find((row) => row.nmId === nmId && row.type === type)
    : undefined;
  if (override?.disabled) return null;
  return {
    ...settings.thresholds,
    lowStockDays: override?.lowStockDays ?? settings.thresholds.lowStockDays,
    excessStockDays: override?.excessStockDays ?? settings.thresholds.excessStockDays,
    lowContentScore: override?.lowContentScore ?? settings.thresholds.lowContentScore,
    lowMarginPercent:
      override && "lowMarginPercent" in override && override.lowMarginPercent !== undefined
        ? override.lowMarginPercent
        : settings.thresholds.lowMarginPercent,
  };
}
