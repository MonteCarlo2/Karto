import { LEVERS, type LeverStatus } from "./capabilities";

/**
 * Человеческие подписи рычагов агента для раздела «Агенты». Источник правды о том, что агент умеет, остаётся реестр LEVERS (capabilities.ts):
 * здесь только короткие формулировки для владельца магазина. Рычаги, которым нужна подписка Джем, в интерфейс не попадают совсем.
 */
export const LEVER_LABEL: Record<string, string> = {
  price: "Меняет цену и скидку продавца шагом 1–3%",
  club_discount: "Меняет скидку WB Клуба на 1–3 п.п.",
  size_prices: "Цены по отдельным размерам",
  content_edit: "Пишет новое название и описание карточки",
  characteristics: "Заполняет и правит характеристики, до 5 за шаг",
  media: "Фото и видео: порядок, замена, добавление",
  tags: "Ярлыки карточек",
  card_create: "Создание новой карточки",
  category: "Смена категории: у готовой карточки она не меняется, нужна новая карточка",
  ads_bid: "Меняет ставки шагом от 5 до 20%",
  ads_pause_resume: "Ставит кампанию на паузу и запускает снова",
  ads_create_test: "Создаёт тестовую кампанию без запуска и списаний",
  ads_budget: "Пополняет бюджет кампании на 500, 1000 или 2000 ₽, добавляет и убирает товар",
  ads_queries: "Добавляет минус-фразы по запросам без заказов и меняет места показа",
  ads_daily_limit: "Ставит дневной лимит расхода (оплата за клики, от 1000 ₽)",
  ads_tuning: "Ставки по отдельным группам запросов",
  promo_exit: "Выводит товар из акции WB",
  promo_join: "Добавляет товар в акцию WB и перепроверяет маржу",
  fbs_stocks: "Остатки на вашем складе и поставки на склады WB",
  reviews: "Ответы на отзывы и вопросы (их ведут «Автоответы» KARTO)",
};

export const LEVER_STATUS_LABEL: Record<LeverStatus, string> = {
  action: "Делает сам после вашего подтверждения",
  human_api: "Пока делаете вы",
  advice: "Только подсказывает",
};

export type CapabilityGroup = { area: string; action: string[]; human: string[]; advice: string[] };

/** Возможности агента по направлениям, в порядке реестра. Без рычагов Джема. */
export function capabilityGroups(): CapabilityGroup[] {
  const groups: CapabilityGroup[] = [];
  for (const lever of LEVERS) {
    if (lever.jam) continue;
    const label = LEVER_LABEL[lever.id];
    if (!label) continue;
    let group = groups.find((g) => g.area === lever.area);
    if (!group) {
      group = { area: lever.area, action: [], human: [], advice: [] };
      groups.push(group);
    }
    (lever.status === "action" ? group.action : lever.status === "human_api" ? group.human : group.advice).push(label);
  }
  return groups;
}

/** Сколько действий агент выполняет сам (после подтверждения) по всему реестру. */
export const doableLeverCount = (): number => LEVERS.filter((l) => !l.jam && l.status === "action").length;
