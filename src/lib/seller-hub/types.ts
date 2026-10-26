import type { SellerFeedbacksSnapshot } from "@/lib/seller-hub/feedbacks/types";

export type SellerHubMarketplaceId = "wildberries" | "ozon" | "yandex";

export type SellerHubConnectionStatus = "idle" | "active" | "error";

/** Категории доступа токена, которые нужны разным блокам хаба. */
export type SellerHubScope =
  | "content"
  | "prices"
  | "stocks"
  | "analytics"
  | "promotion"
  | "marketplace"
  | "supplies"
  | "advert";

export type SellerHubScopeState = Partial<Record<SellerHubScope, boolean>>;

export type SellerHubConnection = {
  marketplaceId: SellerHubMarketplaceId;
  apiKey: string;
  clientId?: string;
  campaignId?: string;
  businessId?: string;
  sellerName?: string | null;
  verifiedAt?: string;
  status: SellerHubConnectionStatus;
  lastError?: string;
  catalogCount?: number;
  lastSyncAt?: string;
  scopes?: SellerHubScopeState;
};

export type SellerCatalogItem = {
  id: string;
  marketplaceId: SellerHubMarketplaceId;
  /** nmID у WB, product_id у Ozon, offerId у Яндекса. */
  externalId: string;
  vendorCode: string;
  title: string;
  brand?: string;
  category?: string;
  /** subjectID предмета WB. Нужен, чтобы сравнить карточку со справочником характеристик. */
  subjectId?: number | null;
  description?: string;
  imageUrl?: string;
  imageUrls?: string[];
  /** Прямая ссылка или поток видеообложки, как отдал WB. */
  videoUrl?: string;
  dimensions?: { length?: number; width?: number; height?: number; weightKg?: number };
  /** Цена до скидки. */
  price?: number | null;
  /** Цена с учётом скидки продавца. */
  discountedPrice?: number | null;
  discountPercent?: number | null;
  /** Скидка WB Клуба, %. */
  clubDiscount?: number | null;
  /** Цена с учётом скидки продавца и WB Клуба. */
  clubPrice?: number | null;
  /** Первая оптовая скидка для бизнеса, %. */
  wholesaleDiscount?: number | null;
  /** Скольких штук нужно для этой оптовой скидки. */
  wholesaleMinQty?: number | null;
  /** Закупка, которую вписал продавец. В API Wildberries её нет. */
  costPrice?: number | null;
  stockFbo?: number | null;
  stockFbs?: number | null;
  totalStock?: number | null;
  barcode?: string;
  /** Все SKU/баркоды размеров — нужны для FBS-остатков. */
  skus?: string[];
  /** ID размеров (chrtID) — предпочтительный ключ для FBS-остатков в Marketplace API. */
  chrtIds?: number[];
  sizesCount?: number | null;
  /** Сколько характеристик карточки пришло непустыми. Нет поля — выгрузка их не принесла. */
  filledCharacteristics?: number | null;
  /** Названия заполненных характеристик, как их отдал WB. */
  characteristicNames?: string[];
  /** Сколько полей в справочнике предмета. Нет поля — справочник ещё не читали. */
  categoryCharcCount?: number | null;
  /** Названия полей справочника предмета. */
  categoryCharcNames?: string[];
  /** Обязательные по WB характеристики предмета (`required: true` в charcs). */
  categoryCharcRequiredNames?: string[];
  /** ID акций WB, в которых участвует SKU. */
  promotionIds?: string[];
  /** Дата создания карточки в WB. Нет поля — выгрузка её не принесла. */
  createdAt?: string;
  updatedAt?: string;
};

