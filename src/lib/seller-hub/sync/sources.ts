import { wbLimitFor, type WbTokenKind } from "@/lib/seller-hub/wb-limits";

/**
 * Источники фонового сбора: что воркер читает из WB, как часто и сколько запросов это стоит.
 * Источник = то, что реально выполняется одним заданием (src/lib/seller-hub/sync/jobs.ts), а не отдельный метод WB.
 * Частота выбрана так, чтобы данные были как можно свежее, а расход лимита WB оставался с запасом (см. `hourlyLoad`):
 * лимит делится между фоном, ручным «Обновить данные» и действиями агентов, поэтому фон не должен забирать его целиком.
 * Число запросов за прогон здесь оценка, её сверяют с живым прогоном (воркер печатает фактический расход по каждому лимиту).
 */

export type SyncSourceId =
  | "base"
  | "ads_stats"
  | "funnel"
  | "stocks_report"
  | "paid_storage"
  | "realization"
  | "feedbacks"
  | "blocked"
  | "tariffs"
  | "subscription"
  | "news"
  | "history";

export type SyncEndpoint = {
  method: string;
  path: string;
  /** Сколько запросов стоит один прогон при таком числе товаров (оценка сверху). */
  calls: (skus: number) => number;
};

/**
 * Полоса выполнения. Быстрые источники (база, отзывы, блокировки) идут своей очередью и не ждут медленных:
 * платное хранение или реклама могут читаться минутами из-за лимитов WB, а цены и остатки при этом не должны устаревать.
 * Лимиты WB соблюдает шлюз на уровне запросов, поэтому полосы друг другу не мешают.
 */
export type SyncLane = "fast" | "slow";

export type SyncSource = {
  id: SyncSourceId;
  lane: SyncLane;
  title: string;
  /** Как часто обновлять, мс. */
  everyMs: number;
  /** Меньше — раньше. Базовый снимок нужен всем остальным, поэтому он первый. */
  priority: number;
  /** Источники, без свежего снимка которых этот не имеет смысла (читаются раньше). */
  needs: SyncSourceId[];
  endpoints: SyncEndpoint[];
};

const MIN = 60_000;
const HOUR = 60 * MIN;
const pages = (skus: number, perPage: number) => Math.max(1, Math.ceil(skus / perPage));

