/**
 * Сценарии цен с памятью («стратегии»): многошаговые наборы правил, по образцу комплексных стратегий JVO, но детерминированные.
 * Чистая функция: по сегодняшним сигналам товара и сохранённому состоянию сценария возвращает решение «что сделать с ценой и почему»
 * и новое состояние. Ничего не пишет в кабинет: цена проходит проверки (guardrails.ts), а запись идёт только после подтверждения человека.
 *
 * Числа взяты из публичных описаний стратегий JVO (docs/seller-hub/agents-jvo-deep.md, раздел B) и вынесены в параметры.
 * Где формулировка JVO неоднозначна, выбрано осторожное толкование, оно помечено «УТОЧНЕНО».
 */

export type PlaybookId = "grow_no_price_war" | "raise_margin" | "clear_overstock" | "hold_conversion_on_negative";

export type PlaybookSignals = {
  nmId: string;
  /** Цена со скидкой продавца сейчас (после скидки продавца), ₽. */
  buyerPrice: number;
  /** Дни до нулевого остатка при текущем спросе. null — посчитать нельзя. */
  oosDays: number | null;
  /** Оборачиваемость, дни запаса: остаток ÷ средний спрос за 28 дней. null — посчитать нельзя. */
  turnoverDays: number | null;
  /** Конверсия просмотра в корзину, %. null — нет данных. */
  cartPercent: number | null;
  /** Сколько просмотров карточки за окно, из которого посчитана конверсия. Мало просмотров — конверсии верить нельзя. */
  cartSample: number | null;
  /** Дней подряд заказы статистически ниже обычного (см. event-engine/smart-events). 0 — падения нет. */
  declineDays: number;
  /** Дней подряд заказы статистически выше обычного. */
  riseDays: number;
  /** В последних 10 отзывах есть оценки 1–3★. null — отзывы не прочитаны. */
  recentNegative: boolean | null;
  /** Данных достаточно, чтобы судить о тренде заказов (хватает дней истории и спроса). */
  trendKnown: boolean;
};

export type PlaybookState = {
  /** Цена со скидкой продавца до начала снижения. К ней сценарий возвращает цену при восстановлении. null — снижения не было. */
  anchorBuyer: number | null;
  /** Когда каждое «раз в N дней» правило сработало в последний раз (ISO). */
  lastStepAt: Record<string, string>;
  /** Идёт распродажа завала: она продолжается, пока оборачиваемость не опустится до цели (гистерезис). */
  overstockActive?: boolean;
  /** С какого момента в окне последних 10 отзывов нет низких оценок (ISO). Нужен для правила «два дня без негатива». */
  negativeClearSince?: string | null;
};

export const EMPTY_PLAYBOOK_STATE: PlaybookState = { anchorBuyer: null, lastStepAt: {} };

export type PlaybookParams = {
  /** Защита наличия: [дней до нуля не больше, повышение %], от самого строгого порога. */
  protect: Array<[number, number]>;
  /** Тренд падения: [минимум дней подряд, шаг % в день]. Берётся самая длинная подходящая строка. */
  trendSteps: Array<[number, number]>;
  /** Оборачиваемость выше highTurnover: снижаем на turnoverStep % каждые turnoverEveryDays дней, пока не станет не выше targetTurnover. */
  highTurnover: number;
  targetTurnover: number;
  turnoverStep: number;
  turnoverEveryDays: number;
  /** Распродажа завала (только clear_overstock): старт при запасе > start или (дни до нуля > startOos и конверсия < startCart); первый шаг больше. */
  overstock: { start: number; startOos: number; startCart: number; firstStep: number } | null;
  /** Конверсия в корзину ниже: снижение на cartLowStep %, не чаще раза в cartLowEveryDays. */
  cartLowBelow: number;
  cartLowStep: number;
  cartLowEveryDays: number;
  /** Негатив: временное снижение от опорной цены, %. 0 — правило выключено. */
  negativeCut: number;
  /** Восстановление к опорной цене. */
  recover: { step: number; minCart: number | null; maxTurnover: number; minOos: number; cleanDays: number };
  /** Повышение цены на силе (raise_margin и clear_overstock). */
  raise: { minCart: number; minOos: number; maxTurnover: number; step: number; supportStep: number; supportMinCart: number; supportRiseDays: number; everyDays: number } | null;
  /** Минимум просмотров за окно, при котором конверсия в корзину считается достоверной (иначе правила про конверсию молчат). */
  minCartSample: number;
  /** Предел общего снижения от опорной цены, %. WB отправляет в карантин цены снижение более чем на 33,3% (docs/seller-hub/agent-experience-base.md). */
  maxTotalCut: number;
  /** Максимальное суммарное снижение за один день, %. Общий предохранитель сверху есть и в guardrails. */
  dailyCap: number;
};

