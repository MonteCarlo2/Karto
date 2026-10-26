import type {
  SellerAdCampaignRow,
  SellerAdBidRecommendation,
  SellerAdCampaignStats,
  SellerAdClusters,
  SellerAdClusterStat,
  SellerAdDayStats,
  SellerAdNmDay,
  SellerAdNmStats,
  SellerAdsSnapshot,
  SellerAdsStats,
} from "@/lib/seller-hub/types";
import { WildberriesApiError } from "./client";

const ADVERT_BASE = "https://advert-api.wildberries.ru";
const REQUEST_TIMEOUT_MS = 45_000;
const ADVERT_MIN_INTERVAL_MS = 250;

let lastAdvertCallAt = 0;

const STATUS_LABEL: Record<number, string> = {
  4: "Готова к запуску",
  7: "Завершена",
  8: "Отказ",
  9: "Активна",
  11: "На паузе",
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeToken(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new WildberriesApiError("API-токен не указан", 400);
  return trimmed.startsWith("Bearer ") ? trimmed.slice(7).trim() : trimmed;
}

async function advertFetch(
  token: string,
  path: string,
  /** Тело JSON: если задано, запрос уходит как POST (только чтение: бюджеты кампаний). */
  jsonBody?: unknown
): Promise<{ status: number; ok: boolean; text: string }> {
  const now = Date.now();
  const wait = Math.max(0, ADVERT_MIN_INTERVAL_MS - (now - lastAdvertCallAt));
  if (wait > 0) await sleep(wait);
  lastAdvertCallAt = Date.now();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${ADVERT_BASE}${path}`, {
      method: jsonBody === undefined ? "GET" : "POST",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${normalizeToken(token)}`,
        ...(jsonBody === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(jsonBody === undefined ? {} : { body: JSON.stringify(jsonBody) }),
      cache: "no-store",
    });
    return { status: res.status, ok: res.ok, text: await res.text() };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new WildberriesApiError("Wildberries Advert не ответил вовремя", 504);
    }
    throw new WildberriesApiError(
      e instanceof Error ? e.message : "Не удалось связаться с Wildberries Advert",
      502
    );
  } finally {
    clearTimeout(timeout);
  }
}

function parseJson<T>(text: string): T | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

type AdvertCountGroup = {
  type?: number;
  status?: number;
  count?: number;
  advert_list?: Array<{ advertId?: number; changeTime?: string }>;
};

/** Ответ GET /api/advert/v2/adverts: поля настроек лежат либо в корне, либо в settings. */
type AdvertV2Row = {
  id?: number;
  advertId?: number;
  name?: string;
  status?: number;
  type?: number;
  bid_type?: string;
  payment_type?: string;
  dailyBudget?: number;
  budget?: number;
  settings?: {
    name?: string;
    payment_type?: string;
    placements?: { search?: boolean; recommendations?: boolean };
  };
  nm_settings?: Array<{
    nm_id?: number;
    bids_kopecks?: { search?: number; recommendations?: number };
  }>;
};

/** Ответ POST /api/advert/v2/budget: поля бюджета (total — остаток), id кампании может называться по-разному. */
type AdvertBudgetRow = {
  advertId?: number;
  advert_id?: number;
  id?: number;
  cash?: number;
  netting?: number;
  total?: number;
};

