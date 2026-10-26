import { evidenceText } from "@/components/seller-hub/hub-task-present";
import { isActionableTask } from "@/lib/seller-hub/task-engine/lifecycle";
import { sortByPriority } from "@/lib/seller-hub/task-engine/priority";
import type { SellerTask, TaskActionType, TaskEvidence, TaskType } from "@/lib/seller-hub/task-engine/types";

const MAX_TOP_ACTIONS = 5;

export type TopAction = {
  id: string;
  primary: SellerTask;
  supporting: SellerTask[];
  title: string;
  why: string;
  proofs: string[];
  supportNote: string | null;
  effect: string;
  actionType: TaskActionType;
};

function groupKey(task: SellerTask): string {
  if (task.nmId) return `nm:${task.nmId}`;
  if (task.itemId) return `item:${task.itemId}`;
  return `store:${task.id}`;
}

function productName(task: SellerTask): string | null {
  if (!task.nmId && !task.itemId) return null;
  const title = task.productTitle?.trim();
  if (title) return title;
  const vendor = task.vendorCode?.trim();
  if (vendor) return vendor;
  return task.nmId ? `nm ${task.nmId}` : null;
}

function withProduct(action: string, task: SellerTask): string {
  const name = productName(task);
  return name ? `${action} — ${name}` : action;
}

function actionTitle(task: SellerTask): string {
  switch (task.type) {
    case "TASK_STOCK_OUT":
      return withProduct("Вернуть в наличие", task);
    case "TASK_LOW_STOCK":
      return withProduct("Пополнить запас", task);
    case "TASK_EXCESS_STOCK":
      return withProduct("Снизить избыток", task);
    case "TASK_STAGNANT_CAPITAL":
      return withProduct("Проверить зависшую закупку", task);
    case "TASK_SALES_DROP":
      return withProduct("Разобраться с падением продаж", task);
    case "TASK_CONVERSION_DROP":
      return withProduct("Проверить конверсию карточки", task);
    case "TASK_LOW_TRAFFIC":
      return withProduct("Проверить видимость карточки", task);
    case "TASK_SALES_GROWTH":
      return withProduct("Сверить рост продаж с запасом", task);
    case "TASK_NO_SALES":
      return withProduct("Разобраться с продажами", task);
    case "TASK_NEGATIVE_MARGIN":
      return withProduct("Проверить минус на 1 продаже", task);
    case "TASK_MARGIN_NEAR_ZERO":
      return withProduct("Проверить маржу около нуля", task);
    case "TASK_LOW_MARGIN":
      return withProduct("Проверить маржу", task);
    case "TASK_MARGIN_DETERIORATION":
      return withProduct("Проверить снижение маржи", task);
    case "TASK_COST_MISSING":
      return "Ввести себестоимость";
    case "TASK_LOW_CONTENT_SCORE":
      return withProduct("Улучшить карточку", task);
    case "TASK_CONTENT_OPPORTUNITY":
      return withProduct("Усилить карточку", task);
    case "TASK_LOW_PHOTO_COUNT":
      return withProduct("Добавить фото", task);
    case "TASK_UNANSWERED_REVIEWS":
    case "TASK_UNANSWERED_POSITIVE_REVIEWS":
    case "TASK_UNANSWERED_NEGATIVE_REVIEW":
    case "TASK_NEGATIVE_SHARE_UP":
    case "TASK_FEEDBACKS_ACCESS":
      return task.type === "TASK_UNANSWERED_NEGATIVE_REVIEW" || task.type === "TASK_NEGATIVE_SHARE_UP"
        ? withProduct("Ответить на отзывы", task)
        : "Ответить на отзывы";
    case "TASK_UNANSWERED_QUESTIONS":
    case "TASK_UNANSWERED_QUESTION":
      return task.type === "TASK_UNANSWERED_QUESTION" ? withProduct("Ответить на вопросы", task) : "Ответить на вопросы";
    case "TASK_PROMO_LOSS":
      return withProduct("Убрать из акции", task);
    case "TASK_PROMO_OPPORTUNITY":
      return withProduct("Решить про акцию", task);
    case "TASK_AD_NO_ORDERS":
      return withProduct("Остановить рекламу без заказов", task);
    case "TASK_AD_DRR_OVER_MARGIN":
      return withProduct("Снизить расход на рекламу", task);
    case "TASK_AD_CAMPAIGN_STOPPED":
      return withProduct("Вернуть рекламу в работу", task);
    case "TASK_AD_NO_STOCK":
      return withProduct("Остановить рекламу без остатка", task);
    case "TASK_AD_EFFICIENCY_DROP":
      return withProduct("Разобраться, почему реклама подорожала", task);
    case "TASK_AD_WEAK_CARD":
      return withProduct("Усилить карточку под рекламой", task);
    case "TASK_AD_SCALE_UP":
      return withProduct("Увеличить выгодную рекламу", task);
    case "TASK_LOW_BUYOUT":
      return withProduct("Разобраться с низким выкупом", task);
    case "TASK_LOW_RATING":
      return withProduct("Поднять оценку отзывов", task);
    case "TASK_COSTS_EAT_MARGIN":
      return withProduct("Снизить логистику и хранение", task);
    case "TASK_FROM_EVENT":
      return withProduct("Разобраться с уведомлением", task);
    default: {
      const unexpected: never = task.type;
      return unexpected;
    }
  }
}

