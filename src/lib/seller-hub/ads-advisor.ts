import type { AdsNmRow } from "@/lib/seller-hub/ads-metrics";
import { MIN_COVER_FOR_GROWTH_DAYS } from "@/lib/seller-hub/task-engine/promo";
import type { SellerAdCampaignRow, SellerAdCampaignStats } from "@/lib/seller-hub/types";

export type AdvisorProduct = {
  nmId: string;
  title: string;
  /** Маржа на 1 продажу, ₽ (без рекламы). */
  marginRub: number | null;
  /** Маржа на 1 продажу, %. */
  marginPercent: number | null;
  /** Остаток на складах, шт. */
  stock: number | null;
  /** Заказы за 28 дней по воронке WB. */
  orders28: number | null;
  /** На сколько дней хватит остатка при текущих продажах. null — не знаем. */
  coverDays?: number | null;
};

export type AdAdviceKind = "budget_low" | "no_orders" | "margin_eaten" | "candidate";

/** Действие «в одну кнопку», которое можно выполнить прямо из совета (после подтверждения на экране). */
export type AdAdviceFix =
  | { type: "deposit"; campaignId: string; campaignName: string; sumRub: number }
  | { type: "pause"; campaignId: string; campaignName: string }
  | { type: "remove_nm"; campaignId: string; campaignName: string; nmId: string };

export type AdAdvice = {
  id: string;
  kind: AdAdviceKind;
  /** "critical" — деньги уходят прямо сейчас; "important" — стоит сделать на этой неделе; "opportunity" — возможность. */
  level: "critical" | "important" | "opportunity";
  title: string;
  /** Факты с цифрами. */
  facts: string[];
  /** Что сделать, по шагам. */
  action: string;
  nmId?: string;
  fix?: AdAdviceFix;
};

/** Срок тестового запуска: 7 дней — окно, по которому мы показываем статистику. */
export const AD_TEST_DAYS = 7;
/** Ориентир тестового бюджета: во столько раз маржа с одной продажи. Если реклама ничего не принесёт, потеряем маржу с 5 продаж. */
export const AD_TEST_BUDGET_SALES = 5;

/** Сумма пополнения: расход за неделю по текущему темпу, вверх до 100 ₽, не меньше 500 ₽. */
export function suggestedDepositRub(avgDailySpend: number): number {
  const weekly = Math.ceil((avgDailySpend * AD_TEST_DAYS) / 100) * 100;
  return Math.min(100_000, Math.max(500, weekly));
}

const rub = (value: number) => `${Math.round(value).toLocaleString("ru-RU")} ₽`;
const pct = (value: number) => `${value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`;

/**
 * Советы по рекламе только из данных WB и себестоимости продавца.
 * Пороги выводятся из маржи товара: реклама, которая стоит больше маржи с одной продажи без единого заказа, невыгодна.
 */
