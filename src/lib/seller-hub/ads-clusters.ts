import type { SellerAdClusterStat } from "@/lib/seller-hub/types";

export type ClusterRow = SellerAdClusterStat & {
  /** Клики ÷ показы, %. null — показов нет. */
  ctr: number | null;
};

export type ClusterAnalysis = {
  rows: ClusterRow[];
  /** Конверсия клика в заказ по всей рекламе магазина за период, %. null — кликов не было. */
  storeCr: number | null;
  /** Сколько кликов без заказа считаем «пустыми»: вдвое больше, чем в среднем нужно на один заказ. null — не из чего считать. */
  wasteClicks: number | null;
  /** Запросы с кликами, но без заказов выше порога, по убыванию кликов. */
  wasted: ClusterRow[];
  /** Запросы, которые приносят заказы, по убыванию заказов. */
  working: ClusterRow[];
};

/**
 * Разбор поисковых запросов рекламы.
 * Порог «пустых» кликов выводится из данных самого магазина (средние клики на 1 заказ × 2), а не из общих норм.
 * Если у магазина в рекламе не было ни одного заказа, порога нет и «пустых» запросов мы не объявляем.
 */
export function analyzeClusters(
  rows: SellerAdClusterStat[],
  /** Клики и заказы всей рекламы за период (fullstats). Запросы со <100 показов в список WB не попадают, поэтому суммы по строкам занижают заказы. */
  baseline?: { clicks: number; orders: number },
): ClusterAnalysis {
  const withCtr: ClusterRow[] = rows.map((row) => ({
    ...row,
    ctr: row.views > 0 ? Math.round((row.clicks / row.views) * 10000) / 100 : null,
  }));
  const clicks = baseline?.clicks ?? rows.reduce((sum, row) => sum + row.clicks, 0);
  const orders = baseline?.orders ?? rows.reduce((sum, row) => sum + row.orders, 0);
  const storeCr = clicks > 0 ? Math.round((orders / clicks) * 10000) / 100 : null;
  const wasteClicks = orders > 0 && clicks > 0 ? Math.max(1, Math.ceil((2 * clicks) / orders)) : null;
  const wasted =
    wasteClicks == null
      ? []
      : withCtr.filter((row) => row.orders === 0 && row.clicks >= wasteClicks).sort((a, b) => b.clicks - a.clicks);
  const working = withCtr.filter((row) => row.orders > 0).sort((a, b) => b.orders - a.orders || b.clicks - a.clicks);
  return { rows: withCtr, storeCr, wasteClicks, wasted, working };
}
