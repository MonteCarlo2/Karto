/**
 * Решение ИИ по проблеме товара в гибкой форме: от одного действия до плана из десяти шагов с тестами по срокам.
 * ИИ сам решает, какой нужен план, какие контрольные точки, по каким цифрам считать успех и что считать вредом; программа только проверяет границы,
 * ведёт план по дням, измеряет эффект («было → стало» по выбранным метрикам) и по итогу решает: сработало или нужен другой подход.
 * Числа цены ограничены здесь и ещё раз ограничителями цены при каждом шаге. Здесь только чистая логика (без базы и сети).
 */

export const DAY_MS = 86_400_000;

export const CRITERIA_METRICS = ["orders_28d", "cart_pct", "cart_to_order_pct", "turnover_days", "margin_pct", "stock", "opens_28d", "rating", "oos_days", "price_buyer"] as const;
export type CriteriaMetric = (typeof CRITERIA_METRICS)[number];

export const METRIC_LABEL: Record<CriteriaMetric, string> = {
  orders_28d: "заказы за 28 дней",
  cart_pct: "конверсия просмотр→корзина, %",
  cart_to_order_pct: "конверсия корзина→заказ, %",
  turnover_days: "оборачиваемость, дней",
  margin_pct: "маржа, %",
  stock: "остаток, шт.",
  opens_28d: "просмотры за 28 дней",
  rating: "рейтинг",
  oos_days: "дней до нулевого остатка",
  price_buyer: "цена для покупателя, ₽",
};

/** Подписи чисел из доказательств решения: клиент видит понятные слова, а не имена полей. */
const EVIDENCE_LABEL: Record<string, string> = {
  ...METRIC_LABEL,
  orders_prev_28d: "заказы за предыдущие 28 дней",
  orders_28d_total: "заказы за 28 дней по магазину",
  median_cart_pct: "медиана магазина: просмотр→корзина, %",
  store_median_cart_pct: "медиана магазина: просмотр→корзина, %",
  median_margin_pct: "медиана магазина: маржа, %",
  median_turnover_days: "медиана магазина: оборачиваемость, дней",
  store_median_turnover_days: "медиана магазина: оборачиваемость, дней",
  median_price: "медианная цена магазина, ₽",
  share_dead_stock_pct: "доля товаров без движения, %",
  break_even: "безубыточная цена, ₽",
  price: "цена, ₽",
  club_discount_pct: "скидка WB Клуба, %",
  gap_to_break_even_pct: "запас до безубыточности, %",
  margin_in_promo_pct: "маржа в акции, %",
  promo_price_rub: "цена в акции, ₽",
  negative_reviews: "негативных отзывов",
  sku_total: "товаров в магазине",
};

/** Короткие названия для вставки в связный текст («конверсия в корзину 20%»). Имена полей в тексте для клиента недопустимы. */
const INLINE_LABEL: Record<string, string> = {
  orders_28d: "заказы за 28 дней",
  orders_prev_28d: "заказы за предыдущие 28 дней",
  cart_pct: "конверсия в корзину",
  cart_to_order_pct: "конверсия корзина→заказ",
  median_cart_pct: "медиана магазина по конверсии в корзину",
  turnover_days: "оборачиваемость (дней)",
  margin_pct: "маржа",
  median_margin_pct: "медианная маржа магазина",
  stock: "остаток",
  opens_28d: "просмотры за 28 дней",
  rating: "рейтинг",
  oos_days: "дней до нулевого остатка",
  price_buyer: "цена для покупателя",
  break_even: "безубыточная цена",
  decline_days: "дней подряд падения заказов",
  rise_days: "дней подряд роста заказов",
  negative_recent: "свежих негативных отзывов",
  share_dead_stock_pct: "доля товаров без движения",
  club_discount_pct: "скидка Клуба",
};

/** Заменяет служебные имена полей в тексте ИИ на человеческие слова: остаток snake_case превращается в слова через пробел. */
export function humanizeKeys(text: string): string {
  return text.replace(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g, (k) => INLINE_LABEL[k] ?? EVIDENCE_LABEL[k] ?? k.replace(/_/g, " "));
}

export const evidenceLabel = (key: string): string => EVIDENCE_LABEL[key] ?? key.replace(/_/g, " ");

/** Что считать улучшением метрики. null: сама по себе не хорошо и не плохо (смотрим по цели стратегии). */
export const BETTER_WHEN: Record<CriteriaMetric, "up" | "down" | null> = {
  orders_28d: "up",
  cart_pct: "up",
  cart_to_order_pct: "up",
  turnover_days: "down",
  margin_pct: "up",
  stock: null,
  opens_28d: "up",
  rating: "up",
  oos_days: null,
  price_buyer: null,
};

export type Criterion = { metric: CriteriaMetric; op: ">=" | "<="; value: number };

export type PriceAction = { type: "price"; direction: "lower" | "raise"; stepPercent: 1 | 2 | 3; reason: string };