export function buildAdAdvice(input: {
  days: number;
  campaigns: SellerAdCampaignRow[];
  campaignStats: Array<Pick<SellerAdCampaignStats, "advertId" | "spend"> & Partial<Pick<SellerAdCampaignStats, "orders" | "orderSum">>>;
  products: AdvisorProduct[];
  adsByProduct: AdsNmRow[];
  /** Средняя цена заказа по всей рекламе магазина за период (расход ÷ заказы), ₽. Мерка, когда маржа товара неизвестна. */
  storeCpo?: number | null;
}): AdAdvice[] {
  const advice: AdAdvice[] = [];
  const productByNm = new Map(input.products.map((p) => [p.nmId, p]));
  const spendByCampaign = new Map(input.campaignStats.map((c) => [c.advertId, c.spend]));
  const statByCampaign = new Map(input.campaignStats.map((c) => [c.advertId, c]));
  /** Кампания не окупается: ДРР выше средней маржи её товаров, либо деньги потрачены на сумму заказа и заказов нет. Доливать в неё бюджет нельзя. */
  const losing = (campaign: SellerAdCampaignRow): boolean => {
    const stat = statByCampaign.get(campaign.id);
    if (!stat || stat.orders == null || stat.orderSum == null) return false;
    const margins = (campaign.bids ?? []).map((b) => productByNm.get(b.nmId)?.marginPercent).filter((m): m is number => m != null);
    const avg = margins.length > 0 ? margins.reduce((a, m) => a + m, 0) / margins.length : null;
    if (stat.orders > 0 && stat.orderSum > 0 && avg != null) return (stat.spend / stat.orderSum) * 100 > avg;
    return stat.orders === 0 && input.storeCpo != null && stat.spend >= input.storeCpo;
  };
  /** Пауза всей кампании честна только если в ней один товар и он единственная кампания с этим товаром. */
  const pauseFixFor = (nmId: string): AdAdviceFix | undefined => {
    const holders = input.campaigns.filter((c) => c.status === 9 && (c.bids ?? []).some((b) => b.nmId === nmId));
    const only = holders.length === 1 ? holders[0]! : null;
    if (!only) return undefined;
    const count = (only.bids ?? []).length;
    if (count === 1) return { type: "pause", campaignId: only.id, campaignName: only.name ?? only.id };
    if (count > 1) return { type: "remove_nm", campaignId: only.id, campaignName: only.name ?? only.id, nmId };
    return undefined;
  };

  for (const campaign of input.campaigns) {
    if (campaign.status !== 9 || campaign.budget == null) continue;
    const name = campaign.name ?? campaign.id;
    const avgDaily = (spendByCampaign.get(campaign.id) ?? 0) / Math.max(1, input.days);
    if (losing(campaign)) {
      // Бюджет заканчивается, но кампания не окупается: честный совет не пополнять, а сначала снизить расходы.
      if (campaign.budget <= 0 || (avgDaily > 0 && campaign.budget / avgDaily < 2)) {
        advice.push({
          id: `budget-${campaign.id}`,
          kind: "budget_low",
          level: "important",
          title: `Бюджет кампании «${name}» на исходе, но она не окупается`,
          facts: [campaign.budget <= 0 ? "Остаток бюджета 0 ₽, показы не идут." : `Остаток ${rub(campaign.budget)}, хватит меньше чем на 2 дня.`, "ДРР кампании выше маржи её товаров: каждый заказ обходится дороже, чем приносит."],
          action: "Не пополняйте бюджет, пока кампания не окупается. Сначала снизьте ставку или уберите товары, которые тратят без заказов, потом решайте о пополнении.",
        });
      }
      continue;
    }
    if (campaign.budget <= 0) {
      advice.push({
        id: `budget-${campaign.id}`,
        kind: "budget_low",
        level: "critical",
        title: `У кампании «${name}» закончился бюджет`,
        facts: [
          "Остаток бюджета кампании 0 ₽, показы не идут.",
          avgDaily > 0 ? `Средний расход за ${input.days} дн.: ${rub(avgDaily)} в день.` : "Расхода за период не было.",
        ],
        action: `Пополните бюджет кампании кнопкой ниже или в кабинете WB (Продвижение → кампания → «Пополнить»)${
          avgDaily > 0 ? `: ориентир ${rub(suggestedDepositRub(avgDaily))}, это расход за ${AD_TEST_DAYS} дн. по текущему темпу` : ""
        }. Деньги берутся со счёта продвижения.`,
        fix: { type: "deposit", campaignId: campaign.id, campaignName: name, sumRub: suggestedDepositRub(avgDaily) },
      });
    } else if (avgDaily > 0 && campaign.budget / avgDaily < 2) {
      advice.push({
        id: `budget-${campaign.id}`,
        kind: "budget_low",
        level: "important",
        title: `Бюджета кампании «${name}» хватит меньше чем на 2 дня`,
        facts: [
          `Остаток ${rub(campaign.budget)}, средний расход ${rub(avgDaily)} в день.`,
          `Хватит примерно на ${(campaign.budget / avgDaily).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} дн.`,
        ],
        action: `Пополните бюджет кампании кнопкой ниже или в кабинете WB, ориентир ${rub(suggestedDepositRub(avgDaily))} на ${AD_TEST_DAYS} дн.`,
        fix: { type: "deposit", campaignId: campaign.id, campaignName: name, sumRub: suggestedDepositRub(avgDaily) },
      });
    }
  }

  /**
   * Статистика WB идёт по артикулам, которые участвовали в периоде, а состав кампании продавец мог поменять.
   * Если у всех действующих кампаний известен список товаров, советуем только по тем, что рекламируются сейчас.
   */
  const active = input.campaigns.filter((c) => c.status === 9 || c.status === 4 || c.status === 11);
  const live = new Set(active.flatMap((c) => (c.bids ?? []).map((b) => b.nmId)));
  const knowsMembership = active.length > 0 && active.every((c) => (c.bids?.length ?? 0) > 0);

  for (const row of knowsMembership ? input.adsByProduct.filter((r) => live.has(r.nmId)) : input.adsByProduct) {
    if (!(row.spend > 0)) continue;
    const product = productByNm.get(row.nmId);
    const title = product?.title || row.name || row.nmId;
    const margin = product?.marginRub ?? null;
    if (row.orders === 0 && margin != null && margin > 0 && row.spend >= margin) {
      advice.push({
        id: `no-orders-${row.nmId}`,
        kind: "no_orders",
        level: "critical",
        nmId: row.nmId,
        title: `${title}: реклама без заказов`,
        facts: [
          `За ${input.days} дн. потрачено ${rub(row.spend)}, показов ${row.views.toLocaleString("ru-RU")}, заказов по рекламе 0.`,
          `Маржа с одной продажи ${rub(margin)}: потрачено больше, чем заработал бы 1 заказ.`,
        ],
        action: "Уберите артикул из кампании или поставьте кампанию на паузу. Сначала проверьте цену, главное фото и рейтинг карточки: без них реклама не продаст.",
        fix: pauseFixFor(row.nmId),
      });
      continue;
    }
    if (row.orders === 0 && margin == null && input.storeCpo != null && row.spend >= input.storeCpo) {
      advice.push({
        id: `no-orders-${row.nmId}`,
        kind: "no_orders",
        level: "important",
        nmId: row.nmId,
        title: `${title}: реклама без заказов`,
        facts: [
          `За ${input.days} дн. потрачено ${rub(row.spend)}, показов ${row.views.toLocaleString("ru-RU")}, заказов по рекламе 0.`,
          `Это больше, чем в среднем стоит заказ по вашей рекламе (${rub(input.storeCpo)}). Маржу товара посчитать нельзя: нет доставок за 90 дней или себестоимости.`,
        ],
        action: "Уберите артикул из кампании или поставьте кампанию на паузу. Введите себестоимость, чтобы видеть маржу и точный порог.",
        fix: pauseFixFor(row.nmId),
      });
      continue;
    }
    if (margin != null && margin <= 0) {
      advice.push({
        id: `negative-${row.nmId}`,
        kind: "margin_eaten",
        level: "important",
        nmId: row.nmId,
        title: `${title}: реклама товара, который продаётся в минус`,
        facts: [
          `Маржа с одной продажи ${rub(margin)}, на рекламу за ${input.days} дн. ушло ${rub(row.spend)}.`,
        ],
        action: "Сначала исправьте цену (задача «Убыточная цена»), потом рекламируйте: сейчас каждый заказ приносит убыток ещё до рекламы.",
        fix: pauseFixFor(row.nmId),
      });
      continue;
    }
    const marginPercent = product?.marginPercent ?? null;
    const drr = row.summary.drr;
    if (row.orders > 0 && drr != null && marginPercent != null && drr > marginPercent) {
      advice.push({
        id: `margin-${row.nmId}`,
        kind: "margin_eaten",
        level: "important",
        nmId: row.nmId,
        title: `${title}: реклама съедает прибыль`,
        facts: [
          `ДРР ${pct(drr)} выше маржи ${pct(marginPercent)} (маржа считается без рекламы).`,
          `Расход ${rub(row.spend)} при заказах на ${rub(row.orderSum)}.`,
        ],
        action: "Снизьте ставку или поставьте дневной лимит, пока ДРР не станет ниже маржи. Заказы здесь — это заказы, а не выкупы: реальный выкуп ниже, значит запас по марже ещё меньше.",
      });
    }
  }

  const advertised = knowsMembership ? live : new Set(input.adsByProduct.filter((row) => row.spend > 0).map((row) => row.nmId));
  const candidates = input.products
    .filter(
      (p) =>
        !advertised.has(p.nmId) &&
        p.marginRub != null &&
        p.marginRub > 0 &&
        p.stock != null &&
        p.stock >= AD_TEST_BUDGET_SALES &&
        (p.coverDays == null || p.coverDays >= MIN_COVER_FOR_GROWTH_DAYS) &&
        p.orders28 === 0,
    )
    .sort((a, b) => (b.marginRub ?? 0) - (a.marginRub ?? 0))
    .slice(0, 5);
  for (const p of candidates) {
    const margin = p.marginRub as number;
    advice.push({
      id: `candidate-${p.nmId}`,
      kind: "candidate",
      level: "opportunity",
      nmId: p.nmId,
      title: `${p.title}: можно протестировать рекламу`,
      facts: [
        `Заказов за 28 дней нет, на складе ${p.stock} шт.`,
        `Маржа с одной продажи ${rub(margin)}${p.marginPercent != null ? ` (${pct(p.marginPercent)})` : ""}, в рекламе не участвует.`,
      ],
      action: `Тест на ${AD_TEST_DAYS} дн.: бюджет не больше ${rub(margin * AD_TEST_BUDGET_SALES)} (маржа с ${AD_TEST_BUDGET_SALES} продаж, ориентир), цена заказа не выше ${rub(margin)}. Остановить, если потрачено ${rub(margin)} и заказов нет. Перед запуском проверьте цену, фото и рейтинг карточки.`,
    });
  }

  const order = { critical: 0, important: 1, opportunity: 2 } as const;
  return advice.sort((a, b) => order[a.level] - order[b.level]);
}