export type SellerPromotionRow = {
  id: string;
  name: string;
  description?: string;
  startAt?: string;
  endAt?: string;
  type?: string;
  participatingSkuCount?: number;
  inPromoTotal?: number;
  participationPercent?: number;
  /** Можно добавлять товары через calendar upload. Для автоакции метод неприменим. */
  canManageProducts?: boolean;
  /** Преимущества из деталей акции, как прислал WB. */
  advantages?: string[];
  /** Ранжирование из деталей акции. */
  ranging?: Array<{ condition?: string; participationRate?: number; boost?: number }>;
  /** Исключены до старта автоакции. Счётчик WB, списком API не управляет. */
  exceptionProductsCount?: number;
  /** Товары, которые WB не считает участниками. */
  notInPromoTotal?: number;
  /** nmID участников, которые нашлись в каталоге. Счётчик WB сюда не подставляется. */
  participantNmIds?: number[];
};

/** Порог входа в акцию по nmID из календаря WB. Для автоакции метод может не ответить. */
export type SellerPromotionEntryTerms = {
  planPrice?: number;
  planDiscount?: number;
  /** Розничная цена в ответе nomenclatures. */
  price?: number;
  /** true — WB назвал товар участником этой акции. */
  inAction?: boolean;
};

export type SellerDailySalesPoint = {
  date: string;
  orders: number;
  revenue: number;
  buyouts: number;
};

export type SellerAnalyticsSummary = {
  periodStart: string;
  periodEnd: string;
  ordersTotal: number;
  revenueTotal: number;
  buyoutsTotal: number;
  avgOrderValue: number | null;
  daily: SellerDailySalesPoint[];
  currency: string;
};

export type SellerOrderRow = {
  id: string;
  externalId: number;
  nmId?: number;
  article?: string;
  createdAt?: string;
  price?: number | null;
  supplierStatus?: string;
  wbStatus?: string;
  deliveryType?: string;
};

export type SellerOrdersSummary = {
  newCount: number;
  inAssembly: number;
  inDelivery: number;
  delivered: number;
  canceled: number;
  total: number;
  orders: SellerOrderRow[];
  /** Офисы WB (СЦ, ПВЗ), куда вёз товар продавец по заданиям за неделю. */
  officeNames?: string[];
};

export type SellerWarehouse = {
  id: number;
  name: string;
  city?: string;
  type?: string;
};

export type SellerSupplyRow = {
  id: string;
  name?: string;
  done: boolean;
  createdAt?: string;
  closedAt?: string;
  plannedAt?: string;
  type: "fbs" | "fbw";
  status?: string;
  statusId?: number;
  quantity?: number;
  ordersCount?: number;
  /** Склад WB, на который идёт поставка FBW (как прислал WB). */
  warehouseName?: string;
  /** Склад, на который товар принят фактически, если отличается от плановых. */
  actualWarehouseName?: string;
};

export type SellerSuppliesSnapshot = {
  openCount: number;
  closedCount: number;
  supplies: SellerSupplyRow[];
};

export type SellerAdCampaignRow = {
  id: string;
  name?: string;
  status?: number;
  statusLabel?: string;
  type?: number;
  paymentType?: string;
  budget?: number | null;
  dailyBudget?: number | null;
  /** Единая или ручная ставка (bid_type в ответе WB). */
  bidType?: string;
  /** Где показывается реклама: в поиске и в рекомендациях. undefined — WB не вернул. */
  placements?: { search: boolean; recommendations: boolean };
  /** Ставки по артикулам кампании, ₽ (в ответе WB они в копейках). */
  bids?: SellerAdNmBid[];
  /** Дневной лимит расхода кампании. null — лимит не включён; undefined — не читали. */
  dailyLimit?: SellerAdDailyLimit | null;
};

export type SellerAdDailyLimit = {
  /** Лимит, ₽. */
  limitRub: number;
  /** Переносится ли неиспользованный остаток на следующий день. */
  carryOver: boolean;
  /** Минимально допустимый лимит для кампании по оценке WB, ₽. */
  requiredRub: number | null;
};

export type SellerAdNmBid = {
  nmId: string;
  /** Ставка в поиске, ₽. */
  searchRub: number | null;
  /** Ставка в рекомендациях, ₽. */
  recommendationsRub: number | null;
};