function whyNow(task: SellerTask): string {
  const whyImportant =
    typeof task.evidence.why_important === "string" ? task.evidence.why_important : null;
  if (whyImportant) return whyImportant;
  switch (task.type) {
    case "TASK_STOCK_OUT":
      return "Остаток стал нулевым.";
    case "TASK_LOW_STOCK":
      return "Запас короткий относительно текущего темпа продаж.";
    case "TASK_EXCESS_STOCK":
      return "Запас значительно выше текущего темпа продаж.";
    case "TASK_STAGNANT_CAPITAL":
      return "В запасе лежит закупка сверх текущего темпа продаж.";
    case "TASK_SALES_DROP":
      return "Продажи за последние 28 дней ниже предыдущих 28 дней.";
    case "TASK_CONVERSION_DROP": {
      const open = evidenceNumber(task.evidence, "open_count");
      const priorOpen = evidenceNumber(task.evidence, "prior_open_count");
      if (open != null && priorOpen != null && priorOpen > 0 && (open - priorOpen) / priorOpen > 0.05) {
        return "Переходов стало больше, но в корзину и заказ они конвертируются хуже.";
      }
      return "Заказы упали при стабильных переходах — просела конверсия карточки.";
    }
    case "TASK_LOW_TRAFFIC":
      return "Заказы упали вместе с переходами — карточку стали реже открывать.";
    case "TASK_SALES_GROWTH":
      return "Продажи выросли относительно прошлых 28 дней.";
    case "TASK_NO_SALES":
      return "За 28 дней продаж не было, а остаток есть.";
    case "TASK_NEGATIVE_MARGIN":
      return "После списаний WB и закупки с 1 продажи остаётся минус.";
    case "TASK_MARGIN_NEAR_ZERO":
      return "Маржа около нуля: убыток меньше шума логистики возвратов.";
    case "TASK_LOW_MARGIN":
      return "Маржа ниже заданного порога.";
    case "TASK_MARGIN_DETERIORATION":
      return "Маржа к прошлому снимку стала хуже. Одно число причину не доказывает.";
    case "TASK_COST_MISSING":
      return "Без себестоимости маржа не считается.";
    case "TASK_LOW_CONTENT_SCORE":
      return "Карточка набрана слабее порога контента.";
    case "TASK_CONTENT_OPPORTUNITY":
      return "По товару уже есть продажи, карточку можно усилить. Рост от правки не обещается.";
    case "TASK_LOW_PHOTO_COUNT":
      return "В карточке меньше фото, чем нужно для полного балла.";
    case "TASK_UNANSWERED_REVIEWS":
    case "TASK_UNANSWERED_POSITIVE_REVIEWS":
      return "Есть отзывы покупателей без ответа.";
    case "TASK_UNANSWERED_NEGATIVE_REVIEW":
      return "Негативный отзыв без ответа дольше суток.";
    case "TASK_UNANSWERED_QUESTIONS":
    case "TASK_UNANSWERED_QUESTION":
      return "Есть вопросы покупателей без ответа.";
    case "TASK_NEGATIVE_SHARE_UP":
      return "Доля негативных отзывов выросла к прошлому периоду.";
    case "TASK_FEEDBACKS_ACCESS":
      return "В токене нет доступа к отзывам и вопросам.";
    case "TASK_PROMO_LOSS":
      return "Цена акции после списаний WB ниже себестоимости: каждая продажа в акции убыточна.";
    case "TASK_PROMO_OPPORTUNITY":
      return "Цена входа в акцию даёт плюс на каждой штуке, товар в наличии.";
    case "TASK_AD_NO_ORDERS":
      return "Расход на рекламу товара больше маржи с одной продажи, а заказов по рекламе нет.";
    case "TASK_AD_DRR_OVER_MARGIN":
      return "Доля расходов на рекламу выше маржи: прибыль с рекламных заказов не покрывает рекламу.";
    case "TASK_AD_CAMPAIGN_STOPPED":
      return "Кампания приносила заказы с ДРР ниже маржи, но остановилась или упёрлась в ограничение.";
    case "TASK_AD_NO_STOCK":
      return "Товар в активной рекламной кампании, а остаток нулевой.";
    case "TASK_AD_EFFICIENCY_DROP":
      return "Заказ по рекламе стал дороже, чем на прошлой неделе, и это не случайность.";
    case "TASK_AD_WEAK_CARD":
      return "Под рекламой карточка кликается или покупается заметно хуже ваших других товаров.";
    case "TASK_AD_SCALE_UP":
      return "Реклама окупается с большим запасом, товара хватает.";
    case "TASK_LOW_BUYOUT":
      return "Выкуп товара значимо ниже среднего по вашему магазину.";
    case "TASK_LOW_RATING":
      return "Оценка отзывов ниже ориентира или ниже ваших остальных товаров.";
    case "TASK_COSTS_EAT_MARGIN":
      return "Логистика и хранение забирают половину и более прибыли с продажи.";
    case "TASK_FROM_EVENT":
      return "Создана вами из уведомления в разделе «События».";
    default: {
      const unexpected: never = task.type;
      return unexpected;
    }
  }
}