const BASE: PlaybookParams = {
  protect: [
    [7, 7],
    [14, 5],
  ],
  trendSteps: [
    [3, 1],
    [5, 2],
    [8, 3],
  ],
  highTurnover: 60,
  targetTurnover: 60,
  turnoverStep: 1,
  turnoverEveryDays: 3,
  overstock: null,
  cartLowBelow: 3,
  cartLowStep: 1,
  // УТОЧНЕНО: у JVO «дополнительно −1% (в пределах дневного капа)» без периодичности; чтобы не снижать цену каждый день при слабой
  // конверсии, повторяем не чаще раза в 7 дней и ждём результата прошлого шага.
  cartLowEveryDays: 7,
  negativeCut: 5,
  recover: { step: 1, minCart: 5.5, maxTurnover: 60, minOos: 14, cleanDays: 0 },
  raise: null,
  // Как в событиях воронки: при малом числе просмотров процент конверсии случаен (3 корзины из 20 просмотров — это ещё не 15%).
  minCartSample: 300,
  maxTotalCut: 20,
  dailyCap: 5,
};

export const PLAYBOOKS: Record<PlaybookId, { title: string; goal: string; params: PlaybookParams }> = {
  grow_no_price_war: {
    title: "Увеличить продажи без ценовой войны и сохранить маржу",
    goal: "Не дать товару закончиться, не топить цену при падении заказов дольше, чем нужно, и вернуть цену, когда ситуация выправилась.",
    params: BASE,
  },
  raise_margin: {
    title: "Поднять среднюю цену и маржу без потери объёма",
    goal: "Осторожно повышать цену, пока конверсия и запас это позволяют, и откатываться при первых признаках потери объёма.",
    params: {
      ...BASE,
      // У JVO в этой стратегии тренд только «3 дня падения → −1% в день», а оборачиваемость нужна лишь как условие повышения.
      trendSteps: [[3, 1]],
      highTurnover: Number.POSITIVE_INFINITY,
      raise: { minCart: 6, minOos: 21, maxTurnover: 60, step: 2, supportStep: 1, supportMinCart: 5.5, supportRiseDays: 3, everyDays: 3 },
    },
  },
  clear_overstock: {
    title: "Снять завалы и расходы на хранение, не уйти в дефицит",
    goal: "Ускорить оборачиваемость товаров с избытком запаса, не доводя до нулевого остатка, и аккуратно поднять цену, когда запас в норме.",
    params: {
      ...BASE,
      // УТОЧНЕНО: у JVO завал — запас > 90 дней или (до нуля > 45 и конверсия < 4%), затем −2% и −1% раз в 3 дня до запаса ≤ 60. Тренд и негатив — как в базе.
      overstock: { start: 90, startOos: 45, startCart: 4, firstStep: 2 },
      highTurnover: 90,
      // В описании этой стратегии нет правил про тренд падения и слабую конверсию (конверсия только запускает распродажу).
      trendSteps: [],
      cartLowBelow: 0,
      raise: { minCart: 6, minOos: 21, maxTurnover: 60, step: 0, supportStep: 1, supportMinCart: 6, supportRiseDays: 3, everyDays: 3 },
    },
  },
  hold_conversion_on_negative: {
    title: "Сохранить конверсию при волне негатива",
    goal: "Временно снизить цену при свежем негативе, не усугублять падением тренда и вернуться к прежней цене, когда окно отзывов очистилось.",
    params: {
      ...BASE,
      protect: [[14, 5]],
      trendSteps: [[3, 1]],
      // В этой стратегии «ещё одно −1% от оборачиваемости» отсутствует: она только про негатив, падение заказов и слабую конверсию.
      highTurnover: Number.POSITIVE_INFINITY,
      // Выход: два дня без негатива в зоне видимости, нет тренда вниз и запас не больше 60 дней; конверсию не требуем.
      recover: { step: 1, minCart: null, maxTurnover: 60, minOos: 0, cleanDays: 2 },
    },
  },
};

export type Reason = { rule: string; text: string };

export type PlaybookDecision = {
  playbook: PlaybookId;
  /** Итоговое изменение цены со скидкой продавца, % (отрицательное — снижение). 0 — цену не менять. */
  stepPercent: number;
  /** Сработавшие правила в порядке приоритета и причина каждого. */
  reasons: Reason[];
  /** Если цену менять не нужно или нельзя — почему (для отчёта по каждому товару). */
  holdReason: string | null;
  nextState: PlaybookState;
};

