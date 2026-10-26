export type TaskType =
  | "TASK_STOCK_OUT"
  | "TASK_LOW_STOCK"
  | "TASK_EXCESS_STOCK"
  | "TASK_STAGNANT_CAPITAL"
  | "TASK_SALES_DROP"
  | "TASK_SALES_GROWTH"
  | "TASK_CONVERSION_DROP"
  | "TASK_LOW_TRAFFIC"
  | "TASK_NO_SALES"
  | "TASK_NEGATIVE_MARGIN"
  | "TASK_MARGIN_NEAR_ZERO"
  | "TASK_LOW_MARGIN"
  | "TASK_MARGIN_DETERIORATION"
  | "TASK_COST_MISSING"
  | "TASK_LOW_CONTENT_SCORE"
  | "TASK_CONTENT_OPPORTUNITY"
  | "TASK_LOW_PHOTO_COUNT"
  | "TASK_UNANSWERED_REVIEWS"
  | "TASK_UNANSWERED_QUESTIONS"
  | "TASK_UNANSWERED_NEGATIVE_REVIEW"
  | "TASK_UNANSWERED_QUESTION"
  | "TASK_UNANSWERED_POSITIVE_REVIEWS"
  | "TASK_NEGATIVE_SHARE_UP"
  | "TASK_FEEDBACKS_ACCESS"
  | "TASK_PROMO_LOSS"
  | "TASK_PROMO_OPPORTUNITY"
  | "TASK_AD_NO_ORDERS"
  | "TASK_AD_DRR_OVER_MARGIN"
  | "TASK_AD_CAMPAIGN_STOPPED"
  | "TASK_AD_NO_STOCK"
  | "TASK_AD_EFFICIENCY_DROP"
  | "TASK_AD_WEAK_CARD"
  | "TASK_AD_SCALE_UP"
  | "TASK_LOW_BUYOUT"
  | "TASK_LOW_RATING"
  | "TASK_COSTS_EAT_MARGIN"
  /** Задача, созданная человеком из уведомления в «Событиях». Не вычисляется движком, поэтому пересчёт её не закрывает. */
  | "TASK_FROM_EVENT";

/** Статус воронки для факта товара. not_loaded — снимок ещё не читали. */
export type TaskFunnelStatus =
  | "ok"
  | "partial"
  | "jam_required"
  | "rate_limited"
  | "forbidden"
  | "error"
  | "not_loaded"
  | "missing";

export type TaskPaceSource = "orders" | "sales-recent" | "sales-span";

export type TaskCategory = "stock" | "sales" | "economics" | "content" | "reviews";

export type TaskSeverity = "critical" | "important" | "opportunity";

export type TaskStatus = "active" | "in_progress" | "snoozed" | "completed" | "dismissed";

export type TaskActionType =
  | "OPEN_PRODUCT"
  | "OPEN_STOCKS"
  | "OPEN_PRICE_EDITOR"
  | "OPEN_CONTENT_EDITOR"
  | "OPEN_REVIEWS"
  | "OPEN_REVIEW_RESPONSES"
  | "OPEN_QUESTIONS"
  | "OPEN_SUPPLIES"
  | "OPEN_PROMOTIONS"
  | "OPEN_ADS"
  | "NONE";

export type TaskImpactType =
  | "SALES_PROTECTION"
  | "SALES_GROWTH"
  | "PROFIT_PROTECTION"
  | "PROFIT_GROWTH"
  | "CAPITAL_RELEASE"
  | "STOCK_RISK"
  | "OPERATIONAL";

export type TaskEvidenceValue = string | number | boolean | null;

export type TaskEvidence = Record<string, TaskEvidenceValue>;

/** Условия одной акции WB для товара. Считается в promo.ts теми же функциями, что страница «Акции». */
export type PromoOfferFact = {
  promoId: string;
  promoName: string;
  promoType: string | null;
  startAt: string | null;
  endAt: string | null;
  /** Товары можно добавлять и убирать через API (календарная акция). У автоакции false. */
  canManage: boolean;
  planPrice: number | null;
  /** null — участие неизвестно. */
  inPromo: boolean | null;
  cohort: "boost" | "hold" | "loss" | "open";
  marginPromoRub: number | null;
  marginPromoPercent: number | null;
  marginNowRub: number | null;
};