function supportLabel(type: TaskType): string {
  switch (type) {
    case "TASK_STOCK_OUT":
      return "товар закончился";
    case "TASK_LOW_STOCK":
      return "короткий запас";
    case "TASK_EXCESS_STOCK":
      return "избыток запаса";
    case "TASK_STAGNANT_CAPITAL":
      return "зависшая закупка";
    case "TASK_SALES_DROP":
      return "падение продаж";
    case "TASK_CONVERSION_DROP":
      return "падение конверсии";
    case "TASK_LOW_TRAFFIC":
      return "мало переходов";
    case "TASK_SALES_GROWTH":
      return "рост продаж";
    case "TASK_NO_SALES":
      return "нет продаж";
    case "TASK_NEGATIVE_MARGIN":
      return "минус на 1 продаже";
    case "TASK_MARGIN_NEAR_ZERO":
      return "маржа около нуля";
    case "TASK_LOW_MARGIN":
      return "низкая маржа";
    case "TASK_MARGIN_DETERIORATION":
      return "маржа стала хуже";
    case "TASK_COST_MISSING":
      return "нет себестоимости";
    case "TASK_LOW_CONTENT_SCORE":
      return "слабый контент";
    case "TASK_CONTENT_OPPORTUNITY":
      return "карточку можно усилить";
    case "TASK_LOW_PHOTO_COUNT":
      return "мало фото";
    case "TASK_UNANSWERED_REVIEWS":
    case "TASK_UNANSWERED_POSITIVE_REVIEWS":
    case "TASK_UNANSWERED_NEGATIVE_REVIEW":
      return "отзывы без ответа";
    case "TASK_UNANSWERED_QUESTIONS":
    case "TASK_UNANSWERED_QUESTION":
      return "вопросы без ответа";
    case "TASK_NEGATIVE_SHARE_UP":
      return "рост негатива";
    case "TASK_FEEDBACKS_ACCESS":
      return "нет доступа к отзывам";
    case "TASK_PROMO_LOSS":
      return "акция в минус";
    case "TASK_PROMO_OPPORTUNITY":
      return "можно в акцию";
    case "TASK_AD_NO_ORDERS":
      return "реклама без заказов";
    case "TASK_AD_DRR_OVER_MARGIN":
      return "ДРР выше маржи";
    case "TASK_AD_CAMPAIGN_STOPPED":
      return "реклама остановилась";
    case "TASK_AD_NO_STOCK":
      return "реклама без остатка";
    case "TASK_AD_EFFICIENCY_DROP":
      return "реклама дорожает";
    case "TASK_AD_WEAK_CARD":
      return "слабая карточка под рекламой";
    case "TASK_AD_SCALE_UP":
      return "рекламу можно увеличить";
    case "TASK_LOW_BUYOUT":
      return "низкий выкуп";
    case "TASK_LOW_RATING":
      return "низкая оценка";
    case "TASK_COSTS_EAT_MARGIN":
      return "логистика съедает маржу";
    case "TASK_FROM_EVENT":
      return "из уведомления";
    default: {
      const unexpected: never = type;
      return unexpected;
    }
  }
}

