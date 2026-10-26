import { adBase, adPct, adRub, ruleAdNoOrders, runningCampaigns, spendingNames } from "./ads";
import type { ProductAdFact, TaskDraft, TaskFact } from "./types";

/**
 * Умные рекламные правила: тренд к прошлой неделе и сравнение с эталоном самого магазина.
 * Выводы делаются только там, где разница подтверждена статистикой, а не шумом малого числа заказов.
 */

/** z-критерий для двух долей: x1 из n1 сейчас против x2 из n2 раньше. Отрицательное значение — сейчас хуже. */
function zTwo(x1: number, n1: number, x2: number, n2: number): number | null {
  if (n1 <= 0 || n2 <= 0) return null;
  const pooled = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
  return se > 0 ? (x1 / n1 - x2 / n2) / se : null;
}

/** z-критерий доли x из n против известной доли p0. */
function zOne(x: number, n: number, p0: number): number | null {
  if (n <= 0 || p0 <= 0 || p0 >= 1) return null;
  return (x / n - p0) / Math.sqrt((p0 * (1 - p0)) / n);
}

/** Значимое падение показа в клик: z ≤ −2 (около 97,5%). Падение клика в заказ: z ≤ −1,64 (95%, заказов мало). */
const Z_CTR = -2;
const Z_CR = -1.64;
/** Клик подорожал не меньше, чем в столько раз: цена клика измеряется, а не оценивается, шумит мало. */
const CPC_RISE = 1.2;
const CPO_RISE_NOTICE = 1.25;
const CPO_RISE_IMPORTANT = 1.5;

function changePct(now: number, before: number): number {
  return Math.round(((now - before) / before) * 100);
}

function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Расход достаточен, чтобы по нему делать выводы: больше маржи с продажи (нет маржи: средней цены заказа). */
function spendMeaningful(fact: TaskFact, ad: ProductAdFact): boolean {
  const margin = fact.marginRub;
  const floor = margin != null && margin > 0 ? margin : margin == null ? ad.storeCpo : null;
  return floor != null && floor > 0 && ad.spend >= floor;
}

/**
 * Эффективность рекламы товара упала к прошлой неделе. Разбираем цену заказа на показ в клик, клик в заказ
 * и цену клика и называем то, что реально просело. Небольшое ухудшение — только «возможность»: сообщить и предложить.
 */