/** Одна рекламная кампания товара за окно статистики. */
export type ProductAdCampaignFact = {
  id: string;
  name: string;
  /** Статус WB: 9 идёт, 11 пауза, 7 завершена. null — не читали. */
  status: number | null;
  /** Остаток бюджета кампании, ₽. null — WB не вернул. */
  budget: number | null;
  /** Дневной лимит, ₽. null — не включён или не читали. */
  dailyLimitRub: number | null;
  /** Товар сейчас в списке артикулов кампании. null — список не читали. */
  advertised: boolean | null;
  /** Расход и заказы этой кампании по этому товару за окно, ₽ / шт. */
  spend: number;
  orders: number;
  orderSum: number;
  /** Расход всей кампании за последние 3 дня окна, ₽. */
  recentSpend: number;
  /** В скольких из последних 3 дней окна расход кампании дошёл до 95% дневного лимита. */
  limitHitDays: number;
};

/** Показатели рекламы товара за одно окно статистики. */
export type ProductAdTotals = {
  spend: number;
  views: number;
  clicks: number;
  orders: number;
  orderSum: number;
};

/** Эталон по рекламе самого магазина: с чем сравнивать товар, когда чужих цифр нет. */
export type AdBenchmark = {
  /** Сколько товаров с достаточным числом показов вошло в эталон. */
  products: number;
  ctrPercent: number | null;
  /** Заказов на 100 кликов. */
  crPercent: number | null;
};

/** Реклама товара за окно статистики WB. Нет поля — кампании в кабинете не читали. */
export type ProductAdFact = {
  /** Предыдущее такое же окно. null — не читали (лимит WB), тренд не считаем. */
  prev?: ProductAdTotals | null;
  benchmark?: AdBenchmark | null;
  /** Статистика расхода и заказов прочитана. false — есть только список кампаний. */
  statsReady: boolean;
  windowDays: number;
  dateFrom: string | null;
  dateTo: string | null;
  spend: number;
  views: number;
  clicks: number;
  orders: number;
  orderSum: number;
  /** Расход ÷ сумма заказов по рекламе, %. null — заказов нет. */
  drrPercent: number | null;
  /** Средняя цена заказа по всей рекламе магазина за окно, ₽. null — заказов по рекламе нет. */
  storeCpo: number | null;
  campaigns: ProductAdCampaignFact[];
};