const PROOF_KEYS: Record<TaskType, readonly string[]> = {
  TASK_FROM_EVENT: [],
  TASK_STOCK_OUT: ["stock", "sales_28d"],
  TASK_LOW_STOCK: ["stock", "cover_days", "replenish_units"],
  TASK_EXCESS_STOCK: ["stock", "cover_days", "sitting_rub"],
  TASK_STAGNANT_CAPITAL: ["sitting_rub", "stock", "cover_days"],
  TASK_SALES_DROP: ["sales_delta_units", "change_percent", "current_sales_28d"],
  TASK_CONVERSION_DROP: ["sales_delta_units", "open_count", "change_percent"],
  TASK_LOW_TRAFFIC: ["open_count", "sales_delta_units", "change_percent"],
  TASK_SALES_GROWTH: ["sales_delta_units", "change_percent", "cover_days"],
  TASK_NO_SALES: ["sales_28d", "stock", "sitting_rub"],
  TASK_NEGATIVE_MARGIN: ["margin_rub", "margin_percent", "price"],
  TASK_MARGIN_NEAR_ZERO: ["margin_percent", "price"],
  TASK_LOW_MARGIN: ["margin_percent", "margin_rub", "price"],
  TASK_MARGIN_DETERIORATION: ["margin_drop_points", "margin_percent", "previous_margin_percent"],
  TASK_COST_MISSING: ["missing_count", "missing_revenue_share_percent"],
  TASK_LOW_CONTENT_SCORE: ["content_score"],
  TASK_CONTENT_OPPORTUNITY: ["content_score", "sales_28d"],
  TASK_LOW_PHOTO_COUNT: ["photo_count"],
  TASK_UNANSWERED_REVIEWS: ["unanswered_feedbacks"],
  TASK_UNANSWERED_QUESTIONS: ["unanswered_questions"],
  TASK_UNANSWERED_NEGATIVE_REVIEW: ["count"],
  TASK_UNANSWERED_QUESTION: ["count"],
  TASK_UNANSWERED_POSITIVE_REVIEWS: ["unanswered_positive"],
  TASK_NEGATIVE_SHARE_UP: ["window_neg", "window_n"],
  TASK_FEEDBACKS_ACCESS: ["feedbacks_status"],
  TASK_PROMO_LOSS: ["promo_name", "plan_price", "promo_margin_rub"],
  TASK_PROMO_OPPORTUNITY: ["promo_name", "plan_price", "promo_margin_rub"],
  TASK_AD_NO_ORDERS: ["ad_spend", "margin_rub"],
  TASK_AD_DRR_OVER_MARGIN: ["drr_percent", "margin_percent", "ad_spend"],
  TASK_AD_CAMPAIGN_STOPPED: ["drr_percent", "margin_percent", "stock"],
  TASK_AD_NO_STOCK: ["stock", "ad_spend"],
  TASK_AD_EFFICIENCY_DROP: ["cpo_change_percent", "drr_percent", "ad_spend"],
  TASK_AD_WEAK_CARD: ["ctr_percent", "cr_percent", "ad_spend"],
  TASK_AD_SCALE_UP: ["drr_percent", "margin_percent", "cover_days"],
  TASK_LOW_BUYOUT: ["buyout_percent", "shop_buyout_percent", "past_orders"],
  TASK_LOW_RATING: ["rating_avg", "rating_count", "store_rating_avg"],
  TASK_COSTS_EAT_MARGIN: ["costs_share_percent", "logistics_per_unit", "margin_rub"],
};