/** Рекламные кампании WB (продвижение). */
export async function fetchWbAdsSnapshot(token: string): Promise<SellerAdsSnapshot> {
  const countRes = await advertFetch(token, "/adv/v1/promotion/count");
  if (!countRes.ok) {
    throw new WildberriesApiError(
      countRes.status === 401 || countRes.status === 403
        ? "Нет доступа к категории «Продвижение» для рекламных кампаний"
        : `Wildberries Advert API вернул ${countRes.status}`,
      countRes.status
    );
  }

  const countPayload = parseJson<{ adverts?: AdvertCountGroup[]; all?: number }>(countRes.text);
  const allIds: number[] = [];
  for (const group of countPayload?.adverts ?? []) {
    for (const advert of group.advert_list ?? []) {
      if (advert.advertId) allIds.push(advert.advertId);
    }
  }

  /** WB: balance — лимит оплаты по взаиморасчёту, net — счёт продвижения (его пополняет продавец), bonus — бонусы WB. */
  let balance: number | null = null;
  let accountNet: number | null = null;
  let bonus: number | null = null;
  const balanceRes = await advertFetch(token, "/adv/v1/balance");
  if (balanceRes.ok) {
    const balancePayload = parseJson<{ balance?: number; net?: number; bonus?: number }>(balanceRes.text);
    balance = balancePayload?.balance ?? balancePayload?.net ?? null;
    accountNet = typeof balancePayload?.net === "number" ? balancePayload.net : null;
    bonus = typeof balancePayload?.bonus === "number" ? balancePayload.bonus : null;
  }

  const campaigns: SellerAdCampaignRow[] = [];
  let detailsHttpStatus: number | null = null;
  for (let i = 0; i < allIds.length; i += 50) {
    const batch = allIds.slice(i, i + 50);
    const params = new URLSearchParams({ ids: batch.join(",") });
    const detailsRes = await advertFetch(token, `/api/advert/v2/adverts?${params}`);
    if (!detailsRes.ok) {
      detailsHttpStatus = detailsRes.status;
      continue;
    }
    const detailsPayload = parseJson<{ adverts?: AdvertV2Row[] }>(detailsRes.text);
    for (const row of detailsPayload?.adverts ?? []) {
      const advertId = row.id ?? row.advertId;
      if (!advertId) continue;
      campaigns.push({
        id: String(advertId),
        name: row.settings?.name ?? row.name,
        status: row.status,
        statusLabel: row.status != null ? (STATUS_LABEL[row.status] ?? `Статус ${row.status}`) : undefined,
        type: row.type,
        paymentType: row.settings?.payment_type ?? row.payment_type,
        budget: row.budget ?? null,
        dailyBudget: row.dailyBudget ?? null,
        bidType: row.bid_type,
        placements:
          typeof row.settings?.placements?.search === "boolean" && typeof row.settings.placements.recommendations === "boolean"
            ? { search: row.settings.placements.search, recommendations: row.settings.placements.recommendations }
            : undefined,
        bids: (row.nm_settings ?? []).flatMap((nm) =>
          nm.nm_id
            ? [
                {
                  nmId: String(nm.nm_id),
                  searchRub: typeof nm.bids_kopecks?.search === "number" ? nm.bids_kopecks.search / 100 : null,
                  recommendationsRub:
                    typeof nm.bids_kopecks?.recommendations === "number" ? nm.bids_kopecks.recommendations / 100 : null,
                },
              ]
            : [],
        ),
      });
    }
  }

  /** Остатки бюджетов кампаний (статусы 4, 9, 11): именно бюджет кампании решает, пойдут ли показы. */
  const budgetIds = campaigns
    .filter((c) => c.status === 4 || c.status === 9 || c.status === 11)
    .map((c) => Number(c.id))
    .filter((id) => Number.isFinite(id));
  for (let i = 0; i < budgetIds.length; i += 50) {
    const budgetRes = await advertFetch(token, "/api/advert/v2/budget", { advertIds: budgetIds.slice(i, i + 50) });
    if (!budgetRes.ok) continue;
    const budgetPayload = parseJson<{ adverts?: AdvertBudgetRow[] }>(budgetRes.text);
    for (const row of budgetPayload?.adverts ?? []) {
      const id = row.advertId ?? row.advert_id ?? row.id;
      const total = typeof row.total === "number" ? row.total : null;
      const campaign = campaigns.find((c) => c.id === String(id));
      if (campaign && total != null) campaign.budget = total;
    }
  }

  /** Дневные лимиты есть только у CPC-кампаний (GET /api/advert/v0/daily-limits); у CPM метод отвечает 400. */
  let dailyLimitsHttpStatus: number | null = null;
  const limitIds = campaigns
    .filter((c) => (c.status === 4 || c.status === 9 || c.status === 11) && c.paymentType === "cpc")
    .map((c) => c.id);
  for (let i = 0; i < limitIds.length; i += 50) {
    const limitRes = await advertFetch(token, `/api/advert/v0/daily-limits?advertIds=${limitIds.slice(i, i + 50).join(",")}`);
    if (!limitRes.ok) {
      dailyLimitsHttpStatus = limitRes.status;
      continue;
    }
    const limitPayload = parseJson<{
      adverts?: Array<{ advertId?: number; enabled?: boolean; dailyLimit?: number; carryOverEnabled?: boolean; requiredLimit?: number }>;
    }>(limitRes.text);
    for (const row of limitPayload?.adverts ?? []) {
      const campaign = campaigns.find((c) => c.id === String(row.advertId));
      if (!campaign) continue;
      campaign.dailyLimit =
        row.enabled && typeof row.dailyLimit === "number"
          ? {
              limitRub: row.dailyLimit,
              carryOver: row.carryOverEnabled === true,
              requiredRub: typeof row.requiredLimit === "number" ? row.requiredLimit : null,
            }
          : null;
    }
  }

  const activeCount = campaigns.filter((c) => c.status === 9).length;
  const pausedCount = campaigns.filter((c) => c.status === 11 || c.status === 4).length;

  return {
    activeCount,
    pausedCount,
    totalCount: campaigns.length || countPayload?.all || allIds.length,
    balance,
    accountNet,
    bonus,
    campaigns,
    detailsHttpStatus: campaigns.length === 0 ? detailsHttpStatus : null,
    dailyLimitsHttpStatus,
  };
}

