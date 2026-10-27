import type { AgentProposal } from "@/lib/seller-hub/ads-agent-engine";
import { AD_BID_MAX_RAISE } from "@/lib/seller-hub/ads-bid";
import type { AdQuery } from "./ads-queries";
import type { AdCampaignInfo, ScenarioProduct } from "./scenario-run";
import { describePlanAction, type PlanAction, type ProgramStepRef } from "./strategy";

/**
 * Шаги плана, которые выполняет программа, кроме цены (цена идёт через ограничители цены): реклама. По наступившему шагу программа сама считает
 * параметры по свежим данным кабинета (ставку, состояние кампании) и выдаёт обычное предложение «Выполнить». Если шаг уже не нужен или небезопасен, возвращается причина.
 * Деньги не меняются без нажатия владельца; ставка не растёт больше чем в 3 раза за раз и не опускается ниже 1 ₽.
 */

export type StepProposalResult = { proposal: AgentProposal | null; skip: string | null };

const round2 = (v: number) => Math.round(v * 100) / 100;
const ACTIVE = 9;

function campaignOf(product: ScenarioProduct, id: string): AdCampaignInfo | null {
  return (product.ads ?? []).find((c) => c.campaignId === id) ?? null;
}

export function adsStepProposal(input: { ref: ProgramStepRef; findingId: string; nmId: string; planTitle: string; goal: string; product: ScenarioProduct; /** Запросы рекламы без заказов, если читали (для минус-фраз). */ adQueries?: AdQuery[] }): StepProposalResult {
  const { ref, findingId, nmId, product, adQueries } = input;
  const action = ref.step.action as PlanAction;
  const meta = { strategy: { findingId, stepIndex: ref.index, price: false }, source: "plan", goal: input.goal };
  const base = { id: `plan-${findingId}-${ref.index}`, rule: "playbook" as const, facts: [`План «${input.planTitle}»: ${ref.step.step}`, action.reason].filter(Boolean), meta };

  if (action.type === "ads_pause" || action.type === "ads_resume") {
    const c = campaignOf(product, action.campaignId);
    if (!c) return { proposal: null, skip: "кампании больше нет у этого товара" };
    if (action.type === "ads_pause" && c.status !== ACTIVE) return { proposal: null, skip: "кампания уже не идёт, пауза не нужна" };
    if (action.type === "ads_resume" && c.status === ACTIVE) return { proposal: null, skip: "кампания уже идёт" };
    return {
      proposal: {
        ...base,
        title: action.type === "ads_pause" ? `Поставить на паузу кампанию «${c.name}»` : `Запустить кампанию «${c.name}»`,
        effect: action.type === "ads_pause" ? "Расход по кампании прекращается; запустить снова можно в один клик." : "Кампания начнёт показы и расход; остановить можно в один клик.",
        risk: action.type === "ads_pause" ? "low" : "medium",
        action: action.type === "ads_pause" ? { type: "pause", campaignId: c.campaignId } : { type: "resume", campaignId: c.campaignId },
      },
      skip: null,
    };
  }

  if (action.type === "ads_bid") {
    const c = campaignOf(product, action.campaignId);
    if (!c) return { proposal: null, skip: "кампании больше нет у этого товара" };
    const current = c.searchRub != null && c.searchRub > 0 ? c.searchRub : c.recommendationsRub != null && c.recommendationsRub > 0 ? c.recommendationsRub : null;
    if (current == null) return { proposal: null, skip: "текущая ставка неизвестна: менять нечего" };
    const factor = 1 + (action.direction === "raise" ? 1 : -1) * (action.stepPercent / 100);
    let next = round2(current * factor);
    next = Math.max(1, Math.min(next, round2(current * AD_BID_MAX_RAISE)));
    if (next === current) return { proposal: null, skip: "ставка не изменится при этой ступени" };
    return {
      proposal: {
        ...base,
        title: `${action.direction === "raise" ? "Поднять" : "Снизить"} ставку в кампании «${c.name}»: ${current} ₽ → ${next} ₽`,
        effect: `Ставка за 1000 показов ${action.direction === "raise" ? "растёт" : "снижается"} на ${action.stepPercent}%: меняются показы и расход. Вернуть можно прежней ставкой.`,
        risk: "medium",
        action: { type: "bid", advertId: c.campaignId, nmId, bidRub: next, previousBidRub: current },
      },
      skip: null,
    };
  }

  if (action.type === "ads_create_test") {
    const name = `Тест: ${product.title}`.slice(0, 80);
    return {
      proposal: {
        ...base,
        title: `Создать тестовую рекламную кампанию для «${product.title.slice(0, 50)}»`,
        effect: "Кампания создаётся без запуска и без списания денег; запускать её или нет, решаете вы.",
        risk: "low",
        action: { type: "create_campaign", nmId, name },
      },
      skip: null,
    };
  }

  if (action.type === "ads_minus_phrases") {
    const c = campaignOf(product, action.campaignId);
    if (!c) return { proposal: null, skip: "кампании больше нет у этого товара" };
    // Минусовать можно только запросы, которые и сейчас в списке «трафик есть, заказов нет»: если данные не прочитаны или по запросу появились заказы, шага нет.
    if (!adQueries) return { proposal: null, skip: "данные по поисковым запросам не прочитаны: перепроверить запросы нельзя" };
    const stats = new Map(adQueries.filter((q) => q.campaignId === c.campaignId).map((q) => [q.query.toLowerCase(), q]));
    const ok = action.queries.filter((q) => stats.has(q.toLowerCase()));
    if (ok.length === 0) return { proposal: null, skip: "по этим запросам уже появились заказы или трафик пропал: минусовать нельзя" };
    return {
      proposal: {
        ...base,
        title: `Добавить минус-фразы (${ok.length}) в кампанию «${c.name}»`,
        facts: [...base.facts, ...ok.slice(0, 10).map((q) => { const st = stats.get(q.toLowerCase())!; return `«${q}»: ${st.views} показов, ${st.clicks} кликов, заказов 0`; })],
        effect: "Реклама перестанет показываться по этим запросам и тратить на них бюджет. Убрать фразы можно в кабинете WB.",
        risk: "low",
        action: { type: "minus_phrases", advertId: c.campaignId, nmId, queries: ok },
      },
      skip: null,
    };
  }

  if (action.type === "ads_daily_limit") {
    const c = campaignOf(product, action.campaignId);
    if (!c) return { proposal: null, skip: "кампании больше нет у этого товара" };
    if (c.paymentType && c.paymentType !== "cpc") return { proposal: null, skip: "дневной лимит есть только у кампаний с оплатой за клики" };
    const now = c.dailyLimit ?? null;
    if (now && now.limitRub === action.limitRub) return { proposal: null, skip: "такой лимит уже стоит" };
    return {
      proposal: {
        ...base,
        title: `Дневной лимит кампании «${c.name}»: ${action.limitRub.toLocaleString("ru-RU")} ₽ в сутки`,
        effect: "Расход кампании за сутки не превысит лимит. Вернуть можно прежним значением или отключить лимит.",
        risk: "low",
        action: { type: "daily_limit", campaignId: c.campaignId, enabled: true, limitRub: action.limitRub, carryOver: now?.carryOver ?? false, previous: now ? { enabled: true, limitRub: now.limitRub, carryOver: now.carryOver } : { enabled: false, limitRub: null, carryOver: false } },
      },
      skip: null,
    };
  }

  if (action.type === "ads_placements") {
    const c = campaignOf(product, action.campaignId);
    if (!c) return { proposal: null, skip: "кампании больше нет у этого товара" };
    const now = c.placements ?? null;
    if (now && now.search === action.search && now.recommendations === action.recommendations) return { proposal: null, skip: "места показа уже такие" };
    return {
      proposal: {
        ...base,
        title: `Места показа кампании «${c.name}»: поиск ${action.search ? "вкл" : "выкл"}, рекомендации ${action.recommendations ? "вкл" : "выкл"}`,
        effect: "Меняется, где показывается реклама, а значит расход и заказы. Вернуть можно прежними значениями.",
        risk: "medium",
        action: { type: "placements", advertId: c.campaignId, search: action.search, recommendations: action.recommendations, previousSearch: now?.search ?? null, previousRecommendations: now?.recommendations ?? null },
      },
      skip: null,
    };
  }

  if (action.type === "ads_remove_nm" || action.type === "ads_deposit") {
    const c = campaignOf(product, action.campaignId);
    if (!c) return { proposal: null, skip: "кампании больше нет у этого товара" };
    if (action.type === "ads_remove_nm") {
      return {
        proposal: {
          ...base,
          title: `Убрать товар из рекламной кампании «${c.name}»`,
          effect: "Товар перестаёт участвовать в кампании и тратить её бюджет. Вернуть можно, но прежняя ставка не сохранится: WB поставит стандартную.",
          risk: "low",
          action: { type: "remove_nm", campaignId: c.campaignId, nmId },
        },
        skip: null,
      };
    }
    return {
      proposal: {
        ...base,
        title: `Пополнить бюджет кампании «${c.name}» на ${action.sumRub} ₽`,
        facts: [...base.facts, c.budget != null ? `Бюджет кампании сейчас: ${Math.round(c.budget)} ₽` : ""].filter(Boolean),
        effect: "Деньги переходят со счёта продвижения в бюджет кампании и возвращаются на счёт только при её закрытии. Хватает ли денег на счёте, проверит исполнитель.",
        risk: "medium",
        action: { type: "deposit", campaignId: c.campaignId, sumRub: action.sumRub },
      },
      skip: null,
    };
  }

  if (action.type === "ads_add_nm") {
    const other = (product.adsOther ?? []).find((c) => c.campaignId === action.campaignId);
    if (!other) return { proposal: null, skip: "товар уже в этой кампании или кампании больше нет" };
    return {
      proposal: {
        ...base,
        title: `Добавить товар в рекламную кампанию «${other.name}»`,
        effect: "Товар начнёт участвовать в кампании по стандартной ставке и тратить её бюджет. Убрать можно в один клик.",
        risk: "medium",
        action: { type: "add_nm", campaignId: other.campaignId, nmId },
      },
      skip: null,
    };
  }

  if (action.type === "club_discount") {
    const current = product.clubDiscount;
    if (current == null) return { proposal: null, skip: "текущая скидка Клуба неизвестна: менять нечего" };
    const next = Math.max(0, Math.min(30, current + (action.direction === "raise" ? 1 : -1) * action.stepPercent));
    if (next === current) return { proposal: null, skip: "скидка Клуба не изменится при этой ступени" };
    if (action.direction === "raise") {
      // Рост скидки снижает цену для участников Клуба: она не должна уходить ниже безубыточной с запасом 5%.
      if (product.breakEvenPrice == null || product.base == null || product.discount == null) return { proposal: null, skip: "безубыточная цена неизвестна: повышать скидку Клуба нельзя" };
      const clubPrice = product.base * (1 - product.discount / 100) * (1 - next / 100);
      if (clubPrice < product.breakEvenPrice * 1.05) return { proposal: null, skip: `цена для участников Клуба стала бы ${Math.round(clubPrice)} ₽, ниже безубыточной с запасом (${Math.round(product.breakEvenPrice * 1.05)} ₽)` };
    }
    return {
      proposal: {
        ...base,
        meta: { ...meta, strategy: { ...meta.strategy, price: true } },
        title: `${action.direction === "raise" ? "Повысить" : "Снизить"} скидку WB Клуба: ${current}% → ${next}%`,
        effect: `Меняется цена для участников WB Клуба. Вернуть можно прежним процентом (${current}%).`,
        risk: "medium",
        action: { type: "club_discount", nmId, clubPercent: next, previousPercent: current },
      },
      skip: null,
    };
  }

  if (action.type === "promo_join") {
    const open = (product.promoOpen ?? []).find((p) => p.promoId === action.promoId);
    if (!open || open.planPrice == null) return { proposal: null, skip: "акция больше не открыта для этого товара или цена акции неизвестна" };
    if (open.cohort === "loss") return { proposal: null, skip: "в этой акции товар работал бы в убыток" };
    if (open.marginPromoPercent == null) return { proposal: null, skip: "маржа в акции неизвестна: входить нельзя" };
    if (open.marginPromoPercent < 5) return { proposal: null, skip: `маржа в акции ${open.marginPromoPercent}% ниже 5%` };
    const now = product.base != null && product.discount != null ? product.base * (1 - product.discount / 100) : null;
    return {
      proposal: {
        ...base,
        meta: { ...meta, strategy: { ...meta.strategy, price: true } },
        title: `Войти в акцию «${open.name}»: цена ${now != null ? `${Math.round(now)} ₽ → ` : ""}${Math.round(open.planPrice)} ₽`,
        facts: [...base.facts, `Маржа в акции: ${open.marginPromoPercent}%`, open.endAt ? `Акция до ${open.endAt.slice(0, 10)}` : ""].filter(Boolean),
        effect: "Вход ставит скидку продавца так, чтобы цена совпала с ценой акции: цена для покупателя снизится. Выйти можно сбросом скидки; прежнюю скидку вернёте вручную.",
        risk: "high",
        action: { type: "promo_join", promoId: open.promoId, promoName: open.name, nmId, planPrice: open.planPrice, planDiscount: open.planDiscount, basePrice: product.base, discountedPrice: now, discountPercent: product.discount },
      },
      skip: null,
    };
  }

  if (action.type === "promo_exit") {
    const promo = (product.promos ?? []).find((p) => p.promoId === action.promoId);
    if (!promo) return { proposal: null, skip: "товар уже не участвует в этой акции" };
    return {
      proposal: {
        ...base,
        title: `Убрать товар из акции «${promo.name}»`,
        facts: [...base.facts, promo.marginPromoPercent != null ? `Маржа в акции: ${promo.marginPromoPercent}%` : "", promo.planPrice != null ? `Цена в акции: ${Math.round(promo.planPrice)} ₽` : ""].filter(Boolean),
        effect: `Чтобы выйти из акции, WB-метод сбрасывает скидку продавца до 0%: цена для покупателя вырастет с ${Math.round(product.base != null && product.discount != null ? product.base * (1 - product.discount / 100) : product.base ?? 0)} ₽ примерно до ${Math.round(product.base ?? 0)} ₽. Вернуть скидку можно вручную; прежние условия акции через API не восстанавливаются.`,
        risk: "high",
        action: { type: "promo_exit", promoId: promo.promoId, promoName: promo.name, nmId },
      },
      skip: null,
    };
  }

  if (action.type === "characteristics_edit") {
    const meta2 = new Map((product.card?.categoryCharcs ?? []).map((c) => [c.id, c]));
    const filled = new Map((product.card?.characteristics ?? []).filter((c) => c.id != null).map((c) => [c.id!, c.value]));
    const changes = action.changes.flatMap((c) => {
      const m = meta2.get(c.charcId);
      if (!m) return [];
      const previous = filled.get(c.charcId) ?? null;
      if (previous != null && previous.trim().toLowerCase() === String(c.value).trim().toLowerCase()) return [];
      return [{ charcId: c.charcId, name: m.name, value: c.value, numeric: m.type === 4, previous }];
    });
    if (changes.length === 0) return { proposal: null, skip: "значения характеристик уже такие, или характеристик больше нет у категории" };
    return {
      proposal: {
        ...base,
        title: `Изменить характеристики карточки «${product.title.slice(0, 50)}» (${changes.length})`,
        facts: [...base.facts, ...changes.map((c) => `${c.name}: ${c.previous ?? "не заполнено"} → ${c.value}`)],
        effect: "Характеристики влияют на поиск и фильтры. Прежние значения сохранены: заполненные можно вернуть в один клик.",
        risk: "medium",
        action: { type: "characteristics", nmId, changes },
      },
      skip: null,
    };
  }

  if (action.type === "content_edit") {
    const previous = action.field === "title" ? product.title : (product.card?.description ?? "");
    if (!previous.trim()) return { proposal: null, skip: "текущий текст карточки неизвестен: показать «было» нечем" };
    if (previous.trim() === action.text.trim()) return { proposal: null, skip: "текст в карточке уже такой" };
    const cut = (v: string) => (v.length > 400 ? `${v.slice(0, 400)}…` : v);
    return {
      proposal: {
        ...base,
        title: `${action.field === "title" ? "Изменить название" : "Изменить описание"} карточки «${product.title.slice(0, 50)}»`,
        facts: [...base.facts, `Было: ${cut(previous)}`, `Станет: ${cut(action.text)}`],
        effect: "Текст карточки влияет на поиск и конверсию; WB может применять изменение с задержкой. Прежний текст сохранён, вернуть можно в один клик.",
        risk: "medium",
        action: { type: "content", nmId, field: action.field, text: action.text, previousText: previous },
      },
      skip: null,
    };
  }

  return { proposal: null, skip: `действие ${describePlanAction(action)} выполняется отдельно` };
}