export type TaskFact = {
  nmId: string;
  itemId: string;
  title: string;
  vendorCode: string;
  /** Реклама товара. Нет поля — рекламу не читали. */
  adFacts?: ProductAdFact | null;
  /** Условия акций WB. Нет поля — акции не читали. */
  promoOffers?: PromoOfferFact[];
  stock: number | null;
  price: number | null;
  promoPrice: number | null;
  cost: number | null;
  /**
   * null — отчёт не прочитан. 0 — в цифрах ноль.
   * Ноль без salesKnown нельзя считать доказанным отсутствием продаж.
   */
  salesQty: number | null;
  /** true — ноль или число продаж подтверждены по этому артикулу, а не дыркой урезанного отчёта. */
  salesKnown: boolean;
  priorSalesQty: number | null;
  recentSalesQty: number | null;
  coverDays: number | null;
  /** Окно темпа: recent = 7д отчёта, span = 28д. null — темпа нет. */
  paceWindow: "recent" | "span" | null;
  /** Штук в день по тому же темпу, что и дни запаса. */
  dailyPace: number | null;
  /** null — зависший капитал посчитать нельзя. */
  sittingRub: number | null;
  /** Маржа на 1 продажу m = u/p за 90д доставок, % (−7.4 → −7.4). */
  marginPercent: number | null;
  /** Прибыль на 1 продажу u при текущей цене, ₽. */
  marginRub: number | null;
  marginSource: "sku" | "account" | null;
  /** Факт окна 28д: операционная прибыль P, ₽ (промпт 13). */
  marginWindowP: number | null;
  /** Факт окна 28д: прибыль на 1 шт. u, ₽ (промпт 13). */
  marginWindowU: number | null;
  /**
   * u до себестоимости на 1 продажу (₽), или Pay−L−St−A окна если нет доставок 90д.
   * Без cost: если < 0 — убыток уже до закупки.
   */
  marginBeforeCostP: number | null;
  /** Нет доставок за 90 дней → маржа на 1 продажу не считается. */
  unitSaleNoDeliveries: boolean;
  /** D, R, d, r, b за 90 дней (разложение логистики на 1 продажу). */
  unitSaleD: number | null;
  unitSaleR: number | null;
  unitSaleDeliveryUnit: number | null;
  unitSaleReturnUnit: number | null;
  unitSaleB: number | null;
  /** Чистые продажи за 90д (для денег под риском). */
  unitSaleNetSales90: number | null;
  /** Приёмка на 1 продажу, ₽. */
  acceptancePerUnit: number | null;
  /**
   * Маржа на 1 продажу по доставкам текущего окна 28д при b₉₀
   * (для DETERIORATION, не главный %).
   */
  unitSaleWindowMarginPercent: number | null;
  unitSaleWindowMarginRub: number | null;
  /** Маржа на 1 продажу прошлого окна 28д при том же b₉₀, %. */
  priorMarginPercent: number | null;
  priorMarginWindowU: number | null;
  priorMarginWindowP: number | null;
  breakEvenPrice: number | null;
  breakEvenImpossible: boolean;
  storageExcluded: boolean;
  feeRateK: number | null;
  taxRateUsed: number | null;
  taxSpecified: boolean;
  rebillRub: number | null;
  penRub: number | null;
  logisticsPerUnit: number | null;
  storagePerUnit: number | null;
  sellerRevenueS: number | null;
  contentScore: number | null;
  /** Полный список недоборов (обязательные WB первыми), по одной строке. */
  contentGaps?: string[] | null;
  /** Склеенный список для совместимости / краткого UI. */
  contentGap: string | null;
  /** Средние фото/видео по товарам той же категории с продажами 28д. */
  contentPeerLine?: string | null;
  photoCount: number | null;
  hasVideo?: boolean | null;
  subjectId?: number | null;
  contentParts?: { media: number; filters: number; copy: number } | null;
  contentSlots?: Record<string, number | "na"> | null;
  contentGrade?: "A" | "B" | "C" | "D" | null;
  contentRequiredMissing?: string[] | null;
  createdAt: string | null;
  /** Источник dailyPace / coverDays, если темп посчитан. */
  paceSource: TaskPaceSource | null;
  funnelStatus: TaskFunnelStatus;
  orders: number | null;
  priorOrders: number | null;
  ordersPerDay: number | null;
  /** Средние заказы/день за прошлые 28 дней воронки. Для темпа до обнуления. */
  priorOrdersPerDay: number | null;
  openCount: number | null;
  priorOpenCount: number | null;
  cartCount: number | null;
  priorCartCount: number | null;
  addToCartPercent: number | null;
  priorAddToCartPercent: number | null;
  cartToOrderPercent: number | null;
  priorCartToOrderPercent: number | null;
  avgOrderPrice: number | null;
  /** Сумма заказов текущего окна воронки (для оценки денег и оборота магазина). */
  orderSum: number | null;
  priorOrderSum: number | null;
  /** Даты окон воронки для текста задачи. */
  funnelDateFrom: string | null;
  funnelDateTo: string | null;
  funnelPastDateFrom: string | null;
  funnelPastDateTo: string | null;
  /** % выкупа из past воронки (дозревший). */
  buyoutPercentFunnelPast: number | null;
  /** Выкупы/заказы прошлого окна воронки — для сглаживания b. */
  pastBuyoutCount: number | null;
  pastOrderCount: number | null;
  /** % выкупа из stocks-report (если поле пришло). */
  buyoutPercentStocks: number | null;
  /** Остаток на складах WB / продавца из каталога. */
  stockFbo: number | null;
  stockFbs: number | null;
  /** Остаток «на текущий день» из stocks-report (может отличаться от catalog totalStock). */
  stockCountReport: number | null;
  fromClientCount: number | null;
  toClientCount: number | null;
  lostOrdersCount: number | null;
  lostOrdersSum: number | null;
  lostBuyoutsCount: number | null;
  lostBuyoutsSum: number | null;
  /** Дни из officeMissingTime, если значение обычное; иначе null (см. special). */
  officeMissingTime: number | null;
  officeMissingTimeSpecial: string | null;
  availability: string | null;
  stocksAvgOrders: number | null;
  stocksOrdersCount: number | null;
  saleRateDays: number | null;
  avgStockTurnoverDays: number | null;
  /** Сумма реализации артикула за 28д (fallback оборота магазина). */
  retailSum: number | null;
  /**
   * Дни наличия и заказы в них.
   * officeMissingTime в спеке неоднозначен → пока null (не выводить дни наличия из него).
   */
  daysInStock: number | null;
  ordersInStockDays: number | null;
  /**
   * Хранение 1 шт. в день, ₽.
   * Из paid_storage (warehousePrice / barcodesCount); иначе null.
   * Реализация даёт сумму хранения по nmId, но не средний остаток — формулу без avgStock не считаем.
   */
  storagePerUnitDay: number | null;
  storageSource: "paid_storage" | "seller_warehouse" | "wb_zero" | null;
  /** Сумма paidStorage из реализации за текущие 28д (evidence; не ставка в день). */
  realizationStorageRub: number | null;
  /** Отзывы 180д: среднее и число. */
  reviewCount180: number | null;
  reviewRatingAvg: number | null;
  unansweredReviews: number | null;
  unansweredNegativeReviews: number | null;
  unansweredQuestionsNm: number | null;
  /** Негатив без ответа >24ч (для задачи). */
  staleNegativeReviews: Array<{
    id: string;
    createdAt: string;
    rating: number;
    preview: string;
    /** false — отмена/не на карточке; важность не выше Возможности. */
    countsOnCard: boolean;
  }> | null;
  staleQuestions: Array<{ id: string; createdAt: string; preview: string }> | null;
  /** Негатив за 28 дней (для TASK_NEGATIVE_SHARE_UP). */
  windowNegativeReviews: Array<{
    id: string;
    createdAt: string;
    rating: number;
    preview: string;
  }> | null;
  /** Доля негатива: окно 28д / база 152д. */
  negativeWindowNeg: number | null;
  negativeWindowN: number | null;
  negativeBaseNeg: number | null;
  negativeBaseN: number | null;
  /** Дата загрузки отчёта реализации (для evidence при fallback burn / b_shop). */
  realizationLoadedAt: string | null;
};