/** Рекомендованные WB ставки для артикула в кампании (GET /api/advert/v0/bids/recommendations), ₽. */
export type SellerAdBidRecommendation = {
  advertId: string;
  nmId: string;
  paymentType: string | null;
  /** Конкурентная ставка. null — WB не вернул. */
  competitiveRub: number | null;
  /** Ставка лидеров. */
  leadersRub: number | null;
};

export type SellerAdsSnapshot = {
  activeCount: number;
  pausedCount: number;
  totalCount: number;
  balance?: number | null;
  /** Счёт продвижения (net в ответе WB): его пополняет продавец. */
  accountNet?: number | null;
  /** Бонусы WB на продвижение. */
  bonus?: number | null;
  campaigns: SellerAdCampaignRow[];
  /** HTTP-код, если список кампаний WB насчитал, а детали прочитать не удалось. */
  detailsHttpStatus?: number | null;
  /** HTTP-код, если дневные лимиты кампаний прочитать не удалось. */
  dailyLimitsHttpStatus?: number | null;
};

/** Статистика одной рекламной кампании WB за период (GET /adv/v3/fullstats). */
export type SellerAdCampaignStats = {
  advertId: string;
  views: number;
  clicks: number;
  /** Расход, ₽. */
  spend: number;
  /** Заказы по рекламе, шт. */
  orders: number;
  /** Сумма заказов по рекламе, ₽. */
  orderSum: number;
  addToCart: number;
  /** Разбивка по дням (в ответе WB: days). Пусто, если WB её не вернул. */
  days: SellerAdDayStats[];
  /** Разбивка по артикулам (days → apps → nms), nmId → показатели за период. */
  byNm: Record<string, SellerAdNmStats>;
  /** Показатели по дням и артикулам. Заполняется только по запросу (фоновый сбор копит историю по дням). */
  nmDays?: SellerAdNmDay[];
};

export type SellerAdNmDay = {
  /** ГГГГ-ММ-ДД. */
  date: string;
  nmId: string;
  views: number;
  clicks: number;
  spend: number;
  orders: number;
  orderSum: number;
};

export type SellerAdDayStats = {
  /** ГГГГ-ММ-ДД. */
  date: string;
  views: number;
  clicks: number;
  spend: number;
  orders: number;
  orderSum: number;
};

export type SellerAdNmStats = {
  name?: string;
  views: number;
  clicks: number;
  spend: number;
  orders: number;
  orderSum: number;
};

export type SellerAdsStats = {
  loadedAt: string;
  dateFrom: string;
  dateTo: string;
  campaigns: SellerAdCampaignStats[];
};

/** Поисковый запрос (кластер) товара в рекламной кампании за период (POST /adv/v0/normquery/stats). */
export type SellerAdClusterStat = {
  advertId: string;
  nmId: string;
  query: string;
  views: number;
  clicks: number;
  orders: number;
  addToCart: number;
  /** Средняя позиция в выдаче; null — WB не вернул. */
  avgPos: number | null;
};

export type SellerAdClusters = {
  loadedAt: string;
  dateFrom: string;
  dateTo: string;
  rows: SellerAdClusterStat[];
};

/** Остаток одного артикула на одном складе WB (POST /api/analytics/v1/stocks-report/wb-warehouses). */
export type SellerWarehouseStockRow = {
  nmId: string;
  warehouseId: number;
  warehouseName: string;
  /** Регион, к которому WB относит склад («Центральный», «Склад WB» для виртуальных складов). */
  regionName: string;
  quantity: number;
  inWayToClient: number;
  inWayFromClient: number;
};

export type SellerWarehouseStocks = {
  loadedAt: string;
  rows: SellerWarehouseStockRow[];
};