type FullstatsMetrics = {
  views?: number;
  clicks?: number;
  sum?: number;
  orders?: number;
  sum_price?: number;
  atbs?: number;
};

type FullstatsNm = FullstatsMetrics & { nmId?: number; name?: string };
type FullstatsApp = FullstatsMetrics & { nms?: FullstatsNm[] };
type FullstatsDay = FullstatsMetrics & { date?: string; apps?: FullstatsApp[] };
type FullstatsRow = FullstatsMetrics & { advertId?: number; days?: FullstatsDay[] };

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Статистика кампаний за период (GET /adv/v3/fullstats, до 31 дня, до 50 кампаний за запрос, лимит 3 запроса в минуту).
 * Только чтение. Кампании в статусах 7, 9, 11.
 */
export async function fetchWbAdsStats(
  token: string,
  campaignIds: number[],
  dateFrom: string,
  dateTo: string,
  options: { nmDays?: boolean } = {}
): Promise<SellerAdsStats> {
  const campaigns: SellerAdCampaignStats[] = [];
  for (let i = 0; i < campaignIds.length; i += 50) {
    if (i > 0) await sleep(21_000);
    const params = new URLSearchParams({
      ids: campaignIds.slice(i, i + 50).join(","),
      beginDate: dateFrom,
      endDate: dateTo,
    });
    const res = await advertFetch(token, `/adv/v3/fullstats?${params}`);
    if (!res.ok) {
      throw new WildberriesApiError(
        res.status === 429
          ? "WB ограничил запросы статистики рекламы. Повторите через минуту."
          : res.status === 401 || res.status === 403
            ? "Нет доступа к статистике рекламы: нужна категория «Продвижение»"
            : `Wildberries Advert API вернул ${res.status}`,
        res.status
      );
    }
    const rows = parseJson<FullstatsRow[]>(res.text) ?? [];
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!row.advertId) continue;
      const byNm: Record<string, SellerAdNmStats> = {};
      const days: SellerAdDayStats[] = [];
      const nmDayMap = new Map<string, SellerAdNmDay>();
      for (const day of Array.isArray(row.days) ? row.days : []) {
        if (typeof day.date === "string") {
          days.push({
            date: day.date.slice(0, 10),
            views: num(day.views),
            clicks: num(day.clicks),
            spend: num(day.sum),
            orders: num(day.orders),
            orderSum: num(day.sum_price),
          });
        }
        for (const app of Array.isArray(day.apps) ? day.apps : []) {
          for (const nm of Array.isArray(app.nms) ? app.nms : []) {
            if (!nm.nmId) continue;
            const key = String(nm.nmId);
            const acc = byNm[key] ?? { name: nm.name, views: 0, clicks: 0, spend: 0, orders: 0, orderSum: 0 };
            acc.views += num(nm.views);
            acc.clicks += num(nm.clicks);
            acc.spend += num(nm.sum);
            acc.orders += num(nm.orders);
            acc.orderSum += num(nm.sum_price);
            byNm[key] = acc;
            if (options.nmDays && typeof day.date === "string") {
              const date = day.date.slice(0, 10);
              const dayKey = `${date}|${key}`;
              const cell = nmDayMap.get(dayKey) ?? { date, nmId: key, views: 0, clicks: 0, spend: 0, orders: 0, orderSum: 0 };
              cell.views += num(nm.views);
              cell.clicks += num(nm.clicks);
              cell.spend += num(nm.sum);
              cell.orders += num(nm.orders);
              cell.orderSum += num(nm.sum_price);
              nmDayMap.set(dayKey, cell);
            }
          }
        }
      }
      campaigns.push({
        advertId: String(row.advertId),
        views: num(row.views),
        clicks: num(row.clicks),
        spend: num(row.sum),
        orders: num(row.orders),
        orderSum: num(row.sum_price),
        addToCart: num(row.atbs),
        days,
        byNm,
        ...(options.nmDays ? { nmDays: [...nmDayMap.values()] } : {}),
      });
    }
  }
  return { loadedAt: new Date().toISOString(), dateFrom, dateTo, campaigns };
}