export function ruleAdEfficiencyDrop(fact: TaskFact): TaskDraft | null {
  const ad = fact.adFacts;
  const prev = ad?.prev;
  if (!ad?.statsReady || !prev) return null;
  if (ad.orders < 2 || prev.orders < 3 || ad.clicks < 50 || prev.clicks < 50 || ad.views <= 0 || prev.views <= 0) return null;
  if (fact.stock != null && fact.stock <= 0) return null;
  if (runningCampaigns(ad).length === 0 || !spendMeaningful(fact, ad)) return null;
  // ДРР выше маржи уже отдельная, более сильная задача.
  if (fact.marginPercent != null && ad.drrPercent != null && ad.drrPercent > fact.marginPercent) return null;
  const cpoNow = ad.spend / ad.orders;
  const cpoPrev = prev.spend / prev.orders;
  const ratio = cpoNow / cpoPrev;
  if (!(ratio >= CPO_RISE_NOTICE)) return null;
  const ctrNow = ad.clicks / ad.views;
  const ctrPrev = prev.clicks / prev.views;
  const crNow = ad.orders / ad.clicks;
  const crPrev = prev.orders / prev.clicks;
  const cpcNow = ad.spend / ad.clicks;
  const cpcPrev = prev.spend / prev.clicks;
  const zCtr = zTwo(ad.clicks, ad.views, prev.clicks, prev.views);
  const zCr = zTwo(ad.orders, ad.clicks, prev.orders, prev.clicks);
  const causes: Array<{ key: string; line: string; fix: string }> = [];
  if (zCtr != null && zCtr <= Z_CTR) {
    causes.push({
      key: "ctr",
      line: `доля кликов от показов ${adPct(ctrPrev * 100)} → ${adPct(ctrNow * 100)}`,
      fix: "карточку стали реже открывать из рекламы: проверьте главное фото, цену и рейтинг, возможно, появились более сильные конкуренты",
    });
  }
  if (zCr != null && zCr <= Z_CR) {
    causes.push({
      key: "cr",
      line: `заказов на 100 кликов ${adPct(crPrev * 100)} → ${adPct(crNow * 100)}`,
      fix: "кликают, но реже заказывают: проверьте цену и скидку, свежие отзывы, наличие размеров и вариантов",
    });
  }
  if (cpcPrev > 0 && cpcNow / cpcPrev >= CPC_RISE) {
    causes.push({
      key: "cpc",
      line: `цена клика ${adRub(cpcPrev)} → ${adRub(cpcNow)}`,
      fix: "клик подорожал: выросла ставка или конкуренция в выдаче, сверьте ставку с рекомендованной WB",
    });
  }
  // Цена заказа выросла, но ни один из множителей не изменился надёжно: это шум малых чисел.
  if (causes.length === 0) return null;
  const important = ratio >= CPO_RISE_IMPORTANT;
  const severity = important ? "important" : "opportunity";
  const names = spendingNames(ad.campaigns);
  return {
    ...adBase(fact),
    type: "TASK_AD_EFFICIENCY_DROP",
    category: "sales",
    baseSeverity: severity,
    severityFloor: severity,
    severityCeiling: severity,
    title: important ? "Реклама товара заметно подорожала за заказ" : "Реклама товара стала немного менее эффективной",
    description: `Заказ по рекламе стоил ${adRub(cpoPrev)}, теперь ${adRub(cpoNow)} (+${changePct(cpoNow, cpoPrev)}%): ${ad.windowDays} дн. к предыдущим ${ad.windowDays} дн. Что изменилось: ${causes.map((c) => c.line).join("; ")}.`,
    reason: "Цена рекламного заказа выросла, и это подтверждено статистикой показов, кликов и заказов, а не случайностью малого числа заказов.",
    evidence: {
      cpo_now: Math.round(cpoNow),
      cpo_prev: Math.round(cpoPrev),
      cpo_change_percent: changePct(cpoNow, cpoPrev),
      ctr_now_percent: Math.round(ctrNow * 1000) / 10,
      ctr_prev_percent: Math.round(ctrPrev * 1000) / 10,
      cr_now_percent: Math.round(crNow * 1000) / 10,
      cr_prev_percent: Math.round(crPrev * 1000) / 10,
      cpc_now: Math.round(cpcNow * 10) / 10,
      cpc_prev: Math.round(cpcPrev * 10) / 10,
      causes: causes.map((c) => c.key).join(","),
      drr_percent: ad.drrPercent,
      ad_spend: ad.spend,
      ad_orders: ad.orders,
      window_days: ad.windowDays,
      campaigns: names || null,
    },
    recommendation: `${causes.map((c) => sentence(c.fix)).join(". ")}.${important ? " Если не поможет, снизьте ставку или поставьте дневной лимит, пока причина не найдена." : " Пока это повод присмотреться, останавливать рекламу не нужно."}`,
    businessImpactType: "PROFIT_PROTECTION",
  };
}

/** Доля кликов или заказов ниже половины эталона магазина и статистически значимо. */
const WEAK_SHARE_OF_BENCHMARK = 0.5;
const WEAK_MIN_VIEWS = 1000;
const WEAK_MIN_CLICKS = 100;
const WEAK_MIN_BENCHMARK_PRODUCTS = 3;

/**
 * Карточка плохо работает под рекламой по сравнению с вашими же товарами: мало кликов от показов (фото, цена)
 * или мало заказов от кликов (цена, отзывы, наличие). Эталон считается по рекламе самого магазина.
 */