/** Заказы артикула по региону покупателя за период (из отчёта Statistics «Заказы», отмены считаем отдельно). */
export type SellerRegionOrdersRow = {
  nmId: string;
  /** Федеральный округ покупателя. */
  district: string;
  /** Область или край покупателя. */
  region: string;
  orders: number;
  cancelled: number;
};

export type SellerRegionOrders = {
  loadedAt: string;
  dateFrom: string;
  dateTo: string;
  /** Выгрузка могла быть обрезана лимитом WB: тогда цифры занижены. */
  truncated: boolean;
  rows: SellerRegionOrdersRow[];
  /** Заказы без отмен по дням недели (0 — понедельник … 6 — воскресенье) за законченные дни периода. */
  byWeekday?: number[];
  /** Сколько разных календарных дней каждого дня недели вошло в расчёт. */
  weekdayDates?: number[];
  /** Заказы по календарным дням (по Москве), по возрастанию даты: всего, отменено и сумма заказов без отмен по цене продавца (priceWithDisc). */
  daily?: SellerRegionDailyOrders[];
};

export type SellerRegionDailyOrders = { date: string; orders: number; cancelled: number; sum: number };

/** Заблокированная WB карточка с причиной (GET /api/v1/analytics/banned-products/blocked). */
export type SellerBlockedCard = {
  nmId: string;
  vendorCode?: string;
  title?: string;
  brand?: string;
  reason?: string;
};

/** Тариф WB на короб по складу: логистика и хранение, ₽ (коэффициенты склада уже учтены). */
export type SellerWarehouseTariff = {
  name: string;
  geo: string;
  /** Логистика FBW, первый литр / каждый следующий. */
  deliveryBase: number | null;
  deliveryLiter: number | null;
  /** Хранение в день, первый литр / каждый следующий. */
  storageBase: number | null;
  storageLiter: number | null;
  /** Логистика FBS, первый литр / каждый следующий. */
  fbsBase: number | null;
  fbsLiter: number | null;
};

export type SellerBoxTariffs = {
  loadedAt: string;
  /** На какую дату запрошены тарифы (YYYY-MM-DD). */
  date: string;
  /** Дата начала следующего тарифа, если WB её сообщает. */
  nextFrom: string | null;
  warehouses: SellerWarehouseTariff[];
};

export type SellerBlockedCards = {
  loadedAt: string;
  cards: SellerBlockedCard[];
};

/** Поисковый запрос по товару (POST /api/v2/search-report/product/search-texts). Числа за текущий период. */
export type SellerSearchText = {
  text: string;
  nmId: string;
  /** Сколько раз запрос вводили. */
  frequency: number | null;
  /** Ваша средняя позиция в поиске по запросу; null — товар не показывался. */
  avgPosition: number | null;
  avgPositionDynamics: number | null;
  /** Переходы в карточку из поиска. */
  openCard: number | null;
  /** Добавления в корзину из поиска. */
  addToCart: number | null;
  /** Конверсия из перехода в корзину, %. */
  openToCart: number | null;
  /** Заказы из поиска. */
  orders: number | null;
  /** Конверсия из корзины в заказ, %. */
  cartToOrder: number | null;
  /** Видимость товара в поиске по запросу, %. */
  visibility: number | null;
};

export type SellerSearchTexts = {
  loadedAt: string;
  nmId: string;
  dateFrom: string;
  dateTo: string;
  rows: SellerSearchText[];
};

export type SellerCommsSnapshot = {
  unansweredFeedbacks: number;
  unansweredQuestions: number;
};

export type SellerFinanceDocument = {
  id: string;
  title: string;
  createdAt?: string;
  category?: string;
};

export type SellerFinanceSnapshot = {
  available: boolean;
  balance?: number | null;
  currency?: string;
  forWithdraw?: number | null;
  documents: SellerFinanceDocument[];
  note?: string;
};

