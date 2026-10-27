import type { AgentAction } from "@/lib/seller-hub/ads-agent-engine";

/**
 * Реестр действий агента. Для каждого действия в одном месте записано: насколько оно рискованно, можно ли его вернуть,
 * что проверить после записи и можно ли когда-нибудь разрешить его без подтверждения человека.
 * Нужен, чтобы новые функции агента добавлялись по одному правилу и ни одно действие не попало в кабинет без описания «как вернуть».
 */

export type ActionType = AgentAction["type"];
export type ActionRisk = "low" | "medium" | "high";
/** full — вернуть можно полностью; partial — часть теряется; none — вернуть нельзя. */
export type Reversibility = "full" | "partial" | "none";

export type ActionSpec = {
  label: string;
  risk: ActionRisk;
  reversibility: Reversibility;
  /** Что перечитать из WB после записи и с чем сравнить: без этого действие нельзя считать выполненным. */
  verify: string;
  /** Нужна ли перед записью сверка «в кабинете осталось то, что человек видел» (защита от затирания чужой правки). */
  needsFreshnessCheck: boolean;
  /**
   * Можно ли это действие когда-либо выполнять без подтверждения (автопилот). false — только с подтверждением человека, всегда.
   * true не включает автопилот: он включается только отдельным правилом владельца с лимитами.
   */
  autoEligible: boolean;
  /** Пояснение человеку, чем рискуем и как вернуть. */
  note: string;
};

export const ACTION_SPECS: Record<ActionType, ActionSpec> = {
  price: {
    label: "Изменить цену",
    risk: "high",
    reversibility: "full",
    verify: "Прочитать цену и скидку товара из WB и сравнить с отправленными",
    needsFreshnessCheck: true,
    autoEligible: false,
    note: "Цену видят все покупатели. Вернуть можно прежним значением, но заказы за время действия новой цены останутся по ней.",
  },
  bid: {
    label: "Изменить ставку",
    risk: "medium",
    reversibility: "full",
    verify: "Прочитать ставку товара в кампании и сравнить с отправленной",
    needsFreshnessCheck: false,
    autoEligible: false,
    note: "Меняет число показов и расход. Вернуть можно прежней ставкой.",
  },
  pause: {
    label: "Поставить кампанию на паузу",
    risk: "low",
    reversibility: "full",
    verify: "Прочитать статус кампании: должна быть на паузе",
    needsFreshnessCheck: false,
    autoEligible: true,
    note: "Расход прекращается. Запустить снова можно в один клик.",
  },
  resume: {
    label: "Запустить кампанию",
    risk: "medium",
    reversibility: "full",
    verify: "Прочитать статус кампании: должны идти показы",
    needsFreshnessCheck: false,
    autoEligible: false,
    note: "Возобновляет расход бюджета. Остановить можно в один клик.",
  },
  remove_nm: {
    label: "Убрать товар из кампании",
    risk: "low",
    reversibility: "partial",
    verify: "Прочитать состав кампании: товара быть не должно",
    needsFreshnessCheck: false,
    autoEligible: true,
    note: "Товар можно вернуть, но его прежняя ставка в кампании не сохранится.",
  },
  add_nm: {
    label: "Вернуть товар в кампанию",
    risk: "medium",
    reversibility: "full",
    verify: "Прочитать состав кампании: товар должен быть",
    needsFreshnessCheck: false,
    autoEligible: false,
    note: "Товар снова начнёт тратить бюджет кампании.",
  },
  deposit: {
    label: "Пополнить бюджет кампании",
    risk: "medium",
    reversibility: "none",
    verify: "Прочитать бюджет кампании: должен вырасти на сумму пополнения",
    needsFreshnessCheck: false,
    autoEligible: true,
    note: "Деньги переходят в бюджет кампании и возвращаются на счёт только при её закрытии. Защита: суточный лимит правила и подтверждение.",
  },
  promo_join: {
    label: "Войти в акцию WB (скидка продавца под цену акции)",
    risk: "high",
    reversibility: "partial",
    verify: "Прочитать участников акции и цену товара: товар в акции, цена равна цене акции",
    needsFreshnessCheck: true,
    autoEligible: false,
    note: "Вход в акцию ставит скидку продавца так, чтобы цена совпала с ценой акции: цена для покупателя снизится. Выйти можно сбросом скидки; прежнюю скидку придётся вернуть вручную.",
  },
  club_discount: {
    label: "Изменить скидку WB Клуба",
    risk: "medium",
    reversibility: "full",
    verify: "Прочитать скидку Клуба товара и сравнить с отправленной",
    needsFreshnessCheck: false,
    autoEligible: false,
    note: "Скидка Клуба меняет цену для покупателей-участников Клуба. Вернуть можно прежним процентом.",
  },
  minus_phrases: {
    label: "Добавить минус-фразы в кампанию",
    risk: "low",
    reversibility: "partial",
    verify: "Прочитать список минус-фраз кампании по товару: добавленные фразы должны быть в нём",
    needsFreshnessCheck: false,
    autoEligible: true,
    note: "Реклама перестаёт показываться по этим запросам и не тратит на них бюджет. Убрать фразы можно в кабинете WB.",
  },
  daily_limit: {
    label: "Задать дневной лимит кампании",
    risk: "low",
    reversibility: "full",
    verify: "Прочитать лимит кампании и сравнить с отправленным",
    needsFreshnessCheck: false,
    autoEligible: false,
    note: "Ограничивает расход кампании в сутки (только оплата за клики, от 1000 ₽). Вернуть можно прежним значением или отключить лимит.",
  },
  placements: {
    label: "Изменить места показа рекламы",
    risk: "medium",
    reversibility: "full",
    verify: "Прочитать места показа кампании и сравнить с отправленными",
    needsFreshnessCheck: false,
    autoEligible: false,
    note: "Меняет, где показывается реклама (поиск, рекомендации), а значит расход и заказы. Вернуть можно прежними значениями.",
  },
  characteristics: {
    label: "Изменить характеристики карточки",
    risk: "medium",
    reversibility: "partial",
    verify: "Прочитать карточку из WB и сравнить значения характеристик с отправленными",
    needsFreshnessCheck: true,
    autoEligible: false,
    note: "Характеристики влияют на поиск и фильтры. Прежние значения сохранены, вернуть можно в один клик, если характеристика была заполнена; пустую характеристику после заполнения очистить через API нельзя.",
  },
  promo_exit: {
    label: "Убрать товар из акции (сброс скидки продавца)",
    risk: "high",
    reversibility: "partial",
    verify: "Прочитать участников акции: товара быть не должно",
    needsFreshnessCheck: false,
    autoEligible: false,
    note: "Выход из акции делается сбросом скидки продавца до 0%, цена для покупателя заметно растёт. Вернуть скидку и вход в акцию можно вручную, пока акция идёт; прежние условия участия через API не восстанавливаются.",
  },
  content: {
    label: "Изменить название или описание карточки",
    risk: "medium",
    reversibility: "full",
    verify: "Прочитать карточку из WB и сравнить название или описание с отправленным текстом",
    needsFreshnessCheck: true,
    autoEligible: false,
    note: "Текст карточки влияет на поиск и конверсию. Прежний текст сохранён, вернуть можно в один клик; изменения в WB могут применяться с задержкой.",
  },
  create_campaign: {
    label: "Создать тестовую кампанию",
    risk: "low",
    reversibility: "none",
    verify: "Прочитать список кампаний: новая должна быть в статусе «готова к запуску»",
    needsFreshnessCheck: false,
    autoEligible: false,
    note: "Кампания создаётся без бюджета и показов; деньги не списываются, пока человек её не запустит.",
  },
};

