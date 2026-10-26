import { buildOrdersInsights, isCanceledOrder } from "@/lib/seller-hub/orders-insights";
import { isNewFbsOrder, openFbsSupplies, ordersSpanDays, waitingHours } from "@/lib/seller-hub/fbs-actions";
import type { ShipSpeed } from "@/lib/seller-hub/ship-speed";
import { WEEKDAY_SHORT } from "@/lib/seller-hub/weekday-profile";
import type { LogisticsCostSummary } from "@/lib/seller-hub/logistics-cost";
import type { SellerOrderRow, SellerSupplyRow } from "@/lib/seller-hub/types";

/**
 * «Что сделать сейчас» в логистике: предложения, собранные только из заказов, поставок и остатков вашего кабинета.
 * Пороги — настройки продавца (по умолчанию заданы ниже), WB своих сроков в этих данных не отдаёт, и мы их не придумываем.
 * Исполняет только то, что человек подтвердил: здесь предложение «собрать поставку» носит исполняемый вид, остальное — рекомендации.
 */

export const DEFAULT_REMIND_HOURS = 12;
export const DEFAULT_COVER_DAYS = 7;
/** По умолчанию напоминание о вечерней отправке с 18:00 по Москве; 24 — выключено. */
export const DEFAULT_EVENING_HOUR = 18;
/** Открытая поставка старше стольких суток требует внимания: её либо забыли передать, либо она лишняя. */
export const OPEN_SUPPLY_DAYS = 2;
/** Минимум заказов, чтобы судить о скорости отгрузки и отменах. */
export const MIN_SPEED_ORDERS = 10;
/** Доля заказов дольше суток, выше которой советуем ускориться. */
export const SLOW_SHARE = 0.25;

export type FulfillmentTab = "orders" | "deliveries" | "logistics";
export type ProposalLevel = "action" | "watch" | "info";

export type FulfillmentProposal = {
  id: string;
  kind: "ship_waiting" | "supplies_open" | "stock_cover" | "cancel_hot" | "slow_shipping" | "late_orders" | "returns_high" | "cost_growth" | "no_ship_days";
  level: ProposalLevel;
  title: string;
  detail: string;
  /** Куда перейти, чтобы разобраться. */
  tab?: FulfillmentTab;
  /** Исполняемое действие: собрать из этих заданий новую поставку. */
  buildSupply?: { orderIds: number[] };
};

export type FulfillmentItem = { externalId: string; title: string; vendorCode?: string; stockFbs?: number | null };

export type FulfillmentInput = {
  orders: SellerOrderRow[];
  supplies: SellerSupplyRow[];
  items: FulfillmentItem[];
  nowMs: number;
  remindHours: number;
  /** С какого часа (по Москве) напоминать о вечерней отправке; 24 или не задано — не напоминать. */
  eveningHour?: number;
  coverDays: number;
  shipSpeed: ShipSpeed | null;
  /** Стоимость логистики из отчёта реализации; null — отчёта нет. */
  costs?: LogisticsCostSummary | null;
};

/** Минимум закрытых поставок и заказов, чтобы судить о времени отправки. */
export const MIN_SUPPLIES_FOR_HOURS = 5;
/** Доля заказов, пришедших после обычного часа отправки, выше которой даём совет. */
export const LATE_SHARE = 0.3;

const mskHour = (ms: number) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Moscow", hour: "2-digit", hour12: false }).format(ms)) % 24;

const LEVEL_ORDER: Record<ProposalLevel, number> = { action: 0, watch: 1, info: 2 };

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

const hoursText = (h: number) => `${h.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} ч`;