/** Списания WB по одному артикулу из детализации отчёта реализации. */
/** Компоненты экономики за одно окно (28 дней по rrDate). */
export type SellerRealizationWindow = {
  /** N: продажи − возвраты, шт. */
  N: number;
  /** S: выручка по цене продавца (retailPriceWithDisc). */
  S: number;
  /** RA: сумма реализации WB (retailAmount). */
  RA: number;
  /** Pay: к перечислению (forPay продаж − возвратов). */
  Pay: number;
  /** L: логистика deliveryService (без rebill). */
  L: number;
  /** A: приёмка. */
  A: number;
  /** Pen: penalty + deduction − additionalPayment. */
  Pen: number;
  /** rebillLogisticCost — информация, не в марже. */
  rebill: number;
  /** Хранение из строк реализации с nmId. */
  StRealization: number;
};

export type SellerRealizationNm = {
  /** Сумма реализации текущего окна (RA). */
  retail: number;
  /**
   * Pay − L − StRealization − A − Pen текущего окна.
   * Штрафы вычитаются здесь для обратной совместимости темпа/капитала;
   * операционная маржа задач считает Pen отдельно (не в P).
   */
  net: number;
  /** Продажи минус возвраты за текущее окно. */
  qty: number;
  /** Продажи минус возвраты за последние 7 дней периода. */
  recentQty?: number;
  /** Первая половина периода. */
  earlyRetail?: number;
  earlyNet?: number;
  /** Вторая половина периода. */
  lateRetail?: number;
  lateNet?: number;
  /** Предыдущие 28 дней, сразу перед текущим окном. */
  priorQty?: number;
  priorRetail?: number;
  priorNet?: number;
  /** Хранение из реализации текущего окна. Не прогноз. */
  storage?: number;
  /** Экономика текущего окна (версия ≥ 4). */
  current?: SellerRealizationWindow;
  /** Экономика прошлого окна (версия ≥ 4). */
  prior?: SellerRealizationWindow;
  /** Доставки текущего окна 28д (для DETERIORATION при общем b₉₀). */
  delivery?: SellerRealizationDelivery90;
  /** Доставки прошлого окна 28д. */
  priorDelivery?: SellerRealizationDelivery90;
};

export type SellerRealizationNoNm = SellerRealizationWindow;

export type SellerRealizationReconcile = {
  /** Максимальный reportId недели (WB может выдать несколько отчётов на одни dateFrom/dateTo). */
  reportId: number | null;
  /** Все reportId той же недели, вошедшие в сверку. */
  reportIds?: number[];
  dateFrom: string;
  dateTo: string;
  bankPaymentSum: number | null;
  computed: number | null;
  delta: number | null;
  ok: boolean | null;
  error?: string;
};

/** Агрегат доставок за 90 дней для маржи на 1 продажу. */
export type SellerRealizationDelivery90 = {
  D: number;
  deliveryCost: number;
  R: number;
  returnCost: number;
  otherL: number;
  S: number;
  Pay: number;
  RA: number;
  A: number;
  StRealization: number;
  /** Чистые продажи шт. за 90д (sale − return). */
  netSalesQty: number;
};

export type SellerRealizationShopDelivery90 = {
  D: number;
  R: number;
  returnCost: number;
  bShop: number;
  rShop: number;
};

/** Окна экономики за последние `days` дней и за `days` дней до них (prior = null, если в выгрузке за 90 дней столько нет). */
export type SellerRealizationPeriod = {
  days: number;
  /** Первый день текущего окна. */
  from: string;
  /** Первый день предыдущего окна; null — предыдущего окна нет. */
  priorFrom: string | null;
  byNm: Record<string, { current: SellerRealizationWindow; prior: SellerRealizationWindow | null }>;
  /** Строки без артикула (штрафы, общая логистика и т. п.). */
  noNm: { current: SellerRealizationWindow; prior: SellerRealizationWindow | null };
};

