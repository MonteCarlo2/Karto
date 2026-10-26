import type { SellerAdCampaignRow, SellerAdCampaignStats, SellerAdsStats, SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import type { AdBenchmark, ProductAdCampaignFact, ProductAdFact, ProductAdTotals, TaskDraft, TaskFact } from "./types";

/** Сколько последних дней окна смотрим, чтобы понять, работала ли кампания «только что». */
const RECENT_DAYS = 3;
/** Расход дня считается упёршимся в лимит, если дошёл до этой доли дневного лимита. */
const LIMIT_HIT_SHARE = 0.95;
const MIN_LIMIT_HIT_DAYS = 2;
/** Меньше стольких заказов по рекламе «хорошо продаётся» не доказывают. */
const MIN_GOOD_ORDERS = 2;

function rub(value: number): string {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function pct(value: number): string {
  return `${value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`;
}

function windowDays(stats: SellerAdsStats): number {
  const days = (Date.parse(stats.dateTo) - Date.parse(stats.dateFrom)) / 86_400_000 + 1;
  return Number.isFinite(days) && days >= 1 ? Math.round(days) : 0;
}

function recentDays(campaign: SellerAdCampaignStats): SellerAdCampaignStats["days"] {
  return [...campaign.days].sort((a, b) => b.date.localeCompare(a.date)).slice(0, RECENT_DAYS);
}

/**
 * Реклама магазина, общая для всех товаров: кампании из кабинета и статистика WB за окно.
 * null — кампании не читали, фактов рекламы нет.
 */
export type AdsFactsContext = {
  campaigns: SellerAdCampaignRow[];
  stats: SellerAdsStats | null;
  statsById: Map<string, SellerAdCampaignStats>;
  storeCpo: number | null;
  /** Прошлое окно той же длины, если оно прочитано. */
  prev: SellerAdsStats | null;
  prevByNm: Map<string, ProductAdTotals> | null;
  benchmark: AdBenchmark | null;
};

/** Меньше стольких показов товар в эталон магазина не берём: доля кликов по нему шумит. */
const BENCHMARK_MIN_VIEWS = 300;

function totalsByNm(stats: SellerAdsStats | null): Map<string, ProductAdTotals> {
  const totals = new Map<string, ProductAdTotals>();
  for (const campaign of stats?.campaigns ?? []) {
    for (const [nmId, own] of Object.entries(campaign.byNm)) {
      const acc = totals.get(nmId) ?? { spend: 0, views: 0, clicks: 0, orders: 0, orderSum: 0 };
      acc.spend += own.spend;
      acc.views += own.views;
      acc.clicks += own.clicks;
      acc.orders += own.orders;
      acc.orderSum += own.orderSum;
      totals.set(nmId, acc);
    }
  }
  return totals;
}

function benchmarkOf(byNm: Map<string, ProductAdTotals>): AdBenchmark | null {
  const rows = [...byNm.values()].filter((row) => row.views >= BENCHMARK_MIN_VIEWS);
  if (rows.length === 0) return null;
  const views = rows.reduce((sum, row) => sum + row.views, 0);
  const clicks = rows.reduce((sum, row) => sum + row.clicks, 0);
  const orders = rows.reduce((sum, row) => sum + row.orders, 0);
  return {
    products: rows.length,
    ctrPercent: views > 0 ? (clicks / views) * 100 : null,
    crPercent: clicks > 0 ? (orders / clicks) * 100 : null,
  };
}

export function buildAdsFactsContext(snapshot: SellerCatalogSnapshot): AdsFactsContext | null {
  const campaigns = snapshot.ads?.campaigns;
  if (!campaigns) return null;
  const stats = snapshot.adsStats && windowDays(snapshot.adsStats) > 0 ? snapshot.adsStats : null;
  const prevRaw = snapshot.adsStatsPrev;
  // Прошлое окно годится только той же длины и строго до текущего: иначе сравнение нечестное.
  const prev =
    stats && prevRaw && windowDays(prevRaw) === windowDays(stats) && prevRaw.dateTo < stats.dateFrom ? prevRaw : null;
  const statsById = new Map((stats?.campaigns ?? []).map((row) => [row.advertId, row]));
  let spend = 0;
  let orders = 0;
  for (const row of stats?.campaigns ?? []) {
    spend += row.spend;
    orders += row.orders;
  }
  return {
    campaigns,
    stats,
    statsById,
    storeCpo: orders > 0 ? spend / orders : null,
    prev,
    prevByNm: prev ? totalsByNm(prev) : null,
    benchmark: stats ? benchmarkOf(totalsByNm(stats)) : null,
  };
}

/** Статусы кампаний, для которых WB отдаёт статистику (7 завершена, 9 идёт, 11 пауза). */
const STATS_STATUSES = new Set([7, 9, 11]);

/**
 * Реклама прочитана целиком: список кампаний со ставками по артикулам и статистика за окно.
 * Только в этом случае рекламную задачу, чьё условие пропало, можно закрывать сразу: товар убрали из кампании,
 * поставили на паузу, пополнили бюджет и т.п. Если что-то не догрузилось, действует обычная выдержка.
 */
export function adsFullyRead(snapshot: SellerCatalogSnapshot): boolean {
  const ads = snapshot.ads;
  if (!ads || ads.detailsHttpStatus != null) return false;
  const needsStats = ads.campaigns.some((c) => c.status != null && STATS_STATUSES.has(c.status));
  if (needsStats && !snapshot.adsStats) return false;
  // Ставки по артикулам нужны, чтобы понять, стоит ли товар в кампании сейчас.
  return ads.campaigns.every((c) => c.bids !== undefined || c.status === 7);
}

export { base as adBase, rub as adRub, pct as adPct, runningCampaigns, spendingNames };

/** Реклама одного товара по всем кампаниям, где он есть в статистике или в списке артикулов. */
export function adFactsForNm(context: AdsFactsContext, nmId: string): ProductAdFact | undefined {
  const { stats } = context;
  const rows: ProductAdCampaignFact[] = [];
  const seen = new Set<string>();
  const add = (campaign: SellerAdCampaignRow | undefined, id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const stat = context.statsById.get(id);
    const own = stat?.byNm[nmId];
    const limit = campaign?.dailyLimit?.limitRub ?? null;
    const recent = stat ? recentDays(stat) : [];
    rows.push({
      id,
      name: campaign?.name ?? id,
      status: campaign?.status ?? null,
      budget: campaign?.budget ?? null,
      dailyLimitRub: limit != null && limit > 0 ? limit : null,
      advertised: campaign?.bids ? campaign.bids.some((bid) => bid.nmId === nmId) : null,
      spend: own?.spend ?? 0,
      orders: own?.orders ?? 0,
      orderSum: own?.orderSum ?? 0,
      recentSpend: recent.reduce((sum, day) => sum + day.spend, 0),
      limitHitDays: limit != null && limit > 0 ? recent.filter((day) => day.spend >= limit * LIMIT_HIT_SHARE).length : 0,
    });
  };
  for (const stat of stats?.campaigns ?? []) {
    if (stat.byNm[nmId]) add(context.campaigns.find((c) => c.id === stat.advertId), stat.advertId);
  }
  for (const campaign of context.campaigns) {
    if ((campaign.bids ?? []).some((bid) => bid.nmId === nmId)) add(campaign, campaign.id);
  }
  // Товара нет ни в одной кампании: правилам рекламы нечего проверять, пакет не раздуваем.
  if (rows.length === 0) return undefined;
  let spend = 0;
  let views = 0;
  let clicks = 0;
  let orders = 0;
  let orderSum = 0;
  for (const stat of stats?.campaigns ?? []) {
    const own = stat.byNm[nmId];
    if (!own) continue;
    spend += own.spend;
    views += own.views;
    clicks += own.clicks;
    orders += own.orders;
    orderSum += own.orderSum;
  }
  const prevTotals = context.prevByNm ? (context.prevByNm.get(nmId) ?? { spend: 0, views: 0, clicks: 0, orders: 0, orderSum: 0 }) : null;
  return {
    prev: prevTotals,
    benchmark: context.benchmark,
    statsReady: stats != null,
    windowDays: stats ? windowDays(stats) : 0,
    dateFrom: stats?.dateFrom ?? null,
    dateTo: stats?.dateTo ?? null,
    spend: Math.round(spend),
    views,
    clicks,
    orders,
    orderSum: Math.round(orderSum),
    drrPercent: orders > 0 && orderSum > 0 ? Math.round((spend / orderSum) * 1000) / 10 : null,
    storeCpo: context.storeCpo == null ? null : Math.round(context.storeCpo),
    campaigns: rows,
  };
}

function base(fact: TaskFact) {
  return {
    nmId: fact.nmId,
    itemId: fact.itemId,
    productTitle: fact.title,
    vendorCode: fact.vendorCode,
    actionType: "OPEN_ADS" as const,
    eventKind: null,
  };
}

function spendingNames(campaigns: ProductAdCampaignFact[]): string {
  return campaigns
    .filter((c) => c.spend > 0)
    .sort((a, b) => b.spend - a.spend)
    .map((c) => `«${c.name}»`)
    .join(", ");
}

/** Идёт ли реклама товара сейчас: есть активная кампания, в которой он стоит. */
function runningCampaigns(ad: ProductAdFact): ProductAdCampaignFact[] {
  return ad.campaigns.filter((c) => c.status === 9 && c.advertised !== false);
}

/**
 * Расход на рекламу товара без единого заказа по рекламе. Порог — маржа с одной продажи:
 * потратили больше, чем заработал бы один заказ. Нет маржи: средняя цена заказа по рекламе магазина.
 */
export function ruleAdNoOrders(fact: TaskFact): TaskDraft | null {
  const ad = fact.adFacts;
  if (!ad?.statsReady || ad.orders > 0 || ad.spend <= 0) return null;
  // Нет остатка — причина в нём, для этого есть отдельная задача.
  if (fact.stock != null && fact.stock <= 0) return null;
  if (runningCampaigns(ad).length === 0) return null;
  const margin = fact.marginRub;
  // Маржа ≤ 0: реклама не причина, эту ситуацию ловит «Убыточная цена».
  const positiveMargin = margin != null && margin > 0 ? margin : null;
  const byMargin = positiveMargin != null;
  const threshold = positiveMargin ?? (margin == null ? ad.storeCpo : null);
  if (threshold == null || threshold <= 0 || ad.spend < threshold) return null;
  const names = spendingNames(ad.campaigns);
  const reasonText = positiveMargin != null
    ? `Маржа с одной продажи ${rub(positiveMargin)}: потрачено больше, чем заработал бы один заказ.`
    : `Это больше, чем в среднем стоит заказ по вашей рекламе (${rub(threshold)}). Маржу товара посчитать нельзя.`;
  const severity = byMargin ? "critical" : "important";
  return {
    ...base(fact),
    type: "TASK_AD_NO_ORDERS",
    category: "economics",
    baseSeverity: severity,
    severityFloor: "important",
    severityCeiling: severity,
    title: "Реклама тратит деньги без заказов",
    description: `За ${ad.windowDays} дн. на рекламу товара потрачено ${rub(ad.spend)} (показов ${ad.views.toLocaleString("ru-RU")}, кликов ${ad.clicks.toLocaleString("ru-RU")}), заказов по рекламе нет. ${reasonText}`,
    reason: byMargin
      ? "Расход на рекламу товара превысил маржу с одной продажи, а заказов по рекламе нет."
      : "Расход на рекламу товара превысил среднюю цену заказа по рекламе магазина, а заказов по рекламе нет.",
    evidence: {
      ad_spend: ad.spend,
      ad_views: ad.views,
      ad_clicks: ad.clicks,
      ad_orders: 0,
      window_days: ad.windowDays,
      margin_rub: positiveMargin != null ? Math.round(positiveMargin) : null,
      threshold_rub: Math.round(threshold),
      threshold_basis: byMargin ? "margin" : "store_cpo",
      campaigns: names || null,
    },
    recommendation: `Уберите артикул из кампании${names ? ` ${names}` : ""} или поставьте её на паузу в разделе «Продвижение». Сначала проверьте цену, главное фото и рейтинг карточки: без них реклама не продаст.${byMargin ? "" : " Введите себестоимость, чтобы видеть маржу и точный порог."}`,
    businessImpactType: "PROFIT_PROTECTION",
  };
}

/**
 * ДРР товара выше его маржи на продаже. Порог берётся из маржи товара (без рекламы), а не задан числом.
 * Заказы здесь — не выкупы: после выкупа запас по марже ещё меньше.
 */
export function ruleAdDrrOverMargin(fact: TaskFact): TaskDraft | null {
  const ad = fact.adFacts;
  if (!ad?.statsReady || ad.orders <= 0 || ad.drrPercent == null) return null;
  const marginPercent = fact.marginPercent;
  const marginRub = fact.marginRub;
  // Минус на продаже уже ловит «Убыточная цена»: реклама там не причина.
  if (marginPercent == null || marginPercent <= 0 || marginRub == null || marginRub <= 0) return null;
  if (ad.drrPercent <= marginPercent) return null;
  // Потратили меньше, чем даёт один заказ: цифры слишком малы, чтобы делать вывод.
  if (ad.spend < marginRub) return null;
  if (runningCampaigns(ad).length === 0) return null;
  const names = spendingNames(ad.campaigns);
  return {
    ...base(fact),
    type: "TASK_AD_DRR_OVER_MARGIN",
    category: "economics",
    baseSeverity: "important",
    severityFloor: "important",
    severityCeiling: "important",
    title: "Реклама съедает прибыль товара",
    description: `ДРР ${pct(ad.drrPercent)} выше маржи ${pct(marginPercent)} (маржа считается без рекламы). За ${ad.windowDays} дн. расход ${rub(ad.spend)} при заказах по рекламе на ${rub(ad.orderSum)}.`,
    reason: "Доля расходов на рекламу в сумме заказов больше маржи товара: прибыль с рекламных заказов не покрывает рекламу.",
    evidence: {
      drr_percent: ad.drrPercent,
      margin_percent: marginPercent,
      ad_spend: ad.spend,
      ad_order_sum: ad.orderSum,
      ad_orders: ad.orders,
      window_days: ad.windowDays,
      campaigns: names || null,
    },
    recommendation: `Снизьте ставку${names ? ` в кампании ${names}` : ""} или поставьте дневной лимит, пока ДРР не станет ниже маржи ${pct(marginPercent)}. Это заказы, а не выкупы: реальный выкуп ниже, значит запас по марже ещё меньше.`,
    businessImpactType: "PROFIT_PROTECTION",
  };
}

type StopReason = "budget" | "paused" | "budget_low" | "daily_limit";

/** Бюджета меньше чем на столько дней текущего расхода считается «скоро закончится». */
const BUDGET_LOW_DAYS = 2;

function stopReason(campaign: ProductAdCampaignFact): StopReason | null {
  if (campaign.advertised === false || campaign.orders <= 0) return null;
  if (campaign.budget != null && campaign.budget <= 0 && (campaign.status === 9 || campaign.status === 11)) return "budget";
  if (campaign.status === 11 && campaign.recentSpend > 0) return "paused";
  if (campaign.status === 9 && campaign.budget != null && campaign.recentSpend > 0) {
    const perDay = campaign.recentSpend / RECENT_DAYS;
    if (campaign.budget / perDay < BUDGET_LOW_DAYS) return "budget_low";
  }
  if (campaign.status === 9 && campaign.dailyLimitRub != null && campaign.limitHitDays >= MIN_LIMIT_HIT_DAYS) return "daily_limit";
  return null;
}

const STOP_ORDER: StopReason[] = ["budget", "paused", "budget_low", "daily_limit"];

/**
 * Кампания, которая приводила заказы, остановилась (кончился бюджет, пауза) или упирается в дневной лимит,
 * а товар хорошо продаётся: ДРР не выше маржи, есть остаток. Причину паузы WB не сообщает, поэтому о ней не гадаем.
 */
export function ruleAdCampaignStopped(fact: TaskFact): TaskDraft | null {
  const ad = fact.adFacts;
  if (!ad?.statsReady || ad.orders < MIN_GOOD_ORDERS || ad.drrPercent == null) return null;
  if (fact.stock == null || fact.stock <= 0) return null;
  const marginPercent = fact.marginPercent;
  if (marginPercent == null || marginPercent <= 0 || ad.drrPercent > marginPercent) return null;
  let picked: { campaign: ProductAdCampaignFact; reason: StopReason } | null = null;
  for (const reason of STOP_ORDER) {
    const campaign = ad.campaigns
      .filter((c) => stopReason(c) === reason)
      .sort((a, b) => b.orders - a.orders)[0];
    if (campaign) {
      picked = { campaign, reason };
      break;
    }
  }
  if (!picked) return null;
  const { campaign, reason } = picked;
  const name = `«${campaign.name}»`;
  const result = `По ней за ${ad.windowDays} дн. ${campaign.orders.toLocaleString("ru-RU")} заказов при ДРР товара ${pct(ad.drrPercent)} (маржа ${pct(marginPercent)}), на складе ${fact.stock.toLocaleString("ru-RU")} шт.`;
  const copy: Record<StopReason, { title: string; lead: string; fix: string; severity: "important" | "opportunity" }> = {
    budget: {
      title: "У рекламной кампании закончился бюджет",
      lead: `Бюджет кампании ${name} 0 ₽, показы не идут.`,
      fix: `Пополните кампанию ${name} в разделе «Продвижение»: пока она стоит, товар теряет заказы, которые приносила реклама.`,
      severity: "important",
    },
    paused: {
      title: "Рекламная кампания на паузе",
      lead: `Кампания ${name} сейчас на паузе, хотя ещё недавно тратила бюджет (причину паузы WB не сообщает).`,
      fix: `Если пауза не нарочная, запустите кампанию ${name} в разделе «Продвижение». Если нарочная, закройте задачу.`,
      severity: "important",
    },
    budget_low: {
      title: "Бюджета рекламной кампании хватит ненадолго",
      lead: `Остаток бюджета кампании ${name} ${rub(campaign.budget ?? 0)}: при расходе последних ${RECENT_DAYS} дней его хватит меньше чем на ${BUDGET_LOW_DAYS} дн.`,
      fix: `Пополните кампанию ${name} в разделе «Продвижение», пока она не остановилась: она приводит заказы с ДРР ниже маржи.`,
      severity: "important",
    },
    daily_limit: {
      title: "Реклама упирается в дневной лимит",
      lead: `Кампания ${name} в ${campaign.limitHitDays} из последних ${RECENT_DAYS} дней расходовала почти весь дневной лимит ${rub(campaign.dailyLimitRub ?? 0)}.`,
      fix: `Если хотите больше заказов, поднимите дневной лимит кампании ${name} в разделе «Продвижение». ДРР при этом следите: он должен оставаться ниже маржи.`,
      severity: "opportunity",
    },
  };
  const text = copy[reason];
  return {
    ...base(fact),
    type: "TASK_AD_CAMPAIGN_STOPPED",
    category: "sales",
    baseSeverity: text.severity,
    severityFloor: text.severity,
    severityCeiling: text.severity,
    title: text.title,
    description: `${text.lead} ${result}`,
    reason: "Кампания приносила заказы с ДРР ниже маржи, но остановилась или упёрлась в ограничение.",
    evidence: {
      stop_reason: reason,
      campaign_name: campaign.name,
      campaign_orders: campaign.orders,
      drr_percent: ad.drrPercent,
      margin_percent: marginPercent,
      stock: fact.stock,
      window_days: ad.windowDays,
      campaign_budget: campaign.budget,
      daily_limit_rub: campaign.dailyLimitRub,
    },
    recommendation: text.fix,
    businessImpactType: "SALES_PROTECTION",
  };
}

/** Остаток нулевой, а товар стоит в активной кампании: реклама ведёт на товар, который нельзя купить. */
export function ruleAdNoStock(fact: TaskFact): TaskDraft | null {
  const ad = fact.adFacts;
  if (!ad || fact.stock == null || fact.stock > 0) return null;
  const live = runningCampaigns(ad).filter((c) => c.advertised === true && (c.budget == null || c.budget > 0));
  if (live.length === 0) return null;
  const names = live.map((c) => `«${c.name}»`).join(", ");
  const spent = ad.statsReady && ad.spend > 0 ? ` За ${ad.windowDays} дн. на него потрачено ${rub(ad.spend)}.` : "";
  return {
    ...base(fact),
    type: "TASK_AD_NO_STOCK",
    category: "economics",
    baseSeverity: "important",
    severityFloor: "important",
    severityCeiling: "important",
    title: "Реклама на товаре без остатка",
    description: `Остаток 0 шт., а товар стоит в активной кампании ${names}.${spent}`,
    reason: "Реклама приводит покупателей на карточку, где нечего купить.",
    evidence: {
      stock: fact.stock,
      campaigns: names,
      campaign_count: live.length,
      ad_spend: ad.statsReady ? ad.spend : null,
      window_days: ad.statsReady ? ad.windowDays : null,
    },
    recommendation: `Уберите артикул из кампании или поставьте её на паузу в разделе «Продвижение», пока товара нет в наличии. Вернуть рекламу стоит после поставки.`,
    businessImpactType: "PROFIT_PROTECTION",
  };
}
