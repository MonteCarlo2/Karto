import type { MoneyAnalytics } from "@/lib/seller-hub/money-analytics";

/**
 * Отчёт о прибылях и убытках магазина за период. Все строки берутся из отчёта реализации WB; реклама из статистики WB (она доступна
 * не больше чем за 31 день), налог считается по ставке пользователя. Чего нет в данных, того нет в итоге: строка помечается «нет данных»,
 * а в названии результата прямо сказано, что не учтено. Ничего не оценивается «на глаз».
 */

export type TaxBase = "revenue" | "pay" | "profit";
export type TaxSetting = { ratePercent: number; base: TaxBase };

export const TAX_BASE_LABEL: Record<TaxBase, string> = {
  revenue: "выручки",
  pay: "суммы к перечислению WB",
  profit: "прибыли до налога",
};

export type PnlLine = {
  id: "revenue" | "wbHold" | "pay" | "logistics" | "storage" | "acceptance" | "penalties" | "ads" | "afterCosts" | "cost" | "tax" | "net";
  label: string;
  /** Сумма, ₽. Расходы положительным числом, знак задаёт `kind`. null — данных нет. */
  amount: number | null;
  kind: "income" | "expense" | "subtotal" | "result";
  /** Доля выручки, 0–1. */
  share: number | null;
  /** Источник или оговорка к строке. */
  note: string;
};

export type Pnl = {
  period: { from: string; to: string; days: number };
  lines: PnlLine[];
  /** Чистая прибыль; null — посчитать нельзя (мало данных о себестоимости). */
  net: number | null;
  netMargin: number | null;
  /** Что не учтено в чистой прибыли (пусто — учтено всё). */
  missing: string[];
  costCoverage: number;
  truncated: boolean;
};

/** Меньше этой доли выручки с известной себестоимостью чистую прибыль не считаем: итог был бы заниженным расходом. */
export const MIN_COST_COVERAGE = 0.95;
export const MAX_ADS_DAYS = 30;

export type PnlInput = {
  money: MoneyAnalytics | null;
  /** Расход на рекламу за период, ₽. null — нет данных (период длиннее 31 дня, нет кампаний или статистика не загрузилась). */
  adSpend: number | null;
  /** Почему нет данных по рекламе (для подписи строки). */
  adsNote?: string;
  tax: TaxSetting | null;
};

const rub = (n: number) => Math.round(n);

export function buildPnl(input: PnlInput): Pnl | null {
  const { money, adSpend, tax } = input;
  if (!money) return null;
  const c = money.current;
  const share = (v: number | null) => (v == null || !(c.revenue > 0) ? null : v / c.revenue);
  const adsKnown = adSpend != null;
  const afterCostsValue = c.pay - c.logistics - c.storage - c.acceptance - c.penalties - (adsKnown ? adSpend : 0);
  const costKnown = c.cost != null && c.costCoverage >= MIN_COST_COVERAGE;
  const beforeTax = costKnown ? afterCostsValue - (c.cost ?? 0) : null;

  let taxAmount: number | null = null;
  if (tax && tax.ratePercent > 0) {
    const base = tax.base === "revenue" ? c.revenue : tax.base === "pay" ? c.pay : beforeTax;
    if (base != null) taxAmount = Math.max(0, base) * (tax.ratePercent / 100);
  }
  const taxOn = tax != null && tax.ratePercent > 0;
  const taxNeedsProfit = taxOn && tax!.base === "profit" && beforeTax == null;

  const missing: string[] = [];
  if (!costKnown) missing.push("себестоимость");
  if (!adsKnown) missing.push("реклама");
  if (taxOn && taxAmount == null) missing.push("налог");

  const net = costKnown && (!taxOn || taxAmount != null) && beforeTax != null ? beforeTax - (taxAmount ?? 0) : null;

  const lines: PnlLine[] = [
    { id: "revenue", label: "Выручка", amount: rub(c.revenue), kind: "income", share: share(c.revenue), note: "По цене продавца, отчёт реализации WB" },
    { id: "wbHold", label: "Удержано WB: комиссия, эквайринг и др.", amount: rub(c.wbHold), kind: "expense", share: share(c.wbHold), note: "Выручка минус сумма к перечислению" },
    { id: "pay", label: "К перечислению от WB", amount: rub(c.pay), kind: "subtotal", share: share(c.pay), note: "За продажи минус возвраты" },
    { id: "logistics", label: "Логистика", amount: rub(c.logistics), kind: "expense", share: share(c.logistics), note: "Доставка и обратная логистика" },
    { id: "storage", label: "Хранение", amount: rub(c.storage), kind: "expense", share: share(c.storage), note: "Из строк отчёта реализации; платное хранение FBO из отдельного отчёта может отличаться" },
    { id: "acceptance", label: "Приёмка", amount: rub(c.acceptance), kind: "expense", share: share(c.acceptance), note: "Из отчёта реализации" },
    { id: "penalties", label: "Штрафы и удержания WB", amount: rub(c.penalties), kind: "expense", share: share(c.penalties), note: "Штрафы и удержания за вычетом доплат" },
    { id: "ads", label: "Реклама", amount: adsKnown ? rub(adSpend) : null, kind: "expense", share: share(adsKnown ? adSpend : null), note: adsKnown ? "Расход по рекламным кампаниям, статистика WB" : (input.adsNote ?? "Нет данных") },
    { id: "afterCosts", label: adsKnown ? "Остаётся после расходов WB и рекламы" : "Остаётся после расходов WB (без рекламы)", amount: rub(afterCostsValue), kind: "subtotal", share: share(afterCostsValue), note: "До себестоимости и налога" },
    {
      id: "cost",
      label: "Себестоимость проданного",
      amount: c.cost == null ? null : rub(c.cost),
      kind: "expense",
      share: share(c.cost),
      note: c.cost == null ? "Себестоимость не указана ни у одного товара" : c.costCoverage >= 0.999 ? "По введённой вами себестоимости" : `Указана у товаров, дающих ${Math.round(c.costCoverage * 100)}% выручки`,
    },
  ];
  if (taxOn) {
    lines.push({
      id: "tax",
      label: `Налог (${tax!.ratePercent}% от ${TAX_BASE_LABEL[tax!.base]})`,
      amount: taxAmount == null ? null : rub(taxAmount),
      kind: "expense",
      share: share(taxAmount),
      note: taxNeedsProfit ? "Нужна себестоимость, чтобы посчитать прибыль до налога" : "Расчёт по вашей ставке, не заменяет бухгалтерию",
    });
  }
  lines.push({
    id: "net",
    label: missing.includes("реклама") && net != null ? "Чистая прибыль (без рекламы)" : "Чистая прибыль",
    amount: net == null ? null : rub(net),
    kind: "result",
    share: share(net),
    note: net == null ? "Не посчитана: укажите себестоимость у товаров" : missing.includes("реклама") ? "Расходы на рекламу в этом периоде не учтены" : "Прибыль до распределения, после всех учтённых расходов",
  });

  return { period: money.period, lines, net, netMargin: net == null ? null : share(net), missing, costCoverage: c.costCoverage, truncated: money.truncated };
}