export const actionSpec = (action: AgentAction): ActionSpec => ACTION_SPECS[action.type];

/** Что было до действия, если этого нет в самом действии. */
export type ActionBefore = { campaignWasActive?: boolean };

/**
 * Действие, которое возвращает кабинет как было. null — вернуть нельзя (или не хватает данных, откуда прежнее значение):
 * в этом случае человеку честно показывается «вернуть нельзя» ещё до подтверждения.
 */
export function revertAction(action: AgentAction): AgentAction | null {
  switch (action.type) {
    case "pause":
      return { type: "resume", campaignId: action.campaignId };
    case "resume":
      return { type: "pause", campaignId: action.campaignId };
    case "remove_nm":
      return { type: "add_nm", campaignId: action.campaignId, nmId: action.nmId };
    case "add_nm":
      return { type: "remove_nm", campaignId: action.campaignId, nmId: action.nmId };
    case "bid":
      return action.previousBidRub != null && action.previousBidRub > 0 ? { type: "bid", advertId: action.advertId, nmId: action.nmId, bidRub: action.previousBidRub, previousBidRub: action.bidRub } : null;
    case "price":
      return action.currentBaseRub != null && action.currentBaseRub > 0
        ? { type: "price", nmId: action.nmId, targetRub: action.currentRub, baseRub: action.currentBaseRub, discount: action.discount, currentRub: action.targetRub, currentBaseRub: action.baseRub }
        : null;
    case "characteristics":
      return action.changes.every((c) => c.previous != null) ? { type: "characteristics", nmId: action.nmId, changes: action.changes.map((c) => ({ charcId: c.charcId, name: c.name, value: c.numeric ? Number(c.previous) : (c.previous as string), numeric: c.numeric, previous: String(c.value) })) } : null;
    case "placements":
      return action.previousSearch != null && action.previousRecommendations != null ? { type: "placements", advertId: action.advertId, search: action.previousSearch, recommendations: action.previousRecommendations, previousSearch: action.search, previousRecommendations: action.recommendations } : null;
    case "daily_limit":
      return action.previous ? { type: "daily_limit", campaignId: action.campaignId, enabled: action.previous.enabled, limitRub: action.previous.limitRub ?? action.limitRub, carryOver: action.previous.carryOver, previous: { enabled: action.enabled, limitRub: action.limitRub, carryOver: action.carryOver } } : null;
    case "minus_phrases":
      return null;
    case "club_discount":
      return action.previousPercent != null ? { type: "club_discount", nmId: action.nmId, clubPercent: action.previousPercent, previousPercent: action.clubPercent } : null;
    case "promo_join":
    case "promo_exit":
      return null;
    case "content":
      return action.previousText.trim() ? { type: "content", nmId: action.nmId, field: action.field, text: action.previousText, previousText: action.text } : null;
    case "deposit":
    case "create_campaign":
      return null;
  }
}

/** Можно ли человеку показать «вернуть» для этого конкретного действия (с учётом того, есть ли данные для отката). */
export function canRevert(action: AgentAction): boolean {
  return actionSpec(action).reversibility !== "none" && revertAction(action) !== null;
}

/** Предупреждение, которое показывается рядом с кнопкой «Выполнить», если откат невозможен. */
export function irreversibleWarning(action: AgentAction): string | null {
  const spec = actionSpec(action);
  if (spec.reversibility === "none") return `Вернуть это действие нельзя: ${spec.note}`;
  if (revertAction(action) === null) return "Не хватает данных, чтобы вернуть это действие автоматически: прежнее значение неизвестно.";
  return null;
}
