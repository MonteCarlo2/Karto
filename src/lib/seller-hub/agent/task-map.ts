import type { TaskType } from "@/lib/seller-hub/task-engine/types";
import type { PlaybookId } from "./playbooks";
import type { ActionType } from "./actions";

/**
 * Что агент может сделать по каждой задаче. Задача говорит «что плохо и что рекомендуется», агент отвечает «что из этого я могу выполнить».
 * Правило из решения Эрика: агенту отдаём только то, что он реально может сделать в платформе или в WB; остальное остаётся
 * рекомендацией человеку и помечается отдельно («агент это сделать не может»).
 *
 * mode:
 *  - execute: у агента есть исполнимое действие, оно проходит проверки и выполняется после подтверждения;
 *  - assist: агент может подготовить решение (текст, план, расчёт), но записать в кабинет сам пока не может;
 *  - human: действие только у человека (закупка, упаковка, качество товара, документы).
 *  - elsewhere: этим занимается другой раздел или продукт (например, «Автоответы»).
 */
export type AgentMode = "execute" | "assist" | "human" | "elsewhere";

export type TaskAgentRule = {
  mode: AgentMode;
  /** Действия агента, которыми закрывается задача (из реестра действий). */
  actions: ActionType[];
  /** Сценарий цен, который ведёт задачу (если есть). */
  playbook?: PlaybookId;
  note: string;
};