const DAY_MS = 86_400_000;
const daysSince = (iso: string | null | undefined, nowMs: number): number => {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? (nowMs - t) / DAY_MS : Number.POSITIVE_INFINITY;
};
const stockText = (days: number) => (days >= 365 ? "Запас без движения (заказов за 28 дней нет)" : `Запас на ${fmt(days)} дн.`);
const fmt = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Решение сценария на сегодня. Приоритет, как у JVO: защита наличия перекрывает всё; дальше негатив, тренд, запас и конверсия
 * складываются в пределах суточного капа; когда оснований снижать нет, цена возвращается к опорной, а у «силовых» стратегий осторожно растёт.
 * Недостаток данных (null) никогда не толкуется в пользу действия: правило без данных не срабатывает.
 */
export function evaluatePlaybook(id: PlaybookId, signals: PlaybookSignals, state: PlaybookState, nowMs: number): PlaybookDecision {
  const p = PLAYBOOKS[id].params;
  const nowIso = new Date(nowMs).toISOString();
  const next: PlaybookState = {
    anchorBuyer: state.anchorBuyer,
    lastStepAt: { ...state.lastStepAt },
    overstockActive: state.overstockActive ?? false,
    negativeClearSince: state.negativeClearSince ?? null,
  };
  const reasons: Reason[] = [];
  const decision = (stepPercent: number, holdReason: string | null): PlaybookDecision => ({ playbook: id, stepPercent, reasons, holdReason, nextState: next });

  // Память про окно отзывов: сколько времени в нём нет низких оценок.
  if (signals.recentNegative === true) next.negativeClearSince = null;
  else if (signals.recentNegative === false && !next.negativeClearSince) next.negativeClearSince = nowIso;

  // 1. Защита наличия: перекрывает всё остальное.
  if (signals.oosDays != null) {
    for (const [limit, step] of p.protect) {
      if (signals.oosDays <= limit) {
        reasons.push({ rule: "protect_stock", text: `До нулевого остатка около ${fmt(signals.oosDays)} дн. (порог ${limit}): цена +${step}%, чтобы растянуть запас` });
        return decision(step, null);
      }
    }
  }

  // 2. Давление вниз: негатив (уровень от опорной цены), тренд падения, высокая оборачиваемость, слабая конверсия.
  const anchor = state.anchorBuyer ?? signals.buyerPrice;
  const cart = signals.cartPercent != null && (signals.cartSample ?? 0) >= p.minCartSample ? signals.cartPercent : null;
  let down = 0;

  if (p.negativeCut > 0 && signals.recentNegative === true) {
    const level = anchor * (1 - p.negativeCut / 100);
    if (signals.buyerPrice > level + 0.5) {
      down += ((level - signals.buyerPrice) / signals.buyerPrice) * 100;
      reasons.push({ rule: "negative_reviews", text: `В последних 10 отзывах есть оценки 1–3★: временно держим цену на ${p.negativeCut}% ниже прежней (${fmt(level)} ₽), пока окно не очистится` });
    }
  }

  if (p.trendSteps.length > 0 && signals.trendKnown && signals.declineDays >= p.trendSteps[0]![0]) {
    let step = 0;
    for (const [days, s] of p.trendSteps) if (signals.declineDays >= days) step = s;
    down -= step;
    reasons.push({ rule: "trend_down", text: `Заказы ниже обычного ${signals.declineDays} дн. подряд (статистически подтверждено): −${step}% в день, пока падение не остановится` });
  }

  if (p.overstock) {
    const t = signals.turnoverDays;
    if (t != null) {
      if (t <= p.targetTurnover) {
        next.overstockActive = false;
      } else {
        const start = t > p.overstock.start || (signals.oosDays != null && signals.oosDays > p.overstock.startOos && cart != null && cart < p.overstock.startCart);
        const first = !state.overstockActive;
        if ((state.overstockActive || start) && (first || daysSince(state.lastStepAt.turnover, nowMs) >= p.turnoverEveryDays)) {
          const step = first ? p.overstock.firstStep : p.turnoverStep;
          down -= step;
          next.lastStepAt.turnover = nowIso;
          next.overstockActive = true;
          reasons.push({ rule: "overstock", text: first ? `Завал: ${stockText(t)} при цели не больше ${p.targetTurnover}. Первый шаг −${step}%, дальше −${p.turnoverStep}% раз в ${p.turnoverEveryDays} дня до цели` : `Распродажа завала продолжается: запас ${fmt(t)} дн., −${step}% (раз в ${p.turnoverEveryDays} дня)` });
        }
      }
    }
  } else if (signals.turnoverDays != null && signals.turnoverDays > p.highTurnover && daysSince(state.lastStepAt.turnover, nowMs) >= p.turnoverEveryDays) {
    down -= p.turnoverStep;
    next.lastStepAt.turnover = nowIso;
    reasons.push({ rule: "turnover_high", text: `${stockText(signals.turnoverDays)} при цели не больше ${p.targetTurnover}: −${p.turnoverStep}% раз в ${p.turnoverEveryDays} дня` });
  }

  if (cart != null && cart < p.cartLowBelow && daysSince(state.lastStepAt.cart, nowMs) >= p.cartLowEveryDays) {
    down -= p.cartLowStep;
    next.lastStepAt.cart = nowIso;
    reasons.push({ rule: "cart_low", text: `Конверсия в корзину ${fmt(cart)}% (по ${signals.cartSample} просмотрам) ниже ${p.cartLowBelow}%: −${p.cartLowStep}%, не чаще раза в ${p.cartLowEveryDays} дней` });
  }

  if (down < -0.0001) {
    const capped = Math.max(down, -p.dailyCap);
    if (capped !== down) reasons.push({ rule: "daily_cap", text: `Суммарное снижение ограничено ${p.dailyCap}% за день` });
    if (next.anchorBuyer == null) next.anchorBuyer = signals.buyerPrice;
    // Общий предел снижения от опорной цены: дальше цену не опускаем, чтобы не подойти к карантину WB и не топить товар.
    const floorByTotal = (next.anchorBuyer ?? signals.buyerPrice) * (1 - p.maxTotalCut / 100);
    const afterStep = signals.buyerPrice * (1 + capped / 100);
    if (afterStep < floorByTotal) {
      if (signals.buyerPrice <= floorByTotal + 0.5) {
        reasons.push({ rule: "total_cut_limit", text: `Цена уже на ${p.maxTotalCut}% ниже прежней: дальше сценарий её не снижает. Нужна другая мера (трафик, карточка, акция)` });
        return decision(0, `Достигнут предел снижения ${p.maxTotalCut}% от прежней цены`);
      }
      const limited = ((floorByTotal - signals.buyerPrice) / signals.buyerPrice) * 100;
      reasons.push({ rule: "total_cut_limit", text: `Снижение ограничено пределом ${p.maxTotalCut}% от прежней цены` });
      return decision(round2(limited), null);
    }
    return decision(round2(capped), null);
  }

  // 3. Восстановление к опорной цене, когда оснований снижать нет.
  if (state.anchorBuyer != null) {
    const gap = state.anchorBuyer - signals.buyerPrice;
    if (gap <= 0.5) {
      next.anchorBuyer = null;
      return decision(0, "Цена вернулась к прежней: сценарий в нейтральном состоянии");
    }
    const r = p.recover;
    const calm = signals.declineDays === 0 && signals.trendKnown && signals.recentNegative === false;
    const clean = r.cleanDays === 0 || daysSince(next.negativeClearSince, nowMs) >= r.cleanDays;
    const cartOk = r.minCart == null || (cart != null && cart >= r.minCart);
    const stockOk = signals.turnoverDays != null && signals.turnoverDays <= r.maxTurnover && (r.minOos === 0 || (signals.oosDays != null && signals.oosDays > r.minOos));
    if (calm && clean && cartOk && stockOk) {
      const room = (gap / signals.buyerPrice) * 100;
      const step = Math.min(r.step + (signals.riseDays >= 5 ? 1 : 0), room);
      reasons.push({ rule: "recover", text: `Падение остановилось, негатива в окне нет${r.cleanDays > 0 ? ` ${r.cleanDays} дн.` : ""}, запас в норме: возвращаем цену к прежней, +${fmt(step)}% в день` });
      return decision(round2(step), null);
    }
    return decision(0, "Цена ниже прежней, но условия возврата ещё не выполнены: ждём (нужны: нет падения заказов и негатива, конверсия и запас в норме)");
  }

  // 4. Осторожное повышение на силе (у стратегий, где оно предусмотрено).
  if (p.raise) {
    const r = p.raise;
    if (signals.recentNegative === true) return decision(0, "Свежий негатив в отзывах: повышения приостановлены");
    const stable = signals.trendKnown && signals.declineDays === 0;
    const stockOk = signals.turnoverDays != null && signals.turnoverDays <= r.maxTurnover && signals.oosDays != null && signals.oosDays > r.minOos;
    const due = daysSince(state.lastStepAt.raise, nowMs) >= r.everyDays;
    if (r.step > 0 && cart != null && cart > r.minCart && stable && stockOk && due) {
      next.lastStepAt.raise = nowIso;
      reasons.push({ rule: "raise", text: `Конверсия в корзину ${fmt(cart)}% выше ${r.minCart}%, падения заказов нет, запас в норме: +${r.step}%` });
      return decision(r.step, null);
    }
    if (signals.riseDays >= r.supportRiseDays && cart != null && cart >= r.supportMinCart && stable && stockOk && due) {
      next.lastStepAt.raise = nowIso;
      reasons.push({ rule: "raise_support", text: `Заказы растут ${signals.riseDays} дн. подряд, конверсия ${fmt(cart)}%: +${r.supportStep}% раз в ${r.everyDays} дня` });
      return decision(r.supportStep, null);
    }
    return decision(0, "Условий для повышения цены нет");
  }

  return decision(0, "Оснований менять цену нет");
}