export type SellerRealizationSnapshot = {
  loadedAt: string;
  /** 5 — + delivery90 / shopDelivery90 за 90 дней. */
  version?: number;
  dateFrom: string;
  dateTo: string;
  truncated?: boolean;
  accountRetail: number;
  accountNet: number;
  byNm: Record<string, SellerRealizationNm>;
  /** Доставки и S/Pay за 90 дней по nm (маржа на 1 продажу). */
  delivery90?: Record<string, SellerRealizationDelivery90>;
  shopDelivery90?: SellerRealizationShopDelivery90;
  /** Строки без nmId за текущее окно (сверка и сводка магазина). */
  noNmCurrent?: SellerRealizationNoNm;
  noNmPrior?: SellerRealizationNoNm;
  /** Сверка последнего недельного отчёта с bankPaymentSum. */
  reconcile?: SellerRealizationReconcile;
  /** Окна экономики для периодов 7/14/28/60/90 дней (версия 6). Ключ — число дней строкой. */
  periods?: Record<string, SellerRealizationPeriod>;
  error?: string;
};

/**
 * Период воронки WB (`statistic.selected` / `statistic.past`).
 * null — поля не было в ответе; 0 — в ответе ноль.
 */
export type SellerFunnelPeriod = {
  openCount: number | null;
  cartCount: number | null;
  orderCount: number | null;
  orderSum: number | null;
  buyoutCount: number | null;
  cancelCount: number | null;
  avgOrdersCountPerDay: number | null;
  avgPrice: number | null;
  addToCartPercent: number | null;
  cartToOrderPercent: number | null;
  buyoutPercent: number | null;
};

/** Заказы и звёзды одного артикула из воронки WB. Это не продажи отчёта реализации. */
export type SellerFunnelNm = {
  orders: number;
  /** Прошлые 28 дней. Нет поля в ответе — сравнение не из чего считать. */
  priorOrders: number | null;
  /** Звёзды покупателей. 0 — отзывов нет. */
  feedbackRating: number | null;
  ordersPerDay: number;
  selected: SellerFunnelPeriod;
  /** Нет объекта past в ответе — null, не пустые нули. */
  past: SellerFunnelPeriod | null;
};

/** Явный итог загрузки воронки. Ошибка не превращается в нули по артикулам. */
export type SellerFunnelLoadStatus =
  | "ok"
  | "partial"
  | "jam_required"
  | "rate_limited"
  | "forbidden"
  | "error"
  | "not_loaded";

/** 2 — selected/past с переходами и конверсиями. Снимки version 1 для задач по спросу устарели. */
export const SELLER_FUNNEL_SNAPSHOT_VERSION = 2 as const;

export type SellerFunnelSnapshot = {
  loadedAt: string;
  /** 1 — только заказы/рейтинг. 2 — + open/cart/conversions за оба периода. */
  version: typeof SELLER_FUNNEL_SNAPSHOT_VERSION | 1;
  dateFrom: string;
  dateTo: string;
  pastDateFrom?: string;
  pastDateTo?: string;
  status?: SellerFunnelLoadStatus;
  /** Прочитаны не все карточки. Артикула нет в byNm — его заказы неизвестны, это не ноль. */
  truncated?: boolean;
  byNm: Record<string, SellerFunnelNm>;
  error?: string;
};

