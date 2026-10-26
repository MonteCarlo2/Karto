import type { SellerEventGroup } from "@/lib/seller-hub/event-engine/types";
import { pctChange } from "@/lib/seller-hub/analytics-core";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";

/** Боковая панель «Событий»: что именно мы отслеживаем в кабинете и итоги недели. Только реальные данные снимка и истории. */

export type CoverageRow = { group: SellerEventGroup; tracked: boolean; note: string };

/**
 * По каждому направлению: идут ли по нему события и почему нет. «Не отслеживается» честно называет причину: токен без прав
 * на категорию или WB не отдал блок, а не молчит.
 */
export function buildCoverage(snapshot: SellerCatalogSnapshot | undefined, historyDays: number): CoverageRow[] {
  const items = snapshot?.items ?? [];
  const scopes = snapshot?.scopes ?? {};
  const fb = snapshot?.feedbacks;
  const row = (group: SellerEventGroup, tracked: boolean, on: string, off: string): CoverageRow => ({ group, tracked, note: tracked ? on : off });
  return [
    row("sales", historyDays >= 8, `история заказов по дням: ${historyDays} дн.`, historyDays > 0 ? `копится история заказов (${historyDays} дн., нужно 8): откройте «Аналитика → Динамика»` : "история заказов ещё не накоплена: откройте «Аналитика → Динамика»"),
    row("stock", items.some((i) => i.totalStock != null), "остатки по товарам", "WB не отдал остатки"),
    row("price", items.some((i) => i.price != null) && scopes.prices !== false, snapshot?.promotions ? "цены, скидки и акции WB" : "цены и скидки", "нет доступа к категории «Цены и скидки»"),
    row("content", items.length > 0 && scopes.content !== false, "контент и фото карточек", "нет доступа к категории «Контент»"),
    row("reviews", fb != null && (fb.status === "ok" || fb.status === "partial"), "новые негативные отзывы", fb?.status === "forbidden" ? "нет доступа к отзывам" : "отзывы ещё не загружены"),
    row("orders", snapshot?.orders != null && scopes.marketplace !== false, "заказы и поставки FBS", scopes.marketplace === false ? "нет доступа к категории «Маркетплейс»" : "заказы FBS ещё не загружены"),
    row("ads", snapshot?.ads != null && scopes.advert !== false, "статусы рекламных кампаний", scopes.advert === false ? "нет доступа к категории «Реклама»" : "реклама ещё не загружена"),
    row("money", snapshot?.finance?.available === true || (snapshot?.realization != null && !snapshot.realization.error), "штрафы, документы, вывод", "нет данных о финансах"),
    row("agents", true, "журнал действий агентов", ""),
    row("system", Object.keys(scopes).length > 0, "доступы токена WB", "доступы токена ещё не проверены"),
    row("news", true, "новости портала WB: персональные, по вашим категориям и важные", ""),
  ];
}

export type DayRow = { date: string; orders: number | null; orderSum: number | null };

export type WeekCompare = { orders: number; prevOrders: number; ordersChange: number | null; sum: number; prevSum: number; sumChange: number | null; from: string; to: string };

const addDays = (key: string, delta: number) => new Date(Date.parse(`${key}T00:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10);

/**
 * Последние 7 законченных дней против 7 предыдущих. Считается только если сохранены все 14 дней: иначе сравнение
 * выглядело бы падением или ростом из-за пропусков в истории, а не из-за продаж.
 */
export function buildWeekCompare(series: DayRow[], todayKey: string): WeekCompare | null {
  const byDate = new Map(series.filter((d) => d.orders != null).map((d) => [d.date, d]));
  const sumWindow = (fromBack: number) => {
    let orders = 0;
    let sum = 0;
    for (let i = fromBack; i < fromBack + 7; i += 1) {
      const d = byDate.get(addDays(todayKey, -i));
      if (!d) return null;
      orders += d.orders ?? 0;
      sum += d.orderSum ?? 0;
    }
    return { orders, sum };
  };
  const cur = sumWindow(1);
  const prev = sumWindow(8);
  if (!cur || !prev) return null;
  return { orders: cur.orders, prevOrders: prev.orders, ordersChange: pctChange(cur.orders, prev.orders), sum: cur.sum, prevSum: prev.sum, sumChange: pctChange(cur.sum, prev.sum), from: addDays(todayKey, -7), to: addDays(todayKey, -1) };
}