export type TaskBaseline = {
  stock: number | null;
  promoPrice: number | null;
  marginPercent: number | null;
  salesQty: number | null;
  priorSalesQty: number | null;
  coverDays: number | null;
  /** Когда baseline последний раз записали (каждый reconcile). Не для дней OOS. */
  updatedAt?: string | null;
  /**
   * Когда остаток впервые стал 0 в текущей серии OOS.
   * Ставится только на переходе >0 → 0, сбрасывается при stock > 0.
   */
  stockOutAt?: string | null;
};

export type StoreTaskFacts = {
  unansweredFeedbacks: number | null;
  unansweredQuestions: number | null;
  /** Снимок отзывов: нет доступа / готов / не грузили. */
  feedbacksStatus: "ok" | "partial" | "rate_limited" | "forbidden" | "error" | "not_loaded" | null;
  unansweredPositiveCount: number | null;
  unansweredPositiveProductCount: number | null;
  /**
   * Реклама кабинета прочитана полностью: список кампаний со ставками и статистика за окно.
   * Только тогда отсутствие условия у рекламной задачи значит «исправлено», а не «данные ещё не догрузились».
   */
  adsReady?: boolean;
};

export type SellerTask = {
  id: string;
  storeId: string;
  nmId: string | null;
  itemId: string | null;
  productTitle: string | null;
  vendorCode: string | null;
  type: TaskType;
  category: TaskCategory;
  severity: TaskSeverity;
  status: TaskStatus;
  title: string;
  description: string;
  reason: string;
  evidence: TaskEvidence;
  recommendation: string;
  actionType: TaskActionType;
  businessImpactType: TaskImpactType;
  score: number;
  sourceEventId: string | null;
  createdAt: string;
  updatedAt: string;
  snoozeUntil: string | null;
  resolvedAt: string | null;
  resolution: string | null;
};