function proofPhrase(key: string, evidence: TaskEvidence): string | null {
  const raw = evidence[key];
  if (key === "sitting_rub" && !(typeof raw === "number" && raw > 0)) return null;
  const formatted = evidenceText(evidence, key);
  if (!formatted) return null;
  if ((key === "sales_28d" || key === "current_sales_28d") && raw === 0) return "Нет продаж за 28 дней";
  switch (key) {
    case "stock":
      return `${formatted} на остатке`;
    case "sitting_rub":
      return `${formatted} зависшего капитала`;
    case "cover_days":
      return `Запас ${formatted}`;
    case "replenish_units":
      return `Не хватает ${formatted}`;
    case "sales_28d":
    case "current_sales_28d":
      return `Продажи за 28 дней: ${formatted}`;
    case "sales_delta_units":
      return `Изменение продаж: ${formatted}`;
    case "open_count":
      return `Переходы: ${formatted}`;
    case "change_percent":
      return `Изменение: ${formatted}`;
    case "margin_rub":
      return `Маржа ${formatted}`;
    case "margin_percent":
      return `Маржа ${formatted}`;
    case "previous_margin_percent":
      return `Прошлая маржа ${formatted}`;
    case "margin_drop_points":
      return `Падение маржи ${formatted}`;
    case "price":
      return `Цена ${formatted}`;
    case "content_score":
      return `Контент ${formatted}`;
    case "photo_count":
      return `Фото: ${formatted}`;
    case "ad_spend":
      return `Расход на рекламу ${formatted}`;
    case "buyout_percent":
      return `Выкуп ${formatted}`;
    case "shop_buyout_percent":
      return `В среднем по магазину ${formatted}`;
    case "past_orders":
      return `Заказов в периоде: ${formatted}`;
    case "rating_avg":
      return `Оценка ${formatted}`;
    case "rating_count":
      return `Отзывов за 180 дн.: ${formatted}`;
    case "store_rating_avg":
      return `В среднем по магазину ${formatted}`;
    case "costs_share_percent":
      return `Забирают ${formatted} прибыли`;
    case "logistics_per_unit":
      return `Логистика ${formatted} на штуку`;
    case "drr_percent":
      return `ДРР ${formatted}`;
    case "cpo_change_percent":
      return `Цена рекламного заказа ${formatted}`;
    case "ctr_percent":
      return `Кликают ${formatted} показов`;
    case "cr_percent":
      return `Заказов на 100 кликов: ${formatted}`;
    case "unanswered_feedbacks":
      return `Отзывы без ответа: ${formatted}`;
    case "unanswered_questions":
      return `Вопросы без ответа: ${formatted}`;
    default:
      return formatted;
  }
}

function proofsFor(task: SellerTask): string[] {
  const lines: string[] = [];
  for (const key of PROOF_KEYS[task.type]) {
    const line = proofPhrase(key, task.evidence);
    if (!line) continue;
    lines.push(line);
    if (lines.length === 3) break;
  }
  return lines;
}

