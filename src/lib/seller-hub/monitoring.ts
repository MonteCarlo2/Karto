import type { ProductRow } from "@/lib/seller-hub/analytics-core";
import type { LogisticsCostSummary } from "@/lib/seller-hub/logistics-cost";
import type { StockRow } from "@/lib/seller-hub/stock-analytics";

/**
 * «Мониторинг» магазина по направлениям: сколько товаров затронуто в финансах, логистике, рейтинге, контенте, воронке и остатках.
 * Каждый показатель — подсчёт по данным WB и утверждённым расчётам, с названиями затронутых товаров. Пороги указаны в тексте каждого направления.
 */

/** Рейтинг товара ниже этого значения считаем низким (звёзды покупателей, WB). */
export const LOW_RATING = 4.5;
/** Маржа на 1 продажу упала на столько процентных пунктов и больше относительно прошлого окна в 28 дней (расчёт «Задач»; не зависит от периода экрана). */
export const MARGIN_DROP_PP = 5;

export type MonitorSeverity = "bad" | "warn" | "ok" | "unknown";

export type MonitorItem = { nmId: string; title: string; note: string };

export type MonitorDirection = {
  id: "finance" | "logistics" | "rating" | "content" | "funnel" | "stock";
  label: string;
  /** Что именно считается в этом направлении, одной строкой. */
  rule: string;
  severity: MonitorSeverity;
  /** Сколько товаров затронуто; null — данных для направления нет. */
  count: number | null;
  items: MonitorItem[];
};

export type MonitorFact = { nmId: string; marginPercent: number | null; priorMarginPercent: number | null; contentGrade: "A" | "B" | "C" | "D" | null };

const pick = (rows: MonitorItem[], limit = 5) => rows.slice(0, limit);

export function buildMonitoring(input: {
  rows: ProductRow[];
  facts: MonitorFact[];
  costs: LogisticsCostSummary | null;
  stock: StockRow[] | null;
}): MonitorDirection[] {
  const { rows, facts, costs, stock } = input;
  const titleOf = new Map(rows.map((r) => [r.nmId, r.title]));
  const title = (nmId: string) => titleOf.get(nmId) ?? `Артикул ${nmId}`;
  const out: MonitorDirection[] = [];

  // Финансы
  const withMargin = facts.filter((f) => f.marginPercent != null);
  if (withMargin.length === 0) {
    out.push({ id: "finance", label: "Финансы", rule: "Убыточные товары и просевшая маржа. Нужны себестоимость и отчёт реализации.", severity: "unknown", count: null, items: [] });
  } else {
    const losing = withMargin.filter((f) => f.marginPercent! < 0).map((f) => ({ nmId: f.nmId, title: title(f.nmId), note: `маржа ${f.marginPercent!.toLocaleString("ru-RU")}%` }));
    const dropped = withMargin
      .filter((f) => f.marginPercent! >= 0 && f.priorMarginPercent != null && f.priorMarginPercent - f.marginPercent! >= MARGIN_DROP_PP)
      .map((f) => ({ nmId: f.nmId, title: title(f.nmId), note: `маржа упала с ${f.priorMarginPercent!.toLocaleString("ru-RU")}% до ${f.marginPercent!.toLocaleString("ru-RU")}%` }));
    const items = [...losing, ...dropped];
    out.push({ id: "finance", label: "Финансы", rule: `Маржа на 1 продажу отрицательная или упала на ${MARGIN_DROP_PP} п. п. и больше к прошлым 28 дням.`, severity: losing.length > 0 ? "bad" : dropped.length > 0 ? "warn" : "ok", count: items.length, items: pick(items) });
  }

  // Логистика
  if (!costs) {
    out.push({ id: "logistics", label: "Логистика", rule: "Высокий процент возвратов и подорожание доставки. Нужен отчёт реализации.", severity: "unknown", count: null, items: [] });
  } else {
    const items = costs.products
      .filter((p) => p.highReturn || p.overpay > 0)
      .map((p) => ({ nmId: p.nmId, title: p.title, note: p.highReturn ? `возвраты ${Math.round((p.returnRate ?? 0) * 100)}%` : `доставка +${Math.round(p.changePercent ?? 0)}%` }));
    out.push({ id: "logistics", label: "Логистика", rule: "Возвратов заметно больше, чем в среднем по магазину, или доставка заметно подорожала.", severity: items.length > 0 ? "warn" : "ok", count: items.length, items: pick(items) });
  }

  // Рейтинг
  const rated = rows.filter((r) => r.rating != null);
  if (rated.length === 0) {
    out.push({ id: "rating", label: "Рейтинг", rule: "Товары с рейтингом ниже 4,5.", severity: "unknown", count: null, items: [] });
  } else {
    const low = rated.filter((r) => r.rating! < LOW_RATING).sort((a, b) => b.orderSum - a.orderSum);
    out.push({ id: "rating", label: "Рейтинг", rule: `Рейтинг покупателей ниже ${LOW_RATING.toLocaleString("ru-RU")}.`, severity: low.length > 0 ? "warn" : "ok", count: low.length, items: pick(low.map((r) => ({ nmId: r.nmId, title: r.title, note: `рейтинг ${r.rating!.toLocaleString("ru-RU")}` }))) });
  }

  // Контент
  const graded = facts.filter((f) => f.contentGrade != null);
  if (graded.length === 0) {
    out.push({ id: "content", label: "Контент", rule: "Карточки с оценкой качества контента C или D.", severity: "unknown", count: null, items: [] });
  } else {
    const weak = graded.filter((f) => f.contentGrade === "C" || f.contentGrade === "D");
    out.push({ id: "content", label: "Контент", rule: "Оценка заполненности карточки C или D (фото, видео, характеристики, описание).", severity: weak.length > 0 ? "warn" : "ok", count: weak.length, items: pick(weak.map((f) => ({ nmId: f.nmId, title: title(f.nmId), note: `оценка ${f.contentGrade}` }))) });
  }

  // Воронка
  const leaks = rows.filter((r) => r.leak != null).sort((a, b) => b.opens - a.opens);
  out.push({ id: "funnel", label: "Воронка", rule: "Много просмотров, а конверсия в корзину или в заказ меньше 60% от среднего по магазину.", severity: leaks.length > 0 ? "warn" : "ok", count: leaks.length, items: pick(leaks.map((r) => ({ nmId: r.nmId, title: r.title, note: r.leak === "cart" ? "мало в корзину" : "мало заказов из корзины" }))) });

  // Остатки
  if (!stock) {
    out.push({ id: "stock", label: "Остатки", rule: "Закончившиеся и заканчивающиеся товары. Нужен отчёт WB об остатках.", severity: "unknown", count: null, items: [] });
  } else {
    const risky = stock.filter((r) => r.status === "out" || r.status === "low");
    out.push({
      id: "stock",
      label: "Остатки",
      rule: "Товар закончился при наличии заказов или запаса осталось мало (порог настраивается во вкладке «Остатки»).",
      severity: stock.some((r) => r.status === "out") ? "bad" : risky.length > 0 ? "warn" : "ok",
      count: risky.length,
      items: pick(risky.map((r) => ({ nmId: r.nmId, title: r.title, note: r.status === "out" ? "закончился" : `хватит на ${Math.round(r.saleRateDays ?? 0)} дн.` }))),
    });
  }
  return out;
}
