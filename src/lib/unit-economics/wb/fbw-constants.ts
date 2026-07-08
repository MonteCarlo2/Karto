/**
 * Константы амортизации монопаллеты — как в калькуляторе прибыли WB.
 * Хранение: ставка за паллету × дни × (литры товара / ёмкость паллеты).
 * Приёмка: тариф 4.17 ₽/л из снапшота = 50 ₽ база / 12 л × объём товара / 12.
 */
export const WB_MONOPALLET_STORAGE_CAPACITY_LITERS = 1325;
export const WB_MONOPALLET_ACCEPTANCE_UNIT_LITERS = 12;

/** КРП по умолчанию (55–59,99% локализации), если ИЛ/ИРП в калькуляторе выключены. */
export const WB_DEFAULT_IRP_PERCENT = 2.0;

/** КРП для складов с коэф. логистики FBW ≥ 200% (как в калькуляторе WB для Казани и др.). */
export const WB_DEFAULT_IRP_HIGH_COEF_PERCENT = 1.0;

/** Делитель для хранения короба по logistics_box из снапшота (175–184% коэф.). */
export const WB_STORAGE_LOGISTICS_BOX_DIVISOR = 1300;

/** Делитель для хранения короба по storage_box из снапшота (склады без листа «Короба»). */
export const WB_SNAPSHOT_STORAGE_BOX_DIVISOR = 4.6;

/** Порог коэф. хранения: выше — формула logistics_box / 1300 или storageCoef / 146.5. */
export const WB_STORAGE_COEF_HIGH_PERCENT = 185;

/** Нижняя граница коэф. хранения для формулы logistics_box / 1300. */
export const WB_STORAGE_COEF_MID_PERCENT = 175;

/** Порог коэф. FBW, после которого в калькуляторе WB применяется пониженный КРП. */
export const WB_HIGH_LOGISTICS_COEF_PERCENT = 200;

/** Минимальная стоимость обратной логистики от клиента до 20.03.2026 (далее — по литражу). */
export const WB_REVERSE_LOGISTICS_MIN_RUB = 200;

/** Потолок ставки обратной логистики от клиента (как в калькуляторе WB). */
export const WB_REVERSE_LOGISTICS_CAP_RUB = 230;

/** Базовый тариф приёмки монопаллеты, ₽/л (если в снапшоте 0). */
export const WB_DEFAULT_MONOPALLET_ACCEPTANCE_PER_LITER = 4.17;

/** Базовый тариф обратной логистики: первый литр (до коэф. склада). */
export const WB_REVERSE_FIRST_LITER_RUB = 50;

/** Базовый тариф обратной логистики: каждый доп. литр. */
export const WB_REVERSE_ADDITIONAL_LITER_RUB = 14;

/**
 * Делитель при расчёте обратной логистики по литражу с коэф. склада (март 2026).
 * (46 ₽ + доп.л × 14 ₽) × коэф.логистики / 173, но не ниже 200 ₽.
 */
export const WB_REVERSE_LOGISTICS_WAREHOUSE_DIVISOR = 173;