export const TASK_AGENT_MAP: Record<TaskType, TaskAgentRule> = {
  TASK_STOCK_OUT: { mode: "execute", actions: ["pause", "remove_nm"], note: "Остаток закончился: агент останавливает рекламу товара. Поставку и закупку делает человек." },
  TASK_LOW_STOCK: { mode: "execute", actions: ["price"], playbook: "grow_no_price_war", note: "Запас короткий: цена растёт ступенями (защита наличия), чтобы растянуть остаток. Поставку делает человек." },
  TASK_EXCESS_STOCK: { mode: "execute", actions: ["price"], playbook: "clear_overstock", note: "Избыток запаса: сценарий «снять завалы»." },
  TASK_STAGNANT_CAPITAL: { mode: "execute", actions: ["price"], playbook: "clear_overstock", note: "Зависший капитал: тот же сценарий распродажи с проверкой пола цены." },
  TASK_SALES_DROP: { mode: "execute", actions: ["price"], playbook: "grow_no_price_war", note: "Падение заказов: сценарий «без ценовой войны» с подтверждённым трендом." },
  TASK_SALES_GROWTH: { mode: "execute", actions: ["price", "bid"], playbook: "raise_margin", note: "Рост спроса: осторожное повышение цены; рекламу масштабирует задача про рост рекламы." },
  TASK_CONVERSION_DROP: { mode: "assist", actions: ["price"], playbook: "grow_no_price_war", note: "Падение конверсии: агент проверяет, не цена ли причина; текст и фото карточки пока готовит человек." },
  TASK_LOW_TRAFFIC: { mode: "assist", actions: ["create_campaign"], note: "Мало просмотров: цена тут не поможет; агент может предложить тестовую рекламу, остальное (название, фото) человеку." },
  TASK_NO_SALES: { mode: "assist", actions: ["price", "create_campaign"], note: "Нет продаж: сначала диагноз (мало просмотров или не покупают), потом действие. Одним снижением цены не решается." },
  TASK_NEGATIVE_MARGIN: { mode: "execute", actions: ["price"], note: "Убыточная цена: поднять до безубыточной с запасом. Это единственная ситуация, где повышение цены предлагается как защита." },
  TASK_MARGIN_NEAR_ZERO: { mode: "execute", actions: ["price"], note: "Маржа около нуля: повышение цены в пределах шага." },
  TASK_LOW_MARGIN: { mode: "assist", actions: ["price"], note: "Низкая маржа: агент считает цену для целевой маржи, решение за человеком (влияет на продажи)." },
  TASK_MARGIN_DETERIORATION: { mode: "assist", actions: ["price"], note: "Маржа ухудшилась: агент показывает причину (тарифы, логистика, реклама) и пересчитанную цену." },
  TASK_COST_MISSING: { mode: "human", actions: [], note: "Нужна себестоимость: без неё агент не может доказать, что цена не уйдёт в убыток, и не снижает цену." },
  TASK_LOW_CONTENT_SCORE: { mode: "assist", actions: [], note: "Слабая карточка: агент может подготовить текст, фото и видео делает человек." },
  TASK_CONTENT_OPPORTUNITY: { mode: "assist", actions: [], note: "Возможность улучшить карточку: текст готовит агент, запись в карточку позже." },
  TASK_LOW_PHOTO_COUNT: { mode: "human", actions: [], note: "Фото делает человек." },
  TASK_UNANSWERED_REVIEWS: { mode: "elsewhere", actions: [], note: "Ответы на отзывы ведут «Автоответы»." },
  TASK_UNANSWERED_QUESTIONS: { mode: "elsewhere", actions: [], note: "Ответы на вопросы ведут «Автоответы»." },
  TASK_UNANSWERED_NEGATIVE_REVIEW: { mode: "elsewhere", actions: [], note: "Ответ на негатив ведут «Автоответы»; цену при негативе ведёт сценарий «сохранить конверсию»." },
  TASK_UNANSWERED_QUESTION: { mode: "elsewhere", actions: [], note: "Ответы на вопросы ведут «Автоответы»." },
  TASK_UNANSWERED_POSITIVE_REVIEWS: { mode: "elsewhere", actions: [], note: "Ответы на отзывы ведут «Автоответы»." },
  TASK_NEGATIVE_SHARE_UP: { mode: "execute", actions: ["price"], playbook: "hold_conversion_on_negative", note: "Рост негатива: временное снижение цены до очистки окна отзывов; причину устраняет человек (качество, упаковка)." },
  TASK_FEEDBACKS_ACCESS: { mode: "human", actions: [], note: "Нужны права токена." },
  TASK_PROMO_LOSS: { mode: "assist", actions: [], note: "Акция невыгодна: агент считает выход или вход, запись в акцию позже и только с подтверждением." },
  TASK_PROMO_OPPORTUNITY: { mode: "assist", actions: [], note: "Выгодная акция: агент считает цену входа, запись в акцию позже и только с подтверждением." },
  TASK_AD_NO_ORDERS: { mode: "execute", actions: ["pause", "remove_nm"], note: "Реклама без заказов: пауза или убрать товар (правило «защита от пустого расхода»)." },
  TASK_AD_DRR_OVER_MARGIN: { mode: "execute", actions: ["bid"], note: "ДРР выше маржи: снизить ставку на шаг (правило «защита по ДРР»)." },
  TASK_AD_CAMPAIGN_STOPPED: { mode: "execute", actions: ["deposit", "resume"], note: "Кампания остановилась: пополнить бюджет в пределах суточного лимита или запустить." },
  TASK_AD_NO_STOCK: { mode: "execute", actions: ["pause", "remove_nm"], note: "Реклама товара без остатка: пауза." },
  TASK_AD_EFFICIENCY_DROP: { mode: "assist", actions: ["bid", "pause"], note: "Эффективность рекламы упала: агент предлагает снизить ставку или остановить, решение по цифрам задачи." },
  TASK_AD_WEAK_CARD: { mode: "human", actions: [], note: "Реклама на слабой карточке: чинится карточка (фото, текст), а не ставка." },
  TASK_AD_SCALE_UP: { mode: "execute", actions: ["bid", "deposit"], note: "Реклама окупается: поднять ставку в пределах запаса по марже (правило «подъём ставки»)." },
  TASK_LOW_BUYOUT: { mode: "human", actions: [], note: "Низкий выкуп: причины в товаре, размере, описании; агент может показать, по каким отзывам это видно." },
  TASK_LOW_RATING: { mode: "human", actions: [], note: "Низкий рейтинг: причину устраняет человек." },
  TASK_COSTS_EAT_MARGIN: { mode: "assist", actions: ["price"], note: "Расходы съедают маржу: агент показывает долю каждой статьи и пересчитанную цену." },
  TASK_FROM_EVENT: { mode: "human", actions: [], note: "Задача, созданная человеком из уведомления." },
};

export const agentModeLabel: Record<AgentMode, string> = {
  execute: "Агент выполнит",
  assist: "Агент подготовит решение",
  human: "Только человек",
  elsewhere: "Ведёт другой раздел",
};