export type SellerCatalogSnapshot = {
  marketplaceId: SellerHubMarketplaceId;
  items: SellerCatalogItem[];
  syncedAt: string;
  totalCount: number;
  truncated?: boolean;
  /** Какие категории токена реально отработали при выгрузке. */
  scopes?: SellerHubScopeState;
  /** Активные и ближайшие акции маркетплейса. */
  promotions?: SellerPromotionRow[];
  /** promotionId → nmId → порог цены/скидки для входа в акцию (кэш при синке). */
  promotionEntryTerms?: Record<string, Record<string, SellerPromotionEntryTerms>>;
  /** Сводка продаж за последние 7 дней. */
  analytics?: SellerAnalyticsSummary;
  /** FBS-сборочные задания и их статусы. */
  orders?: SellerOrdersSummary;
  /** Поставки FBS и FBO. */
  supplies?: SellerSuppliesSnapshot;
  /** Рекламные кампании WB. */
  ads?: SellerAdsSnapshot;
  /** Статистика рекламы за последние 7 полных дней: нужна движку задач. Грузится отдельно от списка кампаний. */
  adsStats?: SellerAdsStats;
  /** То же за предыдущие 7 дней: для тренда эффективности рекламы. */
  adsStatsPrev?: SellerAdsStats;
  /** Заблокированные WB карточки: нужны событиям «заблокирована / разблокирована». */
  blockedCards?: SellerBlockedCards;
  /** Тарифы WB на короба по складам: нужны событию «тарифы логистики и хранения изменились». */
  tariffs?: SellerBoxTariffs;
  /** Неотвеченные отзывы и вопросы. */
  comms?: SellerCommsSnapshot;
  /** Отзывы/вопросы по nmId (Seller Hub, только чтение). */
  feedbacks?: SellerFeedbacksSnapshot;
  /** Баланс и документы, если категория токена это позволяет. */
  finance?: SellerFinanceSnapshot;
  /** Детализация отчёта реализации, свёрнутая по артикулам. */
  realization?: SellerRealizationSnapshot;
  /** Заказы и рейтинг карточек из воронки аналитики. */
  funnel?: SellerFunnelSnapshot;
  /** Отчёт по остаткам Analytics (`/api/v2/stocks-report/products/products`). */
  stocksReport?: SellerStocksReportSnapshot;
  /**
   * Платное хранение Analytics (`/api/v1/paid_storage`, max 8 дней за запрос).
   * По nmId: warehousePrice, barcodesCount → ставка ₽/шт/день.
   */
  paidStorage?: SellerPaidStorageSnapshot;
  /** Мягкие предупреждения: нет доступа к ценам, остаткам и т.п. */
  warnings?: string[];
  /**
   * Кеш справочников характеристик по subjectId (TTL ~7 дней).
   * Клиент отдаёт его обратно при следующем sync-catalog.
   */
  categoryCharcCache?: Record<
    string,
    { names: string[]; requiredNames: string[]; loadedAt: string }
  >;
  /** Сколько категорий продавца со справочником / без / отложено на следующий sync. */
  categoryCharcMeta?: {
    withDictionary: number;
    withoutDictionary: number;
    pending: number;
  };
};

export type SellerPaidStorageLoadStatus =
  | "ok"
  | "partial"
  | "pending"
  | "jam_required"
  | "payment_required"
  | "rate_limited"
  | "forbidden"
  | "error"
  | "not_loaded";

export const SELLER_PAID_STORAGE_SNAPSHOT_VERSION = 2 as const;

export type SellerPaidStorageNm = {
  totalStorageRub: number;
  avgStock: number | null;
  periodDays: number | null;
  /** ₽ за 1 шт. в день. */
  storagePerUnitDay: number | null;
  /** Сумма barcodesCount за период (unit-days). */
  unitDays: number;
  /** Σ warehousePrice за текущие 28 дней окна маржи. */
  currentWindowRub?: number;
  /** Σ warehousePrice за прошлые 28 дней. */
  priorWindowRub?: number;
};

/** Незавершённое async-задание paid_storage (create → status → download). */
export type SellerPaidStoragePendingChunk = {
  taskId: string;
  dateFrom: string;
  dateTo: string;
};

export type SellerPaidStorageSnapshot = {
  loadedAt: string;
  version: typeof SELLER_PAID_STORAGE_SNAPSHOT_VERSION;
  dateFrom: string;
  dateTo: string;
  status?: SellerPaidStorageLoadStatus;
  byNm: Record<string, SellerPaidStorageNm>;
  /** Границы окон маржи, по которым нарезаны current/prior. */
  marginCurrentFrom?: string;
  marginCurrentTo?: string;
  marginPriorFrom?: string;
  marginPriorTo?: string;
  /** Окна, для которых задание ещё не скачано — следующий запрос доберёт. */
  pendingChunks?: SellerPaidStoragePendingChunk[];
  /** Даты последнего успешного отчёта (если текущий прогон pending/error). */
  lastOkDateFrom?: string;
  lastOkDateTo?: string;
  lastOkLoadedAt?: string;
  error?: string;
};

