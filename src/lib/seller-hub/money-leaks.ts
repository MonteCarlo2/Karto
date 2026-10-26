import type { StoreKpis } from "@/lib/seller-hub/analytics-core";
import type { LogisticsCostSummary } from "@/lib/seller-hub/logistics-cost";
import type { MoneyAnalytics } from "@/lib/seller-hub/money-analytics";

/**
 * «Где теряются деньги»: только суммы, которые есть в отчётах WB, без оценок и прогнозов. Каждая строка называет источник и период.
 * Что НЕ считается потерей: деньги, замороженные в остатках (это капитал, не потеря), и реклама (её суммы в отдельной вкладке).
 */

export type LeakKind = "lost_orders" | "loss_products" | "returns" | "delivery_growth" | "penalties";

export type MoneyLeak = {
  id: LeakKind;
  title: string;
  /** Сумма, ₽, положительная. */
  amount: number;
  /** За какой период и откуда сумма. */
  source: string;
  /** Что именно за этим стоит: названия товаров или пояснение. */
  detail: string;
  /** Вкладка аналитики, где можно разобраться. */
  tab: "money" | "stock" | "products";
};

const round = (n: number) => Math.round(n);
const names = (list: Array<{ title: string }>, limit = 3) => list.slice(0, limit).map((p) => p.title).join("; ");

export function buildMoneyLeaks(input: { kpis: StoreKpis | null; money: MoneyAnalytics | null; costs: LogisticsCostSummary | null; days: number }): MoneyLeak[] {
  const { kpis, money, costs, days } = input;
  const out: MoneyLeak[] = [];

  if (kpis?.lost && kpis.lost.sum > 0) {
    out.push({
      id: "lost_orders",
      title: "Упущенные заказы из-за отсутствия товара",
      amount: round(kpis.lost.sum),
      source: `за ${days} дн., считает WB`,
      detail: `${kpis.lost.orders} заказов по ${kpis.lost.products} товарам`,
      tab: "stock",
    });
  }

  if (money) {
    const losing = money.products.filter((p) => p.profit != null && p.profit < 0).sort((a, b) => a.profit! - b.profit!);
    const loss = losing.reduce((s, p) => s - p.profit!, 0);
    if (loss > 0) {
      out.push({
        id: "loss_products",
        title: "Убыток по товарам, которые продаются в минус",
        amount: round(loss),
        source: `за ${days} дн., по отчёту реализации и вашей себестоимости`,
        detail: names(losing),
        tab: "money",
      });
    }
    if (money.current.penalties > 0) {
      out.push({
        id: "penalties",
        title: "Штрафы и удержания WB",
        amount: round(money.current.penalties),
        source: `за ${days} дн., по отчёту реализации`,
        detail: "в маржу не входят",
        tab: "money",
      });
    }
  }

  if (costs) {
    if (costs.returnCost > 0) {
      const top = costs.products.filter((p) => p.returnCost > 0).sort((a, b) => b.returnCost - a.returnCost);
      out.push({
        id: "returns",
        title: "Обратная логистика возвратов",
        amount: round(costs.returnCost),
        source: "за последние 28 дней, по отчёту реализации",
        detail: names(top),
        tab: "products",
      });
    }
    if (costs.overpay > 0) {
      const top = costs.products.filter((p) => p.overpay > 0).sort((a, b) => b.overpay - a.overpay);
      out.push({
        id: "delivery_growth",
        title: "Переплата из-за подорожания доставки",
        amount: round(costs.overpay),
        source: "за последние 28 дней против предыдущих 28",
        detail: names(top),
        tab: "money",
      });
    }
  }

  return out.sort((a, b) => b.amount - a.amount);
}