type NormQueryStatsResponse = {
  stats?: Array<{
    advert_id?: number;
    nm_id?: number;
    stats?: Array<{
      norm_query?: string;
      views?: number;
      clicks?: number;
      orders?: number;
      atbs?: number;
      avg_pos?: number;
    }>;
  }>;
};

/**
 * Статистика поисковых кластеров по парам «кампания — артикул» (POST /adv/v0/normquery/stats).
 * Только чтение. До 100 пар за запрос.
 */
export async function fetchWbClusterStats(
  token: string,
  pairs: Array<{ advertId: number; nmId: number }>,
  dateFrom: string,
  dateTo: string
): Promise<SellerAdClusters> {
  const rows: SellerAdClusterStat[] = [];
  for (let i = 0; i < pairs.length; i += 100) {
    const res = await advertFetch(token, "/adv/v0/normquery/stats", {
      from: dateFrom,
      to: dateTo,
      items: pairs.slice(i, i + 100).map((p) => ({ advert_id: p.advertId, nm_id: p.nmId })),
    });
    if (!res.ok) {
      throw new WildberriesApiError(
        res.status === 429
          ? "WB ограничил запросы по кластерам. Повторите через минуту."
          : res.status === 401 || res.status === 403
            ? "Нет доступа к статистике кластеров: нужна категория «Продвижение»"
            : `Wildberries Advert API вернул ${res.status}`,
        res.status
      );
    }
    const payload = parseJson<NormQueryStatsResponse>(res.text);
    for (const group of payload?.stats ?? []) {
      if (!group.advert_id || !group.nm_id) continue;
      for (const stat of group.stats ?? []) {
        if (!stat.norm_query) continue;
        rows.push({
          advertId: String(group.advert_id),
          nmId: String(group.nm_id),
          query: stat.norm_query,
          views: num(stat.views),
          clicks: num(stat.clicks),
          orders: num(stat.orders),
          addToCart: num(stat.atbs),
          avgPos: typeof stat.avg_pos === "number" && Number.isFinite(stat.avg_pos) ? stat.avg_pos : null,
        });
      }
    }
  }
  return { loadedAt: new Date().toISOString(), dateFrom, dateTo, rows };
}

type BidRecommendationResponse = {
  advertId?: number;
  nmId?: number;
  paymentType?: string;
  base?: {
    competitiveBid?: { bidKopecks?: number };
    leadersBid?: { bidKopecks?: number };
  };
};

const kopecksToRub = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value / 100 : null;

/**
 * Рекомендованные ставки по парам «кампания — артикул» (только чтение).
 * У WB лимит 5 запросов в минуту (интервал 12 с): после пятого запроса ждём.
 */
export async function fetchWbBidRecommendations(
  token: string,
  pairs: Array<{ advertId: number; nmId: number }>
): Promise<SellerAdBidRecommendation[]> {
  const result: SellerAdBidRecommendation[] = [];
  for (let i = 0; i < pairs.length; i += 1) {
    if (i >= 5) await sleep(12_500);
    const pair = pairs[i]!;
    const res = await advertFetch(token, `/api/advert/v0/bids/recommendations?nmId=${pair.nmId}&advertId=${pair.advertId}`);
    if (res.status === 429) {
      throw new WildberriesApiError("WB ограничил запросы рекомендованных ставок. Повторите через минуту.", 429);
    }
    if (res.status === 401 || res.status === 403) {
      throw new WildberriesApiError("Нет доступа к рекомендованным ставкам: нужна категория «Продвижение»", res.status);
    }
    if (!res.ok) continue;
    const payload = parseJson<BidRecommendationResponse>(res.text);
    result.push({
      advertId: String(pair.advertId),
      nmId: String(pair.nmId),
      paymentType: payload?.paymentType ?? null,
      competitiveRub: kopecksToRub(payload?.base?.competitiveBid?.bidKopecks),
      leadersRub: kopecksToRub(payload?.base?.leadersBid?.bidKopecks),
    });
  }
  return result;
}