export function buildFulfillmentProposals(input: FulfillmentInput): FulfillmentProposal[] {
  const out: FulfillmentProposal[] = [];
  const { orders, nowMs } = input;
  const titleOf = new Map(input.items.map((i) => [i.externalId, i.title || i.vendorCode || i.externalId]));

  // 1. Новые задания, которые ещё не в поставке.
  const fresh = orders.filter(isNewFbsOrder);
  if (fresh.length > 0) {
    const ages = fresh.map((o) => waitingHours(o, nowMs)).filter((h): h is number => h != null);
    const oldest = ages.length > 0 ? Math.max(...ages) : null;
    const slow = oldest != null && oldest >= input.remindHours;
    const eveningHour = input.eveningHour ?? 24;
    const evening = eveningHour < 24 && mskHour(nowMs) >= eveningHour;
    const late = slow || evening;
    out.push({
      id: "ship_waiting",
      kind: "ship_waiting",
      level: late ? "action" : "info",
      title: `${fresh.length} ${plural(fresh.length, "новый заказ", "новых заказа", "новых заказов")} ещё не в поставке`,
      detail:
        (oldest == null ? "" : `Самому старому ${hoursText(oldest)}${slow ? `, это больше вашего порога ${input.remindHours} ч` : ""}. `) +
        (evening && !slow ? `Уже после ${String(eveningHour).padStart(2, "0")}:00 по Москве: самое время для вечерней отправки. ` : "") +
        "Соберите заказы в поставку и передайте её в доставку в кабинете Wildberries.",
      tab: "orders",
      // В поставку отправляем только задания со статусом «new»: при неизвестном статусе WB мог бы отклонить всю пачку.
      buildSupply: { orderIds: fresh.filter((o) => o.supplierStatus === "new").map((o) => o.externalId) },
    });
  }

  // 2. Открытые поставки: их нужно передать в доставку или убрать.
  const open = openFbsSupplies(input.supplies);
  if (open.length > 0) {
    const old = open.filter((s) => s.createdAt && nowMs - Date.parse(s.createdAt) >= OPEN_SUPPLY_DAYS * 86_400_000);
    out.push({
      id: "supplies_open",
      kind: "supplies_open",
      level: old.length > 0 ? "action" : "info",
      title: `Открытых поставок FBS: ${open.length}`,
      detail:
        old.length > 0
          ? `${old.length} ${plural(old.length, "поставка открыта", "поставки открыты", "поставок открыто")} дольше ${OPEN_SUPPLY_DAYS} суток. Заказы в ней ждут передачи в доставку: откройте её в кабинете Wildberries и передайте, если собрана.`
          : "Пока свежие. Когда заказы собраны, передайте поставку в доставку в кабинете Wildberries.",
      tab: "deliveries",
    });
  }

  // 3. Остатки на вашем складе против реального спроса по FBS-заказам.
  const days = ordersSpanDays(orders, nowMs);
  if (days > 0) {
    const perNm = new Map<string, number>();
    for (const o of orders) {
      if (o.nmId == null || o.supplierStatus === "cancel" || o.supplierStatus === "cancel_carrier") continue;
      perNm.set(String(o.nmId), (perNm.get(String(o.nmId)) ?? 0) + 1);
    }
    const risky = input.items
      .map((item) => {
        const sold = perNm.get(item.externalId) ?? 0;
        const stock = item.stockFbs;
        if (sold < 2 || stock == null) return null; // остаток неизвестен или спрос слишком мал — не судим
        const daily = sold / days;
        return { item, daily, cover: stock / daily };
      })
      .filter((x): x is { item: FulfillmentItem; daily: number; cover: number } => x != null && x.cover < input.coverDays)
      .sort((a, b) => a.cover - b.cover);
    if (risky.length > 0) {
      const names = risky
        .slice(0, 3)
        .map((r) => `${titleOf.get(r.item.externalId)} — ${r.item.stockFbs === 0 ? "нет на складе" : `хватит на ${r.cover.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} дн.`}`)
        .join("; ");
      out.push({
        id: "stock_cover",
        kind: "stock_cover",
        level: risky.some((r) => r.item.stockFbs === 0) ? "action" : "watch",
        title: `${risky.length} ${plural(risky.length, "товар", "товара", "товаров")} скоро закончится на вашем складе`,
        detail: `Запас считан по заказам FBS за последние ${Math.round(days)} дн. и остатку в каталоге, порог ${input.coverDays} дн. ${names}.`,
        tab: "logistics",
      });
    }
  }

  // 4. Повторяющиеся отмены.
  const insights = buildOrdersInsights(orders, nowMs);
  if (insights && insights.cancelHot.length > 0 && insights.total >= MIN_SPEED_ORDERS) {
    const names = insights.cancelHot.slice(0, 3).map((p) => `${titleOf.get(p.nmId) ?? `Артикул ${p.nmId}`} (${p.canceled} из ${p.orders})`).join("; ");
    out.push({
      id: "cancel_hot",
      kind: "cancel_hot",
      level: "watch",
      title: `Отмены повторяются у ${insights.cancelHot.length} ${plural(insights.cancelHot.length, "артикула", "артикулов", "артикулов")}`,
      detail: `${names}. Проверьте остаток, сроки сборки и соответствие карточки товару.`,
      tab: "orders",
    });
  }

  // 5. Скорость отгрузки по реальным датам поставок.
  const speed = input.shipSpeed;
  if (speed && speed.orders >= MIN_SPEED_ORDERS) {
    const slow = speed.over24Share >= SLOW_SHARE;
    const worse = speed.trend != null && speed.trend.recentMedian > speed.trend.previousMedian * 1.25 && speed.trend.recentMedian - speed.trend.previousMedian >= 2;
    if (slow || worse) {
      out.push({
        id: "slow_shipping",
        kind: "slow_shipping",
        level: "watch",
        title: "Заказы отгружаются медленнее, чем могли бы",
        detail: `Медиана от заказа до передачи в доставку ${hoursText(speed.medianHours)}, дольше суток уходит ${Math.round(speed.over24Share * 100)}% заказов${
          worse && speed.trend ? `. За последнюю неделю медиана ${hoursText(speed.trend.recentMedian)}, неделей раньше была ${hoursText(speed.trend.previousMedian)}` : ""
        }. Передавайте поставки в доставку чаще: каждый день, а не копите заказы.`,
        tab: "deliveries",
      });
    }
  }

  // 6. Время отправки: когда вы обычно закрываете поставки и сколько заказов приходит позже.
  const closedHours = input.supplies
    .filter((s) => s.type === "fbs" && s.done && s.closedAt && nowMs - Date.parse(s.closedAt) <= 30 * 86_400_000)
    .map((s) => mskHour(Date.parse(s.closedAt!)))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (closedHours.length >= MIN_SUPPLIES_FOR_HOURS) {
    const usual = closedHours[Math.floor(closedHours.length / 2)]!;
    const active = orders.filter((o) => !isCanceledOrder(o) && o.createdAt && Number.isFinite(Date.parse(o.createdAt)));
    if (active.length >= MIN_SPEED_ORDERS) {
      const late = active.filter((o) => mskHour(Date.parse(o.createdAt!)) > usual).length;
      const share = late / active.length;
      if (share >= LATE_SHARE) {
        out.push({
          id: "late_orders",
          kind: "late_orders",
          level: "watch",
          title: `${Math.round(share * 100)}% заказов приходит после вашей обычной отправки`,
          detail: `Вы чаще всего закрываете поставки около ${String(usual).padStart(2, "0")}:00 по Москве, а ${late} из ${active.length} заказов за неделю появились позже. Они ждут следующего дня. Если добавить вторую отправку ближе к вечеру, такие заказы уйдут быстрее.`,
          tab: "deliveries",
        });
      }
    }
  }

  // 6б. Дни недели без отправок, в которые заказы ждут заметно дольше обычного.
  if (speed && speed.supplies >= MIN_SUPPLIES_FOR_HOURS && speed.weekdays.length === 7) {
    const gaps = speed.weekdays.filter((d) => d.suppliesClosed === 0 && d.medianWait != null && d.medianWait >= Math.max(24, speed.medianHours * 1.3));
    if (gaps.length > 0) {
      const text = gaps.map((d) => `${WEEKDAY_SHORT[d.index]} (${hoursText(d.medianWait!)})`).join(", ");
      out.push({
        id: "no_ship_days",
        kind: "no_ship_days",
        level: "watch",
        title: `В дни без отправок заказы ждут дольше: ${gaps.map((d) => WEEKDAY_SHORT[d.index]).join(", ")}`,
        detail: `За последние поставки в эти дни недели вы не закрывали ни одной поставки, а заказы, пришедшие в эти дни, ждали отправки типично: ${text}, при общем типичном ожидании ${hoursText(speed.medianHours)}. Если есть возможность, добавьте отправку в такой день или собирайте заказы заранее.`,
        tab: "deliveries",
      });
    }
  }

  // 7. Возвраты и рост цены доставки из отчёта реализации.
  const costs = input.costs;
  if (costs && costs.highReturnCount > 0) {
    const hot = costs.products.filter((p) => p.highReturn).sort((a, b) => b.returnCost - a.returnCost);
    const names = hot
      .slice(0, 3)
      .map((p) => `${p.title} (${p.returns} из ${p.deliveries}, ${Math.round((p.returnRate ?? 0) * 100)}%)`)
      .join("; ");
    out.push({
      id: "returns_high",
      kind: "returns_high",
      level: "watch",
      title: `Много возвратов у ${hot.length} ${plural(hot.length, "товара", "товаров", "товаров")}`,
      detail: `${names}. В среднем по магазину возвращают ${Math.round((costs.shopReturnRate ?? 0) * 100)}%. Частые причины: повреждения при упаковке, несоответствие размера или описания фото. Проверьте упаковку и карточку; каждый возврат стоит вам обратной логистики.`,
      tab: "logistics",
    });
  }
  if (costs && costs.overpay > 0) {
    out.push({
      id: "cost_growth",
      kind: "cost_growth",
      level: "watch",
      title: `Доставка подорожала у ${costs.grewCount} ${plural(costs.grewCount, "товара", "товаров", "товаров")}`,
      detail: `Сверх прошлой цены доставки за 28 дней ушло ${Math.round(costs.overpay).toLocaleString("ru-RU")} ₽. Цена зависит от габаритов, склада отгрузки и района покупателя: посмотрите вкладки «Стоимость» и «Регионы».`,
      tab: "logistics",
    });
  }

  return out.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}