export const SYNC_SOURCES: readonly SyncSource[] = [
  {
    id: "base",
    lane: "fast",
    title: "Каталог, цены, остатки, акции, заказы, поставки, реклама (список), финансы",
    everyMs: 15 * MIN,
    priority: 0,
    needs: [],
    endpoints: [
      { method: "POST", path: "/content/v2/get/cards/list", calls: (n) => pages(n, 100) },
      { method: "GET", path: "/api/v2/list/goods/filter", calls: (n) => pages(n, 1000) },
      { method: "POST", path: "/api/v3/stocks/{warehouseId}", calls: (n) => pages(n, 1000) * 3 },
      { method: "POST", path: "/api/analytics/v1/stocks-report/wb-warehouses", calls: (n) => pages(n, 1000) },
      { method: "GET", path: "/api/v1/calendar/promotions", calls: () => 1 },
      { method: "GET", path: "/api/v1/calendar/promotions/details", calls: () => 2 },
      { method: "GET", path: "/api/v1/calendar/promotions/nomenclatures", calls: (n) => 10 * pages(n, 1000) },
      { method: "GET", path: "/adv/v1/promotion/count", calls: () => 1 },
      { method: "GET", path: "/api/advert/v2/adverts", calls: (n) => 1 + pages(n, 100) },
      { method: "GET", path: "/adv/v1/budget", calls: (n) => pages(n, 50) },
    ],
  },
  {
    id: "ads_stats",
    lane: "slow",
    title: "Статистика рекламы (две недели по дням и товарам)",
    everyMs: HOUR,
    priority: 1,
    needs: ["base"],
    // Два окна по 7 дней; одна пачка до 50 кампаний.
    endpoints: [{ method: "GET", path: "/adv/v3/fullstats", calls: (n) => 2 * pages(n, 250) }],
  },
  {
    id: "feedbacks",
    lane: "fast",
    title: "Отзывы и вопросы",
    everyMs: 15 * MIN,
    priority: 1,
    needs: [],
    endpoints: [
      { method: "GET", path: "/api/v1/feedbacks", calls: () => 3 },
      { method: "GET", path: "/api/v1/questions", calls: () => 3 },
    ],
  },
  {
    id: "funnel",
    lane: "slow",
    title: "Воронка продаж",
    everyMs: 2 * HOUR,
    priority: 2,
    needs: ["base"],
    endpoints: [{ method: "POST", path: "/api/analytics/v3/sales-funnel/products", calls: (n) => 2 * pages(n, 500) }],
  },
  {
    id: "stocks_report",
    lane: "slow",
    title: "Отчёт об остатках по складам WB",
    everyMs: HOUR,
    priority: 2,
    needs: ["base"],
    endpoints: [{ method: "POST", path: "/api/analytics/v1/stocks-report/wb-warehouses", calls: (n) => pages(n, 1000) }],
  },
  {
    id: "blocked",
    lane: "fast",
    title: "Заблокированные карточки",
    everyMs: HOUR,
    priority: 2,
    needs: [],
    endpoints: [{ method: "GET", path: "/api/v1/analytics/banned-products/blocked", calls: () => 1 }],
  },
  {
    // Подписка «Джем»: от неё зависят расширенные данные и возможности агента. Меняется редко.
    id: "subscription",
    lane: "fast",
    title: "Подписка продавца «Джем»",
    everyMs: 6 * HOUR,
    priority: 3,
    needs: [],
    endpoints: [{ method: "GET", path: "/api/common/v1/subscriptions", calls: () => 1 }],
  },
  {
    id: "tariffs",
    lane: "fast",
    title: "Тарифы WB на логистику и хранение",
    everyMs: HOUR,
    priority: 2,
    needs: [],
    endpoints: [{ method: "GET", path: "/api/v1/tariffs/box", calls: () => 1 }],
  },
  {
    // Новости портала WB: события «что происходит в маркетплейсе». Профиль продавца берём из базового снимка.
    id: "news",
    lane: "fast",
    title: "Новости портала WB",
    everyMs: 20 * MIN,
    priority: 3,
    needs: ["base"],
    // Страницы WB идут не чаще раза в минуту; обычный прогон читает одну-две.
    endpoints: [{ method: "GET", path: "/api/communications/v2/news", calls: () => 2 }],
  },
  {
    // История по дням (воронка за законченные дни и остаток) копится в нашей базе, чтобы графики и события не зависели от WB.
    id: "history",
    lane: "slow",
    title: "История показателей по дням",
    everyMs: 3 * HOUR,
    priority: 3,
    needs: ["base"],
    endpoints: [
      { method: "POST", path: "/api/analytics/v3/sales-funnel/products", calls: () => 3 },
      { method: "POST", path: "/api/analytics/v1/stocks-report/wb-warehouses", calls: (n) => pages(n, 1000) },
    ],
  },
  {
    id: "paid_storage",
    lane: "slow",
    title: "Платное хранение",
    everyMs: 6 * HOUR,
    priority: 3,
    needs: ["base"],
    endpoints: [
      { method: "GET", path: "/api/v1/paid_storage", calls: () => 8 },
      { method: "GET", path: "/api/v1/paid_storage/tasks/{task_id}/status", calls: () => 12 },
      { method: "GET", path: "/api/v1/paid_storage/tasks/{task_id}/download", calls: () => 4 },
    ],
  },
  {
    id: "realization",
    lane: "slow",
    title: "Отчёт реализации",
    everyMs: 24 * HOUR,
    priority: 3,
    needs: ["base"],
    endpoints: [
      { method: "POST", path: "/api/finance/v1/sales-reports/list", calls: () => 1 },
      { method: "POST", path: "/api/finance/v1/sales-reports/detailed", calls: (n) => 3 * pages(n, 500) },
    ],
  },
];

export function syncSource(id: SyncSourceId): SyncSource {
  const found = SYNC_SOURCES.find((s) => s.id === id);
  if (!found) throw new Error(`Неизвестный источник сбора: ${id}`);
  return found;
}

export type HourlyLoad = {
  /** Ключ общей очереди лимита. */
  key: string;
  /** Запросов в час от всех источников фона. */
  used: number;
  /** Сколько запросов в час позволяет WB по этому ключу. */
  capacity: number;
  /** Доля лимита, которую занимает фон (0..1). */
  share: number;
};

/**
 * Сколько лимита WB в час занимает фоновый сбор кабинета с `skus` товарами.
 * Методы одной категории суммируются (у них общий лимит), остальные считаются отдельно.
 */
export function hourlyLoad(skus: number, token: WbTokenKind = "personal"): HourlyLoad[] {
  const byKey = new Map<string, HourlyLoad>();
  for (const source of SYNC_SOURCES) {
    const runsPerHour = HOUR / source.everyMs;
    for (const endpoint of source.endpoints) {
      const limit = wbLimitFor(endpoint.method, endpoint.path, token);
      const capacity = limit.perPeriod * (HOUR / limit.periodMs);
      const row = byKey.get(limit.key) ?? { key: limit.key, used: 0, capacity, share: 0 };
      row.used += endpoint.calls(skus) * runsPerHour;
      byKey.set(limit.key, row);
    }
  }
  return [...byKey.values()].map((row) => ({ ...row, share: row.used / row.capacity })).sort((a, b) => b.share - a.share);
}
