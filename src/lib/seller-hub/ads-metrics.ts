import type { SellerAdCampaignStats, SellerAdDayStats, SellerAdNmStats } from "@/lib/seller-hub/types";

export type AdsSummary = {
  views: number;
  clicks: number;
  spend: number;
  orders: number;
  orderSum: number;
  addToCart: number;
  /** Клики ÷ показы, %. null — показов не было. */
  ctr: number | null;
  /** Расход ÷ сумма заказов по рекламе, %. null — заказов по рекламе нет. */
  drr: number | null;
  /** Расход ÷ число заказов по рекламе, ₽. null — заказов нет. */
  cpo: number | null;
  /** (Сумма заказов − расход) ÷ расход, %. null — расхода нет. */
  romi: number | null;
};

function ratio(numerator: number, denominator: number, scale: number, digits: number): number | null {
  if (!(denominator > 0)) return null;
  const factor = 10 ** digits;
  return Math.round((numerator / denominator) * scale * factor) / factor;
}

/** Итоги и производные показатели по одной или нескольким кампаниям. Ничего не выдумывает: нет знаменателя — null. */
export function summarizeAds(rows: Pick<SellerAdCampaignStats, "views" | "clicks" | "spend" | "orders" | "orderSum" | "addToCart">[]): AdsSummary {
  const total = rows.reduce(
    (acc, row) => ({
      views: acc.views + row.views,
      clicks: acc.clicks + row.clicks,
      spend: acc.spend + row.spend,
      orders: acc.orders + row.orders,
      orderSum: acc.orderSum + row.orderSum,
      addToCart: acc.addToCart + row.addToCart,
    }),
    { views: 0, clicks: 0, spend: 0, orders: 0, orderSum: 0, addToCart: 0 },
  );
  return {
    ...total,
    spend: Math.round(total.spend * 100) / 100,
    orderSum: Math.round(total.orderSum * 100) / 100,
    ctr: ratio(total.clicks, total.views, 100, 2),
    drr: ratio(total.spend, total.orderSum, 100, 1),
    cpo: ratio(total.spend, total.orders, 1, 2),
    romi: total.spend > 0 ? Math.round(((total.orderSum - total.spend) / total.spend) * 1000) / 10 : null,
  };
}

/** Ряд по дням: суммы по всем кампаниям, отсортированы по дате. */
export function dailyAdsSeries(campaigns: Pick<SellerAdCampaignStats, "days">[]): SellerAdDayStats[] {
  const byDate = new Map<string, SellerAdDayStats>();
  for (const campaign of campaigns) {
    for (const day of campaign.days) {
      const acc = byDate.get(day.date) ?? { date: day.date, views: 0, clicks: 0, spend: 0, orders: 0, orderSum: 0 };
      acc.views += day.views;
      acc.clicks += day.clicks;
      acc.spend += day.spend;
      acc.orders += day.orders;
      acc.orderSum += day.orderSum;
      byDate.set(day.date, acc);
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export type AdsNmRow = SellerAdNmStats & {
  nmId: string;
  summary: AdsSummary;
};

/** Показатели рекламы по артикулам (сумма по кампаниям), по убыванию расхода. */
export function adsByProduct(campaigns: Pick<SellerAdCampaignStats, "byNm">[]): AdsNmRow[] {
  const acc = new Map<string, SellerAdNmStats>();
  for (const campaign of campaigns) {
    for (const [nmId, row] of Object.entries(campaign.byNm)) {
      const cur = acc.get(nmId) ?? { name: row.name, views: 0, clicks: 0, spend: 0, orders: 0, orderSum: 0 };
      cur.views += row.views;
      cur.clicks += row.clicks;
      cur.spend += row.spend;
      cur.orders += row.orders;
      cur.orderSum += row.orderSum;
      cur.name = cur.name ?? row.name;
      acc.set(nmId, cur);
    }
  }
  return [...acc.entries()]
    .map(([nmId, row]) => ({ ...row, nmId, summary: summarizeAds([{ ...row, addToCart: 0 }]) }))
    .sort((a, b) => b.spend - a.spend);
}

/** Изменение показателя к прошлому периоду, %. null — в прошлом периоде было 0 или данных нет. */
export function changePercent(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || !(previous > 0)) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