export function ruleAdWeakCard(fact: TaskFact): TaskDraft | null {
  const ad = fact.adFacts;
  const bm = ad?.benchmark;
  if (!ad?.statsReady || !bm || bm.products < WEAK_MIN_BENCHMARK_PRODUCTS || bm.ctrPercent == null || bm.crPercent == null) return null;
  if (ad.views < WEAK_MIN_VIEWS) return null;
  if (fact.stock != null && fact.stock <= 0) return null;
  if (runningCampaigns(ad).length === 0 || !spendMeaningful(fact, ad)) return null;
  // Нулевые заказы при большом расходе уже ведёт «Реклама без заказов»: не дублируем.
  if (ruleAdNoOrders(fact)) return null;
  const ctr = (ad.clicks / ad.views) * 100;
  const zCtr = zOne(ad.clicks, ad.views, bm.ctrPercent / 100);
  const lowCtr = ctr < bm.ctrPercent * WEAK_SHARE_OF_BENCHMARK && zCtr != null && zCtr <= Z_CTR;
  const cr = ad.clicks > 0 ? (ad.orders / ad.clicks) * 100 : 0;
  const zCr = zOne(ad.orders, ad.clicks, bm.crPercent / 100);
  const lowCr = ad.clicks >= WEAK_MIN_CLICKS && cr < bm.crPercent * WEAK_SHARE_OF_BENCHMARK && zCr != null && zCr <= Z_CTR;
  if (!lowCtr && !lowCr) return null;
  const lines: string[] = [];
  const fixes: string[] = [];
  if (lowCtr) {
    lines.push(`кликают ${adPct(ctr)} показов при ${adPct(bm.ctrPercent)} в среднем по вашей рекламе`);
    fixes.push("Смените главное фото, проверьте цену и рейтинг: по показам карточку выбирают реже, чем ваши другие товары");
  }
  if (lowCr) {
    lines.push(`заказов на 100 кликов ${adPct(cr)} при ${adPct(bm.crPercent)} в среднем по вашей рекламе`);
    fixes.push("Проверьте цену и скидку, свежие отзывы и вопросы, наличие размеров и вариантов: кликают, но не покупают");
  }
  const severity = lowCtr && lowCr ? "important" : "opportunity";
  const names = spendingNames(ad.campaigns);
  return {
    ...adBase(fact),
    type: "TASK_AD_WEAK_CARD",
    category: "content",
    baseSeverity: severity,
    severityFloor: severity,
    severityCeiling: severity,
    title: "Карточка плохо работает под рекламой",
    description: `За ${ad.windowDays} дн. показов ${ad.views.toLocaleString("ru-RU")}, кликов ${ad.clicks.toLocaleString("ru-RU")}, заказов ${ad.orders.toLocaleString("ru-RU")}: ${lines.join("; ")}.`,
    reason: "Показатели карточки под рекламой значимо ниже половины среднего по вашим же рекламируемым товарам.",
    evidence: {
      ctr_percent: Math.round(ctr * 10) / 10,
      ctr_benchmark_percent: Math.round(bm.ctrPercent * 10) / 10,
      cr_percent: Math.round(cr * 10) / 10,
      cr_benchmark_percent: Math.round(bm.crPercent * 10) / 10,
      benchmark_products: bm.products,
      weak_ctr: lowCtr,
      weak_cr: lowCr,
      ad_views: ad.views,
      ad_clicks: ad.clicks,
      ad_orders: ad.orders,
      ad_spend: ad.spend,
      window_days: ad.windowDays,
      campaigns: names || null,
    },
    recommendation: `${fixes.join(". ")}. Пока карточка слабая, часть рекламного бюджета тратится впустую.`,
    businessImpactType: "SALES_GROWTH",
  };
}

const SCALE_MIN_ORDERS = 5;
/** ДРР не выше этой доли маржи считается запасом прочности под рост. */
const SCALE_DRR_SHARE = 0.6;
const SCALE_MIN_COVER_DAYS = 21;

/**
 * Реклама окупается с большим запасом и товара хватит: можно осторожно увеличить ставку или лимит.
 * Рост заказов не обещаем: WB не сообщает, как он ответит на повышение ставки.
 */
export function ruleAdScaleUp(fact: TaskFact): TaskDraft | null {
  const ad = fact.adFacts;
  if (!ad?.statsReady || ad.orders < SCALE_MIN_ORDERS || ad.drrPercent == null) return null;
  const marginPercent = fact.marginPercent;
  if (marginPercent == null || marginPercent <= 0 || ad.drrPercent > marginPercent * SCALE_DRR_SHARE) return null;
  if (fact.coverDays == null || fact.coverDays < SCALE_MIN_COVER_DAYS) return null;
  if (fact.stock == null || fact.stock <= 0) return null;
  const live = runningCampaigns(ad).filter((c) => c.orders > 0);
  if (live.length === 0) return null;
  // Нельзя растить то, что уже дорожает.
  const prev = ad.prev;
  if (prev && prev.orders > 0 && ad.spend / ad.orders > (prev.spend / prev.orders) * CPO_RISE_NOTICE) return null;
  const names = live.map((c) => `«${c.name}»`).join(", ");
  return {
    ...adBase(fact),
    type: "TASK_AD_SCALE_UP",
    category: "sales",
    baseSeverity: "opportunity",
    severityFloor: "opportunity",
    severityCeiling: "opportunity",
    title: "Реклама окупается с запасом, можно увеличить",
    description: `За ${ad.windowDays} дн. ${ad.orders.toLocaleString("ru-RU")} заказов по рекламе, ДРР ${adPct(ad.drrPercent)} при марже ${adPct(marginPercent)}. Товара хватит на ${Math.round(fact.coverDays).toLocaleString("ru-RU")} дн.`,
    reason: "ДРР не выше 60% маржи, заказов достаточно, товара хватает: рекламу можно наращивать без риска уйти в минус.",
    evidence: {
      drr_percent: ad.drrPercent,
      margin_percent: marginPercent,
      ad_orders: ad.orders,
      ad_spend: ad.spend,
      cover_days: Math.round(fact.coverDays),
      window_days: ad.windowDays,
      campaigns: names,
    },
    recommendation: `Поднимите ставку или дневной лимит кампании ${names} небольшими шагами и смотрите на ДРР через неделю. Остановитесь, если ДРР подойдёт к марже ${adPct(marginPercent)}. Прирост заказов WB не гарантирует.`,
    businessImpactType: "SALES_GROWTH",
  };
}