/** Допустимые ступени изменения ставки в рекламе, %. Программа считает новую ставку и проверяет её (минимум WB, рост не больше чем в 3 раза). */
export const BID_STEPS = [5, 10, 15, 20] as const;
export type AdsPauseAction = { type: "ads_pause"; campaignId: string; reason: string };
export type AdsResumeAction = { type: "ads_resume"; campaignId: string; reason: string };
export type AdsBidAction = { type: "ads_bid"; campaignId: string; direction: "lower" | "raise"; stepPercent: 5 | 10 | 15 | 20; reason: string };
/** Тестовая кампания по товару: создаётся без запуска и без списания денег. */
export type AdsCreateTestAction = { type: "ads_create_test"; reason: string };

/** Убрать товар из рекламной кампании или вернуть/добавить его в другую кампанию магазина (кампании берутся только из данных кабинета). */
export type AdsRemoveNmAction = { type: "ads_remove_nm"; campaignId: string; reason: string };
export type AdsAddNmAction = { type: "ads_add_nm"; campaignId: string; reason: string };
/** Пополнение бюджета кампании товара. Сумма только из набора ступеней: 500, 1000 или 2000 ₽ за шаг; фактический остаток на счёте проверяет исполнитель. */
export const DEPOSIT_STEPS = [500, 1000, 2000] as const;
export type AdsDepositAction = { type: "ads_deposit"; campaignId: string; sumRub: 500 | 1000 | 2000; reason: string };

/** Скидка WB Клуба: ступень в процентных пунктах 1–3; сумму считает программа и проверяет, что цена для участников Клуба не уходит ниже безубыточной. */
export type ClubDiscountAction = { type: "club_discount"; direction: "lower" | "raise"; stepPercent: 1 | 2 | 3; reason: string };
/** Вход в календарную акцию WB, открытую для товара: promoId только из списка доступных акций, условия и маржу в акции программа проверяет по свежим данным. */
export type PromoJoinAction = { type: "promo_join"; promoId: string; reason: string };

/** Правка характеристик карточки: до 5 за шаг, только характеристики категории товара (charcId из списка card.category_charcs), значения только правдивые из карточки. */
export type CharacteristicsEditAction = { type: "characteristics_edit"; changes: Array<{ charcId: number; value: string | number }>; reason: string };

/** Минус-фразы по товару в кампании: только запросы из списка запросов без заказов (ads_queries), не больше 10 за шаг. */
export type AdsMinusPhrasesAction = { type: "ads_minus_phrases"; campaignId: string; queries: string[]; reason: string };
/** Дневной лимит расхода кампании с оплатой за клики: от 1000 ₽. Только ограничивает расход. */
export type AdsDailyLimitAction = { type: "ads_daily_limit"; campaignId: string; limitRub: number; reason: string };
/** Места показа кампании: поиск и/или рекомендации. Хотя бы одно место должно остаться включённым. */
export type AdsPlacementsAction = { type: "ads_placements"; campaignId: string; search: boolean; recommendations: boolean; reason: string };

/** Выход товара из акции WB, в которой он участвует: promoId только из акций товара. Вернуть можно вручную на странице акции. */
export type PromoExitAction = { type: "promo_exit"; promoId: string; reason: string };

/** Новый текст названия или описания карточки: пишет ИИ, программа проверяет границы WB и правила, владелец видит «было → станет» и подтверждает. */
export type ContentEditAction = { type: "content_edit"; field: "title" | "description"; text: string; reason: string };

/** Действия, которые программа может выполнить сама по плану (после подтверждения человеком). Остальное в плане делает человек. */
export type PlanAction = PriceAction | AdsPauseAction | AdsResumeAction | AdsBidAction | AdsCreateTestAction | ContentEditAction | PromoExitAction | AdsRemoveNmAction | AdsAddNmAction | AdsDepositAction | ClubDiscountAction | PromoJoinAction | AdsMinusPhrasesAction | AdsPlacementsAction | AdsDailyLimitAction | CharacteristicsEditAction;

export type StrategyStep = {
  /** Условие-триггер: шаг программы предлагается, только когда наступил его день и условие выполнено по свежим данным («остаток ≤ 14 дней до нуля»). Нет условия: по дню. */
  onlyIf?: Criterion;
  step: string;
  by: "human" | "program";
  /** День от принятия плана (0 — сразу). */
  day: number;
  /** Как это сказал ИИ: «сразу», «в первые 3 дня», «через 7 дней». */
  when: string;
  /** Действие программы. Всё остальное (карточка, поставка, ответы, акции) выполняет человек. */
  action: PlanAction | null;
  /** Инструмент KARTO, где человек делает этот шаг: visual — фото и инфографика в Потоке, description — SEO-описание, auto_replies — ответы на отзывы. */
  flow?: StepFlow;
};

export const STEP_FLOWS = ["visual", "description", "auto_replies"] as const;
export type StepFlow = (typeof STEP_FLOWS)[number];