function evidenceNumber(evidence: TaskEvidence, key: string): number | null {
  const value = evidence[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Текст «Эффект» по типу основной задачи. Сумму и причину не выводит, если их нет в evidence. */
export function topActionEffect(task: Pick<SellerTask, "type" | "evidence">): string {
  const evidence = task.evidence;
  switch (task.type) {
    case "TASK_NO_SALES": {
      const stock = evidenceNumber(evidence, "stock");
      const sitting = evidenceNumber(evidence, "sitting_rub");
      const sales = evidenceNumber(evidence, "sales_28d");
      const noSales = sales == null || sales === 0;
      if (noSales && stock != null && stock > 0 && sitting != null && sitting > 0) {
        return "Товар занимает капитал, но за последние 28 дней не принёс продаж.";
      }
      if (noSales && stock != null && stock > 0) {
        return "Товар остаётся в запасе без продаж за последние 28 дней.";
      }
      return "За последние 28 дней продаж не было.";
    }
    case "TASK_EXCESS_STOCK": {
      const cover = evidenceNumber(evidence, "cover_days");
      if (cover != null && cover >= 365) {
        return "При текущем темпе продаж запас значительно превышает потребность.";
      }
      return "Текущий объём запаса значительно превышает потребность при текущем темпе продаж.";
    }
    case "TASK_LOW_STOCK":
      return "Текущего запаса может не хватить на ближайший период продаж.";
    case "TASK_STOCK_OUT":
      return "Продажи товара сейчас ограничены отсутствием остатка.";
    case "TASK_SALES_DROP":
      return "Продажи товара снизились относительно предыдущего периода.";
    case "TASK_CONVERSION_DROP":
      return "При тех же переходах в корзину или заказ стали класть реже.";
    case "TASK_LOW_TRAFFIC":
      return "Переходов в карточку стало меньше, конверсия почти не изменилась.";
    case "TASK_SALES_GROWTH":
      return "Спрос на товар вырос относительно предыдущего периода.";
    case "TASK_MARGIN_NEAR_ZERO":
      return "Маржа товара около нуля — убыток меньше порога шума.";
    case "TASK_COST_MISSING":
      return "У части товаров с продажами не введена себестоимость.";
    case "TASK_NEGATIVE_MARGIN": {
      const rub = evidenceNumber(evidence, "margin_rub");
      const percent = evidenceNumber(evidence, "margin_percent");
      if ((rub != null && rub < 0) || (percent != null && percent < 0)) {
        return "Текущая цена не покрывает рассчитанную себестоимость товара.";
      }
      return "Отрицательная маржа в этих данных не показана.";
    }
    case "TASK_MARGIN_DETERIORATION":
      return "Маржа товара снизилась относительно предыдущего периода.";
    case "TASK_LOW_MARGIN":
      return "Маржа ниже порога, заданного для этой проверки.";
    case "TASK_LOW_CONTENT_SCORE":
      return "Карточка товара требует улучшения по текущей оценке контента.";
    case "TASK_CONTENT_OPPORTUNITY": {
      const sales = evidenceNumber(evidence, "sales_28d") ?? evidenceNumber(evidence, "current_sales_28d");
      if (sales != null && sales > 0) {
        return "Товар уже получает продажи, но карточка имеет потенциал для улучшения.";
      }
      return "Карточка имеет потенциал для улучшения. Рост продаж от правки не обещается.";
    }
    case "TASK_STAGNANT_CAPITAL": {
      const sitting = evidenceNumber(evidence, "sitting_rub");
      if (sitting != null && sitting > 0) {
        return "Часть капитала связана в запасе, который продаётся медленнее текущего уровня потребности.";
      }
      return "Запас продаётся медленнее текущего уровня потребности.";
    }
    case "TASK_LOW_PHOTO_COUNT":
      return "В карточке не хватает фото для полной оценки контента.";
    case "TASK_UNANSWERED_REVIEWS":
    case "TASK_UNANSWERED_POSITIVE_REVIEWS":
    case "TASK_UNANSWERED_NEGATIVE_REVIEW":
      return "Покупатели оставили отзывы, на которые ещё нет ответа.";
    case "TASK_UNANSWERED_QUESTIONS":
    case "TASK_UNANSWERED_QUESTION":
      return "В магазине есть вопросы покупателей без ответа.";
    case "TASK_NEGATIVE_SHARE_UP":
      return "Доля негативных отзывов по товару выросла.";
    case "TASK_FEEDBACKS_ACCESS":
      return "Без доступа токена к отзывам задачи по отзывам не считаются.";
    case "TASK_PROMO_LOSS":
      return "Товар участвует в акции, цена которой не покрывает себестоимость и списания WB.";
    case "TASK_PROMO_OPPORTUNITY":
      return "Есть акция, в которую товар можно добавить без убытка.";
    case "TASK_AD_NO_ORDERS":
      return "Деньги уходят на рекламу, которая не приводит заказы.";
    case "TASK_AD_DRR_OVER_MARGIN":
      return "Реклама стоит больше, чем зарабатывают рекламные заказы.";
    case "TASK_AD_CAMPAIGN_STOPPED":
      return "Товар теряет заказы, которые приносила реклама.";
    case "TASK_AD_NO_STOCK":
      return "Реклама тратит деньги на карточку, где нечего купить.";
    case "TASK_AD_EFFICIENCY_DROP":
      return "Каждый рекламный заказ обходится дороже, прибыль с рекламы сокращается.";
    case "TASK_AD_WEAK_CARD":
      return "Часть рекламного бюджета тратится на показы и клики, которые не превращаются в заказы.";
    case "TASK_AD_SCALE_UP":
      return "Есть запас, чтобы получить больше заказов без убытка. Прирост WB не гарантирует.";
    case "TASK_LOW_BUYOUT":
      return "Часть заказов не доходит до продажи: за каждый невыкуп вы платите доставку и теряете продажу.";
    case "TASK_LOW_RATING":
      return "Низкая оценка отпугивает покупателей и снижает шанс, что карточку купят.";
    case "TASK_COSTS_EAT_MARGIN":
      return "Маржу можно вернуть без изменения цены: через габариты, возвраты и запас.";
    case "TASK_FROM_EVENT":
      return "Вы создали эту задачу из уведомления. Она не закроется сама: отметьте её выполненной, когда разберётесь.";
    default: {
      const unexpected: never = task.type;
      return unexpected;
    }
  }
}

function joinLabels(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";
  if (labels.length === 2) return `${labels[0]} и ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")} и ${labels[labels.length - 1]}`;
}

function toAction(primary: SellerTask, supporting: SellerTask[]): TopAction {
  const labels = supporting.map((task) => supportLabel(task.type));
  return {
    id: primary.id,
    primary,
    supporting,
    title: actionTitle(primary),
    why: whyNow(primary),
    proofs: proofsFor(primary),
    supportNote: labels.length > 0 ? `Дополнительно: ${joinLabels(labels)}` : null,
    effect: topActionEffect(primary),
    actionType: primary.actionType,
  };
}

/** До пяти действий из активного списка. Будущее откладывание, выполненные и скрытые сюда не входят. */
export function buildTopActions(tasks: readonly SellerTask[], nowMs = Date.now()): TopAction[] {
  const open = tasks.filter((task) => isActionableTask(task, nowMs));
  const groups = new Map<string, SellerTask[]>();
  for (const task of sortByPriority(open)) {
    const key = groupKey(task);
    const group = groups.get(key);
    if (group) group.push(task);
    else groups.set(key, [task]);
  }
  const actions: TopAction[] = [];
  for (const group of groups.values()) {
    if (actions.length >= MAX_TOP_ACTIONS) break;
    const primary = group[0];
    if (!primary) continue;
    actions.push(toAction(primary, group.slice(1)));
  }
  return actions;
}