export type TaskDraft = {
  type: TaskType;
  category: TaskCategory;
  nmId: string | null;
  itemId: string | null;
  productTitle: string | null;
  vendorCode: string | null;
  baseSeverity: TaskSeverity;
  /** Scoring не опускает приоритет ниже этого уровня. */
  severityFloor: TaskSeverity;
  /** Scoring не поднимает приоритет выше этого уровня. */
  severityCeiling: TaskSeverity;
  title: string;
  description: string;
  reason: string;
  evidence: TaskEvidence;
  recommendation: string;
  actionType: TaskActionType;
  businessImpactType: TaskImpactType;
  eventKind: string | null;
};

export type TaskEventRef = {
  id: string;
  kind: string;
  nmId: string | null;
  /** Когда событие записали (для окна 56д у «Не продаётся»). */
  createdAt?: string | null;
};

export const OPEN_TASK_STATUSES: readonly TaskStatus[] = ["active", "in_progress", "snoozed"];

/** Поля stocks-report / дней наличия — дефолты для тестов и parse. */
export const EMPTY_STOCKS_REPORT_FIELDS = {
  buyoutPercentFunnelPast: null as number | null,
  pastBuyoutCount: null as number | null,
  pastOrderCount: null as number | null,
  buyoutPercentStocks: null as number | null,
  stockFbo: null as number | null,
  stockFbs: null as number | null,
  stockCountReport: null as number | null,
  fromClientCount: null as number | null,
  toClientCount: null as number | null,
  lostOrdersCount: null as number | null,
  lostOrdersSum: null as number | null,
  lostBuyoutsCount: null as number | null,
  lostBuyoutsSum: null as number | null,
  officeMissingTime: null as number | null,
  officeMissingTimeSpecial: null as string | null,
  availability: null as string | null,
  stocksAvgOrders: null as number | null,
  stocksOrdersCount: null as number | null,
  saleRateDays: null as number | null,
  avgStockTurnoverDays: null as number | null,
  retailSum: null as number | null,
  daysInStock: null as number | null,
  ordersInStockDays: null as number | null,
  storagePerUnitDay: null as number | null,
  storageSource: null as "paid_storage" | "seller_warehouse" | "wb_zero" | null,
  realizationStorageRub: null as number | null,
  reviewCount180: null as number | null,
  reviewRatingAvg: null as number | null,
  unansweredReviews: null as number | null,
  unansweredNegativeReviews: null as number | null,
  unansweredQuestionsNm: null as number | null,
  staleNegativeReviews: null as Array<{
    id: string;
    createdAt: string;
    rating: number;
    preview: string;
    countsOnCard: boolean;
  }> | null,
  staleQuestions: null as Array<{ id: string; createdAt: string; preview: string }> | null,
  windowNegativeReviews: null as Array<{
    id: string;
    createdAt: string;
    rating: number;
    preview: string;
  }> | null,
  negativeWindowNeg: null as number | null,
  negativeWindowN: null as number | null,
  negativeBaseNeg: null as number | null,
  negativeBaseN: null as number | null,
  realizationLoadedAt: null as string | null,
  marginWindowP: null as number | null,
  marginBeforeCostP: null as number | null,
  unitSaleNoDeliveries: false,
  unitSaleD: null as number | null,
  unitSaleR: null as number | null,
  unitSaleDeliveryUnit: null as number | null,
  unitSaleReturnUnit: null as number | null,
  unitSaleB: null as number | null,
  unitSaleNetSales90: null as number | null,
  acceptancePerUnit: null as number | null,
  unitSaleWindowMarginPercent: null as number | null,
  unitSaleWindowMarginRub: null as number | null,
  marginWindowU: null as number | null,
  priorMarginPercent: null as number | null,
  priorMarginWindowU: null as number | null,
  priorMarginWindowP: null as number | null,
  breakEvenPrice: null as number | null,
  breakEvenImpossible: false,
  storageExcluded: false,
  feeRateK: null as number | null,
  taxRateUsed: null as number | null,
  taxSpecified: false,
  rebillRub: null as number | null,
  penRub: null as number | null,
  logisticsPerUnit: null as number | null,
  storagePerUnit: null as number | null,
  sellerRevenueS: null as number | null,
};