/** Длительность из метрик stocks-report (saleRate / officeMissingTime / …). */
export type SellerStocksReportDuration = {
  days: number;
  hours: number;
};

export type SellerStocksReportLoadStatus =
  | "ok"
  | "partial"
  | "jam_required"
  | "rate_limited"
  | "forbidden"
  | "error"
  | "not_loaded";

export const SELLER_STOCKS_REPORT_SNAPSHOT_VERSION = 1 as const;

export type SellerStocksReportNm = {
  stockCount: number | null;
  toClientCount: number | null;
  fromClientCount: number | null;
  lostOrdersCount: number | null;
  lostOrdersSum: number | null;
  lostBuyoutsCount: number | null;
  lostBuyoutsSum: number | null;
  /** Дни отсутствия, если спека дала обычные days/hours; иначе null. */
  officeMissingTimeDays: number | null;
  officeMissingTimeSpecial: "infinite" | "zero" | "uncalculated" | "entire_period" | null;
  availability: string | null;
  buyoutPercent: number | null;
  avgOrders: number | null;
  ordersCount: number | null;
  saleRateDays: number | null;
  saleRateSpecial: "infinite" | "zero" | "uncalculated" | "entire_period" | null;
  avgStockTurnoverDays: number | null;
  avgStockTurnoverSpecial: "infinite" | "zero" | "uncalculated" | "entire_period" | null;
};

export type SellerStocksReportSnapshot = {
  loadedAt: string;
  version: typeof SELLER_STOCKS_REPORT_SNAPSHOT_VERSION;
  dateFrom: string;
  dateTo: string;
  status?: SellerStocksReportLoadStatus;
  truncated?: boolean;
  byNm: Record<string, SellerStocksReportNm>;
  error?: string;
};

export type SellerCatalogTotals = {
  skuCount: number;
  withPrice: number;
  withStock: number;
  outOfStock: number;
  stockUnits: number;
  inventoryValue: number;
  avgPrice: number | null;
  avgDiscount: number | null;
};

export function emptyCatalogTotals(): SellerCatalogTotals {
  return {
    skuCount: 0,
    withPrice: 0,
    withStock: 0,
    outOfStock: 0,
    stockUnits: 0,
    inventoryValue: 0,
    avgPrice: null,
    avgDiscount: null,
  };
}

export function computeCatalogTotals(items: SellerCatalogItem[]): SellerCatalogTotals {
  if (items.length === 0) return emptyCatalogTotals();

  let withPrice = 0;
  let withStock = 0;
  let outOfStock = 0;
  let stockUnits = 0;
  let inventoryValue = 0;
  let priceSum = 0;
  let discountSum = 0;
  let discountCount = 0;

  for (const item of items) {
    const effectivePrice = item.discountedPrice ?? item.price ?? null;
    if (effectivePrice != null) {
      withPrice += 1;
      priceSum += effectivePrice;
    }

    const stock = item.totalStock ?? null;
    if (stock != null) {
      if (stock > 0) {
        withStock += 1;
        stockUnits += stock;
        if (effectivePrice != null) inventoryValue += stock * effectivePrice;
      } else {
        outOfStock += 1;
      }
    }

    if (item.discountPercent != null) {
      discountSum += item.discountPercent;
      discountCount += 1;
    }
  }

  return {
    skuCount: items.length,
    withPrice,
    withStock,
    outOfStock,
    stockUnits,
    inventoryValue,
    avgPrice: withPrice > 0 ? priceSum / withPrice : null,
    avgDiscount: discountCount > 0 ? discountSum / discountCount : null,
  };
}