export type CheckLook = { metric: CriteriaMetric; expect: "up" | "down" | "hold" };
export type StrategyCheck = { day: number; label: string; look: CheckLook[] };

export type Strategy = {
  goal: string;
  steps: StrategyStep[];
  /** Контрольные точки, которые задаёт ИИ под ситуацию (может не быть). */
  checks: StrategyCheck[];
  /** Критерии успеха (цель в числах). Пусто: итоговый вердикт не выносится, ведётся наблюдение. */
  success: Criterion[];
  /** Что не должно ухудшиться (например, маржа, конверсия). Нарушение останавливает план и открывает решение заново. */
  guards: Criterion[];
  /** Через сколько дней подвести итог. null: итога нет, только наблюдение за метриками. */
  reviewAfterDays: number | null;
  failNote: string;
  fallback: string;
};

export const MAX_TOTAL_PERCENT = 10;
export const MIN_DAYS_BETWEEN_PRICE_STEPS = 1;
export const MAX_STEPS = 10;
export const MAX_REVIEW_DAYS = 60;
export const MIN_REVIEW_DAYS = 1;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const text = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
/** Текст для клиента: служебные имена полей заменены словами. */
const prose = (v: unknown, max: number): string => humanizeKeys(text(v, max));
/** Длинный текст обрезается по границе слова с многоточием, чтобы не рвать фразу посреди слова. */
export const clip = (v: unknown, max: number): string => {
  const t = humanizeKeys(text(v, 10_000));
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:.\-]+$/, "")}…`;
};
const isMetric = (v: unknown): v is CriteriaMetric => typeof v === "string" && (CRITERIA_METRICS as readonly string[]).includes(v);

function parseCriteria(raw: unknown, limit: number): Criterion[] {
  const out: Criterion[] = [];
  for (const item of (Array.isArray(raw) ? raw : []).slice(0, limit)) {
    const c = item as { metric?: unknown; op?: unknown; value?: unknown };
    if (!isMetric(c.metric) || (c.op !== ">=" && c.op !== "<=")) continue;
    const value = Number(c.value);
    if (Number.isFinite(value)) out.push({ metric: c.metric, op: c.op, value });
  }
  return out;
}

export const WB_TITLE_LIMIT = 60;
export const WB_DESCRIPTION_MAX = 5000;
const TITLE_MIN = 10;
const DESCRIPTION_MIN = 200;
// Ссылки, телефоны, почта, мессенджеры: WB такие тексты в карточке не допускает.
const FORBIDDEN_CONTACTS = /https?:\/\/|www\.|[\w.+-]+@[\w-]+\.[a-z]{2,}|(?:\+7|8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}|t\.me\/|whatsapp|telegram|viber|инстаграм|instagram/i;

const PLACEHOLDER = /[\[\]{}<>]|\.{3}|…|TODO|подтвержд/iu;

// Рекламные и сравнительные слова: WB их в названии и описании не любит.  с кириллицей не работает, поэтому границы заданы явно.
const PROMO_WORDS = /(^|[^а-яёa-z])(акци[яиюей]|скидк\p{L}*|бесплатн\p{L}*|распродаж\p{L}*|лучш\p{L}*|№\s?1|хит\s+продаж)([^а-яёa-z]|$)/iu;

/** Проверка текста карточки, который написал ИИ. Возвращает текст или null, если он не годится для WB. */
export function validateCardText(field: "title" | "description", raw: string): string | null {
  const text = raw.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  // Заготовки вроде «[подтверждённый объём]» или «...» значит, что ИИ не знает факта: такой текст в карточку отправлять нельзя.
  if (PLACEHOLDER.test(text)) return null;
  if (FORBIDDEN_CONTACTS.test(text) || PROMO_WORDS.test(text)) return null;
  if (field === "title") return text.length >= TITLE_MIN && text.length <= WB_TITLE_LIMIT && !text.includes("\n") ? text : null;
  return text.length >= DESCRIPTION_MIN && text.length <= WB_DESCRIPTION_MAX ? text : null;
}

/** Значение характеристики, которое написал ИИ: короткий правдивый текст без контактов, ссылок, рекламных слов и заготовок. */
export function validateCharcValue(raw: unknown, numeric: boolean): string | number | null {
  if (numeric) {
    const n = typeof raw === "number" ? raw : Number(String(raw ?? "").replace(",", ".").trim());
    return Number.isFinite(n) && n > 0 && n < 1e7 ? n : null;
  }
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const text = String(raw).replace(/\s+/g, " ").trim();
  if (!text || text.length > 100) return null;
  if (PLACEHOLDER.test(text) || FORBIDDEN_CONTACTS.test(text) || PROMO_WORDS.test(text)) return null;
  return text;
}

export type ParseContext = {
  /** Кампании, в которых участвует товар: действия по рекламе допускаются только по ним. null: данных нет, действия по рекламе не принимаются. */
  campaignIds?: Set<string> | null;
  /** Акции, в которых товар участвует сейчас: выход из акции допускается только из них. */
  promoIds?: Set<string> | null;
  /** Кампании магазина, в которых этого товара нет: добавлять товар можно только в них. */
  otherCampaignIds?: Set<string> | null;
  /** Акции, открытые для товара (он в них пока не участвует, условия известны): вход допускается только в них. */
  openPromoIds?: Set<string> | null;
  /** Запросы рекламы без заказов по кампаниям товара: минус-фразы допускаются только из них. Ключ: campaignId, значение: допустимые запросы (в нижнем регистре). */
  adQueries?: Map<string, Set<string>> | null;
  /** Характеристики категории товара: правки допускаются только по ним. type 4 — число. */
  charcs?: Map<number, { name: string; type: number | null }> | null;
};

function parseAction(raw: unknown, ctx: ParseContext): PlanAction | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  const reason = text(a.reason, 240);
  const campaignId = typeof a.campaignId === "string" ? a.campaignId : typeof a.campaignId === "number" ? String(a.campaignId) : "";
  const knownCampaign = Boolean(campaignId) && Boolean(ctx.campaignIds?.has(campaignId));
  const promoId = typeof a.promoId === "string" ? a.promoId : typeof a.promoId === "number" ? String(a.promoId) : "";
  if (a.type === "price") {
    const step = Number(a.stepPercent);
    if ((a.direction !== "lower" && a.direction !== "raise") || ![1, 2, 3].includes(step)) return null;
    return { type: "price", direction: a.direction, stepPercent: step as 1 | 2 | 3, reason };
  }
  if (a.type === "characteristics_edit" && Array.isArray(a.changes) && ctx.charcs) {
    const seen = new Set<number>();
    const changes: Array<{ charcId: number; value: string | number }> = [];
    for (const raw of a.changes.slice(0, 5)) {
      const c = raw as { charcId?: unknown; value?: unknown };
      const id = Number(c.charcId);
      const meta = Number.isInteger(id) ? ctx.charcs.get(id) : undefined;
      if (!meta || seen.has(id)) continue;
      const value = validateCharcValue(c.value, meta.type === 4);
      if (value == null) continue;
      seen.add(id);
      changes.push({ charcId: id, value });
    }
    return changes.length > 0 ? { type: "characteristics_edit", changes, reason } : null;
  }
  if (a.type === "ads_minus_phrases" && knownCampaign) {
    const allowed = ctx.adQueries?.get(campaignId);
    const asked = (Array.isArray(a.queries) ? a.queries : []).filter((q): q is string => typeof q === "string").map((q) => q.trim());
    const queries = [...new Set(asked.filter((q) => q && allowed?.has(q.toLowerCase())))].slice(0, 10);
    return queries.length > 0 ? { type: "ads_minus_phrases", campaignId, queries, reason } : null;
  }
  if (a.type === "ads_daily_limit" && knownCampaign) {
    const limit = Math.round(Number(a.limitRub));
    return Number.isFinite(limit) && limit >= 1000 && limit <= 100_000 ? { type: "ads_daily_limit", campaignId, limitRub: limit, reason } : null;
  }
  if (a.type === "ads_placements" && knownCampaign && typeof a.search === "boolean" && typeof a.recommendations === "boolean" && (a.search || a.recommendations)) return { type: "ads_placements", campaignId, search: a.search, recommendations: a.recommendations, reason };
  if (a.type === "promo_join" && promoId && ctx.openPromoIds?.has(promoId)) return { type: "promo_join", promoId, reason };
  if (a.type === "club_discount") {
    const step = Number(a.stepPercent);
    if ((a.direction !== "lower" && a.direction !== "raise") || ![1, 2, 3].includes(step)) return null;
    return { type: "club_discount", direction: a.direction, stepPercent: step as 1 | 2 | 3, reason };
  }
  if (a.type === "ads_remove_nm" && knownCampaign) return { type: "ads_remove_nm", campaignId, reason };
  if (a.type === "ads_add_nm" && campaignId && ctx.otherCampaignIds?.has(campaignId)) return { type: "ads_add_nm", campaignId, reason };
  if (a.type === "ads_deposit" && knownCampaign && (DEPOSIT_STEPS as readonly number[]).includes(Number(a.sumRub))) return { type: "ads_deposit", campaignId, sumRub: Number(a.sumRub) as AdsDepositAction["sumRub"], reason };
  if (a.type === "ads_pause" && knownCampaign) return { type: "ads_pause", campaignId, reason };
  if (a.type === "ads_resume" && knownCampaign) return { type: "ads_resume", campaignId, reason };
  if (a.type === "ads_bid" && knownCampaign) {
    const step = Number(a.stepPercent);
    if ((a.direction !== "lower" && a.direction !== "raise") || !(BID_STEPS as readonly number[]).includes(step)) return null;
    return { type: "ads_bid", campaignId, direction: a.direction, stepPercent: step as AdsBidAction["stepPercent"], reason };
  }
  if (a.type === "promo_exit" && promoId && ctx.promoIds?.has(promoId)) return { type: "promo_exit", promoId, reason };
  if (a.type === "ads_create_test") return { type: "ads_create_test", reason };
  if (a.type === "content_edit" && (a.field === "title" || a.field === "description") && typeof a.text === "string") {
    const text = validateCardText(a.field, a.text);
    return text ? { type: "content_edit", field: a.field, text, reason } : null;
  }
  return null;
}

/**
 * Разбор решения из ответа ИИ. Форма свободная: от одного шага до десяти, контрольные точки и критерии по ситуации.
 * Подрезаются только опасные границы: общий предел изменения цены 10% в одну сторону, шаги цены не чаще раза в сутки, сроки не больше 60 дней.
 * Без цели или без единого шага решение не принимается.
 */
export function parseStrategy(raw: unknown, ctx: ParseContext = {}): Strategy | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  const goal = prose(s.goal, 300);
  const rawSteps = (Array.isArray(s.steps) ? s.steps : []).slice(0, MAX_STEPS).map((p) => p as Record<string, unknown>).filter((p) => typeof p.step === "string" && p.step.trim());
  if (!goal || rawSteps.length === 0) return null;

  // Шаги цены: сначала по дням, затем подрезка по общему пределу (10% в каждую сторону) и по минимальному интервалу между шагами.
  const sorted = rawSteps
    .map((p) => {
      const action = parseAction(p.action, ctx);
      const day = clamp(Math.round(Number(p.day) || 0), 0, MAX_REVIEW_DAYS);
      const flow = (STEP_FLOWS as readonly string[]).includes(String(p.flow)) ? (p.flow as StepFlow) : undefined;
      const onlyIf = p.if && typeof p.if === "object" ? parseCriteria([p.if], 1)[0] : undefined;
      return { step: clip(typeof p.step === "string" ? p.step.replace(/\s*flow:\s*\\?"?\w+\\?"?\.?/gi, "") : p.step, 600), by: action || p.by === "program" ? ("program" as const) : ("human" as const), day, when: clip(p.when, 120) || (day === 0 ? "сразу" : `через ${day} дн.`), action, ...(onlyIf ? { onlyIf } : {}), ...(flow && !action ? { flow } : {}) };
    })
    .sort((a, b) => a.day - b.day);
  const totals = { lower: 0, raise: 0 };
  let lastPriceDay = -Infinity;
  let lastClubDay = -Infinity;
  const steps: StrategyStep[] = sorted.map((p) => {
    if (!p.action) return { ...p, by: p.by === "program" ? ("human" as const) : p.by };
    if (p.action.type !== "price" && p.action.type !== "club_discount") return p;
    if (p.action.type === "club_discount") {
      const clubTooClose = p.day - lastClubDay < MIN_DAYS_BETWEEN_PRICE_STEPS;
      if (clubTooClose) return { ...p, action: null, by: "human" as const, step: `${p.step} (шаги скидки Клуба не чаще раза в сутки; сделать вручную)` };
      lastClubDay = p.day;
      return p;
    }
    const tooClose = p.day - lastPriceDay < MIN_DAYS_BETWEEN_PRICE_STEPS;
    const overCap = totals[p.action.direction] + p.action.stepPercent > MAX_TOTAL_PERCENT;
    if (tooClose || overCap) return { ...p, action: null, by: "human" as const, step: `${p.step} (предел изменения цены; сделать вручную или после итога)` };
    totals[p.action.direction] += p.action.stepPercent;
    lastPriceDay = p.day;
    return p;
  });

  const success = parseCriteria(s.success, 4);
  const guards = parseCriteria(s.guards, 3);
  const reviewRaw = s.reviewAfterDays == null ? null : Math.round(Number(s.reviewAfterDays));
  const reviewAfterDays = reviewRaw != null && Number.isFinite(reviewRaw) && reviewRaw > 0 ? clamp(reviewRaw, MIN_REVIEW_DAYS, MAX_REVIEW_DAYS) : null;

  const checks: StrategyCheck[] = (Array.isArray(s.checks) ? s.checks : [])
    .slice(0, 6)
    .map((c) => c as Record<string, unknown>)
    .map((c) => ({
      day: clamp(Math.round(Number(c.day) || 0), 1, MAX_REVIEW_DAYS),
      label: prose(c.label, 160) || "Проверка",
      look: (Array.isArray(c.look) ? c.look : [])
        .slice(0, 4)
        .map((l) => l as Record<string, unknown>)
        .filter((l) => isMetric(l.metric) && (l.expect === "up" || l.expect === "down" || l.expect === "hold"))
        .map((l) => ({ metric: l.metric as CriteriaMetric, expect: l.expect as CheckLook["expect"] })),
    }))
    .filter((c) => reviewAfterDays == null || c.day <= reviewAfterDays)
    .sort((a, b) => a.day - b.day);

  return { goal, steps, checks, success, guards, reviewAfterDays, failNote: prose(s.failNote, 240), fallback: prose(s.fallback, 400) };
}

/** Решение из базы: только текущей формы. Записи прежнего формата (без контрольных точек и критериев в нужном виде) не используются, чтобы они не ломали ведение и экран. */
export function normalizeStoredStrategy(raw: unknown): Strategy | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.steps) || !Array.isArray(r.checks) || !Array.isArray(r.success) || !Array.isArray(r.guards) || typeof r.goal !== "string") return null;
  return raw as Strategy;
}

/** Все метрики, за которыми следит решение: критерии успеха, ограничители и то, на что смотрят контрольные точки. */
export function trackedMetrics(strategy: Strategy): CriteriaMetric[] {
  const set = new Set<CriteriaMetric>();
  strategy.success.forEach((c) => set.add(c.metric));
  strategy.guards.forEach((c) => set.add(c.metric));
  strategy.checks.forEach((c) => c.look.forEach((l) => set.add(l.metric)));
  strategy.steps.forEach((s) => s.onlyIf && set.add(s.onlyIf.metric));
  return [...set];
}

export type Metrics = Record<string, number | null>;

export type StrategyCheckpoint = {
  day: number;
  label: string;
  at: string;
  metrics: Metrics;
  /** Оправдались ли ожидания контрольной точки (null: ожиданий не задано или нет данных). */
  looksMet: boolean | null;
  successMet: boolean;
  guardBroken: boolean;
};

export type StrategyState = {
  status?: "running" | "worked" | "not_worked" | "observed";
  acceptedAt?: string;
  baseline?: Metrics;
  checkpoints?: StrategyCheckpoint[];
  resolvedAt?: string;
  finalMetrics?: Metrics;
  /** Метрики на последнем пересчёте (для показа «было → стало» без обращения к данным) и когда считались. */
  current?: Metrics;
  updatedAt?: string;
  /** Номера шагов плана (индексы в steps), которые владелец уже выполнил кнопкой, и когда выполнен последний. */
  doneSteps?: number[];
  /** Шаги, которые делает человек: отметил «сделал» или «пропустил» (ключ — номер шага). Без отметки шаг ждёт. */
  humanSteps?: Record<string, { status: "done" | "skipped"; at: string }>;
  lastDoneAt?: string;
  lastPriceDoneAt?: string;
  /** Почему закончилось не успехом: срок вышел или нарушен ограничитель. */
  reason?: string;
};

export const criterionMet = (facts: Record<string, number | null | undefined>, c: Criterion): boolean => {
  const v = facts[c.metric];
  if (v == null || !Number.isFinite(v)) return false;
  return c.op === ">=" ? v >= c.value : v <= c.value;
};

export const pickMetrics = (facts: Record<string, number | null | undefined>, metrics: CriteriaMetric[]): Metrics => {
  const out: Metrics = {};
  for (const m of metrics) out[m] = typeof facts[m] === "number" ? (facts[m] as number) : null;
  return out;
};

function looksMet(look: CheckLook[], baseline: Metrics, now: Metrics): boolean | null {
  const rated = look.map((l) => {
    const a = baseline[l.metric];
    const b = now[l.metric];
    if (a == null || b == null) return null;
    const rel = a === 0 ? (b === 0 ? 0 : Math.sign(b)) : (b - a) / Math.abs(a);
    if (l.expect === "up") return rel > 0.02;
    if (l.expect === "down") return rel < -0.02;
    return Math.abs(rel) <= 0.05;
  });
  const known = rated.filter((x): x is boolean => x !== null);
  return known.length === 0 ? null : known.every(Boolean);
}

/**
 * Оценка хода плана на сегодня. Контрольные точки записываются по мере наступления сроков (метрики на момент точки и оправдались ли ожидания).
 * Нарушение ограничителя останавливает план. «Сработало»: критерии успеха выполнены (не раньше первой контрольной точки или 3 дня), ограничители целы.
 * «Не сработало»: срок итога вышел, критерии не выполнены. Нет срока итога или нет критериев: статус «наблюдение» по окончании срока, вердикта нет.
 */
export function evaluateStrategy(strategy: Strategy, state: StrategyState, facts: Record<string, number | null | undefined>, nowMs: number): StrategyState {
  const acceptedMs = state.acceptedAt ? Date.parse(state.acceptedAt) : NaN;
  if (!Number.isFinite(acceptedMs)) return state;
  const tracked = trackedMetrics(strategy);
  const next: StrategyState = { ...state, status: state.status ?? "running", checkpoints: [...(state.checkpoints ?? [])] };
  if (next.status !== "running") return next;
  const baseline = next.baseline ?? pickMetrics(facts, tracked);
  const elapsedDays = (nowMs - acceptedMs) / DAY_MS;
  const now = pickMetrics(facts, tracked);
  next.current = now;
  next.updatedAt = new Date(nowMs).toISOString();
  const successMet = strategy.success.length > 0 && strategy.success.every((c) => criterionMet(facts, c));
  const guardBroken = strategy.guards.some((c) => facts[c.metric] != null && !criterionMet(facts, c));

  for (const check of strategy.checks) {
    if (elapsedDays >= check.day && !next.checkpoints!.some((c) => c.day === check.day && c.label === check.label)) {
      next.checkpoints!.push({ day: check.day, label: check.label, at: new Date(nowMs).toISOString(), metrics: now, looksMet: looksMet(check.look, baseline, now), successMet, guardBroken });
    }
  }
  const firstCheck = strategy.checks[0]?.day ?? 3;
  const end = (status: "worked" | "not_worked" | "observed", reason = "") => {
    next.status = status;
    next.resolvedAt = new Date(nowMs).toISOString();
    next.finalMetrics = now;
    if (reason) next.reason = reason;
  };
  if (guardBroken && elapsedDays >= Math.min(firstCheck, 3)) end("not_worked", "нарушен ограничитель плана: " + strategy.guards.filter((c) => facts[c.metric] != null && !criterionMet(facts, c)).map(describeCriterion).join("; "));
  else if (successMet && elapsedDays >= firstCheck) end("worked");
  else if (strategy.reviewAfterDays != null && elapsedDays >= strategy.reviewAfterDays) {
    if (strategy.success.length === 0) end("observed");
    else end("not_worked", "срок итога вышел, критерии успеха не выполнены");
  }
  return next;
}

export type EffectRow = { metric: CriteriaMetric; label: string; before: number | null; after: number | null; change: number | null; changePct: number | null; better: boolean | null };

/** Измеренный эффект: «было → стало» по метрикам плана. better: стало лучше (по смыслу метрики), null: нейтрально или нет данных. */
export function effectReport(strategy: Strategy, state: StrategyState, current: Metrics): EffectRow[] {
  const base = state.baseline ?? {};
  return trackedMetrics(strategy).map((metric) => {
    const before = base[metric] ?? null;
    const after = current[metric] ?? null;
    const change = before != null && after != null ? Math.round((after - before) * 10) / 10 : null;
    const changePct = before != null && after != null && before !== 0 ? Math.round(((after - before) / Math.abs(before)) * 1000) / 10 : null;
    const w = BETTER_WHEN[metric];
    const better = change == null || w == null || change === 0 ? null : w === "up" ? change > 0 : change < 0;
    return { metric, label: METRIC_LABEL[metric], before, after, change, changePct, better };
  });
}

export type StepProgress = { index: number; step: StrategyStep; kind: "program" | "human"; status: "done" | "skipped" | "due" | "upcoming" };

/**
 * Ход выполнения плана по шагам. Шаги программы выполняются кнопкой «Выполнить» (doneSteps), шаги человека (то, на что у нас нет влияния через API:
 * фото, поставка, ответы, акции, проверка себестоимости) ждут его отметки «сделал» или «пропустил». due: день шага наступил, отметки ещё нет.
 */
export function stepProgress(strategy: Strategy, state: StrategyState, nowMs: number): StepProgress[] {
  const acceptedMs = state.acceptedAt ? Date.parse(state.acceptedAt) : NaN;
  return strategy.steps.map((step, index) => {
    const kind: "program" | "human" = step.by === "program" && step.action ? "program" : "human";
    let status: StepProgress["status"];
    if (kind === "program") status = state.doneSteps?.includes(index) ? "done" : "upcoming";
    else status = state.humanSteps?.[String(index)]?.status ?? "upcoming";
    // Шаг с условием-триггером не «ждёт отметки», пока условие не сработало: он наготове.
    if (status === "upcoming" && Number.isFinite(acceptedMs) && nowMs >= acceptedMs + step.day * DAY_MS && !(kind === "program" && step.onlyIf)) status = "due";
    return { index, step, kind, status };
  });
}

/** Сводка по исполнению плана: сколько сделано, пропущено, ждёт. Нужна для честной оценки результата («план выполнен не полностью») и для следующей попытки. */
export function stepCompliance(strategy: Strategy, state: StrategyState, nowMs: number): { total: number; done: number; skipped: number; waiting: number; text: string } {
  // Шаги-триггеры, которые не понадобились (условие не наступило), в исполнение плана не входят.
  const list = stepProgress(strategy, state, nowMs).filter((x) => !(x.step.onlyIf && x.kind === "program" && x.status === "upcoming"));
  const done = list.filter((x) => x.status === "done").length;
  const skipped = list.filter((x) => x.status === "skipped").length;
  const waiting = list.filter((x) => x.status === "due").length;
  const text = `шагов выполнено ${done} из ${list.length}${skipped > 0 ? `, пропущено ${skipped}` : ""}${waiting > 0 ? `, ждут отметки ${waiting}` : ""}`;
  return { total: list.length, done, skipped, waiting, text };
}

/** Действия, которые меняют цену для покупателя: не чаще раза в сутки и по одному за раз. */
const PRICE_LIKE = new Set<string>(["price", "club_discount", "promo_join", "promo_exit"]);

export type ProgramStepRef = { index: number; step: StrategyStep & { action: PlanAction } };

/** Шаги программы по плану (все действия, которые выполняет программа) в порядке дней. */
export const programSteps = (strategy: Strategy): ProgramStepRef[] =>
  strategy.steps
    .map((step, index) => ({ index, step }))
    .filter((x): x is ProgramStepRef => x.step.by === "program" && x.step.action != null)
    .sort((a, b) => a.step.day - b.step.day || a.index - b.index);

/**
 * Какие шаги программы пора предложить владельцу. Шаг считается сделанным, когда владелец выполнил предложение (шаг записан в doneSteps).
 * Шаг предлагается, когда наступил его день; следующий шаг цены не раньше чем через сутки после предыдущего выполненного шага цены.
 */
export function dueProgramSteps(strategy: Strategy, input: { doneSteps: number[]; lastPriceDoneAtMs: number | null; acceptedAtMs: number; nowMs: number; /** Свежие значения метрик: нужны шагам с условием-триггером. */ current?: Record<string, number | null | undefined> }): ProgramStepRef[] {
  const out: ProgramStepRef[] = [];
  let priceTaken = false;
  for (const ref of programSteps(strategy)) {
    if (input.doneSteps.includes(ref.index)) continue;
    if (input.nowMs < input.acceptedAtMs + ref.step.day * DAY_MS) continue;
    if (ref.step.onlyIf && !(input.current?.[ref.step.onlyIf.metric] != null && criterionMet(input.current, ref.step.onlyIf))) continue;
    if (PRICE_LIKE.has(ref.step.action.type)) {
      // Цена меняется не чаще раза в сутки и по одному шагу за раз: следующий шаг цены ждёт, пока выполнен предыдущий.
      if (priceTaken) continue;
      if (input.lastPriceDoneAtMs != null && input.nowMs < input.lastPriceDoneAtMs + MIN_DAYS_BETWEEN_PRICE_STEPS * DAY_MS) continue;
      priceTaken = true;
    }
    out.push(ref);
  }
  return out;
}

/** Условие-триггер словами: «дней до нулевого остатка ≤ 14». */
export const describeCondition = (c: Criterion): string => `${METRIC_LABEL[c.metric]} ${c.op === "<=" ? "≤" : "≥"} ${c.value}`;

/** Короткое описание действия программы для экрана и для проверяющего ИИ. */
export function describePlanAction(a: PlanAction, campaignName?: (id: string) => string): string {
  const name = (id: string) => (campaignName ? campaignName(id) : id);
  switch (a.type) {
    case "price":
      return `цена ${a.direction === "raise" ? "+" : "−"}${a.stepPercent}%`;
    case "ads_pause":
      return `пауза рекламной кампании «${name(a.campaignId)}»`;
    case "ads_resume":
      return `запуск рекламной кампании «${name(a.campaignId)}»`;
    case "ads_bid":
      return `ставка ${a.direction === "raise" ? "+" : "−"}${a.stepPercent}% в кампании «${name(a.campaignId)}»`;
    case "ads_create_test":
      return "тестовая рекламная кампания (без запуска и без списания денег)";
    case "characteristics_edit":
      return `правка характеристик карточки (${a.changes.length})`;
    case "ads_minus_phrases":
      return `минус-фразы в кампании «${name(a.campaignId)}»: ${a.queries.length} шт.`;
    case "ads_daily_limit":
      return `дневной лимит кампании «${name(a.campaignId)}»: ${a.limitRub.toLocaleString("ru-RU")} ₽ в сутки`;
    case "ads_placements":
      return `места показа кампании «${name(a.campaignId)}»: поиск ${a.search ? "да" : "нет"}, рекомендации ${a.recommendations ? "да" : "нет"}`;
    case "promo_join":
      return `вход в акцию ${a.promoId}: цена станет ценой акции`;
    case "club_discount":
      return `скидка WB Клуба ${a.direction === "raise" ? "+" : "−"}${a.stepPercent} п.п.`;
    case "ads_remove_nm":
      return `убрать товар из рекламной кампании «${name(a.campaignId)}»`;
    case "ads_add_nm":
      return `добавить товар в рекламную кампанию «${name(a.campaignId)}»`;
    case "ads_deposit":
      return `пополнить бюджет кампании «${name(a.campaignId)}» на ${a.sumRub} ₽`;
    case "promo_exit":
      return `выход из акции ${a.promoId}: скидка продавца сбрасывается до 0%, цена для покупателя вырастет`;
    case "content_edit":
      return a.field === "title" ? "новое название карточки" : "новое описание карточки";
  }
}

export const describeCriterion = (c: Criterion): string => `${METRIC_LABEL[c.metric]} ${c.op === ">=" ? "не ниже" : "не выше"} ${c.value}`;
