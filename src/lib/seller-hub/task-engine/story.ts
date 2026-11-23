import type { SellerTask, TaskEvidence, TaskSeverity } from "./types";

/**
 * Рассказ о задаче человеческим языком: факт, причина, что делать.
 * Собирается только из цифр, которые уже посчитал движок (evidence). Нет цифры, нет и фразы: ничего не выдумываем.
 * Для типов, которых здесь нет, возвращает null: интерфейс тогда показывает краткий текст описания.
 */
export type TaskStory = {
  /** Что случилось, одной фразой с главной цифрой. */
  fact: string;
  /** Строки только для панели задачи: подробности, которые не нужны в карточке. */
  extra?: string[];
  /** Список «что улучшить» с баллами (для карточек контента): показывается таблицей. */
  todo?: Array<{ text: string; points: number | null }>;
  /** Почему так вышло (может не быть). */
  cause: string | null;
  /** Что сделать, одной фразой. */
  action: string | null;
};

const intFmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const oneFmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

const rub = (n: number) => `${intFmt.format(Math.round(n))} ₽`;
const rubUp = (n: number) => `${intFmt.format(Math.ceil(n))} ₽`;
const pct = (n: number) => `${oneFmt.format(n)}%`;
const pcs = (n: number) => `${intFmt.format(Math.round(n))} шт.`;
const days = (n: number) => `${oneFmt.format(n)} дн.`;

function num(evidence: TaskEvidence, key: string): number | null {
  const value = evidence[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function text(evidence: TaskEvidence, key: string): string | null {
  const value = evidence[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firstSentence(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^.+?[.!?](?=\s|$)/u);
  return (match ? match[0] : trimmed).trim();
}

/** Что сделать: если есть готовая рекомендация движка, берём её первую фразу. */
function recommended(task: SellerTask): string | null {
  return firstSentence(task.recommendation);
}

/** Строки пробелов контента движка («Фото: 3 → добавьте ещё 4 (+11 б.)») в понятные действия. */
function parseContentTodo(lines: string[]): Array<{ text: string; points: number | null }> {
  const out: Array<{ text: string; points: number | null }> = [];
  for (const raw of lines) {
    const points = [...raw.matchAll(/\(\+(\d+)\s*б[а-я.]*\)/gu)].reduce((sum, m) => sum + Number(m[1]), 0);
    const clean = raw.replace(/\s*\(\+\d+\s*б[а-я.]*\)/gu, "").replace(/\s+/gu, " ").trim();
    if (!clean) continue;
    let textLine = clean;
    const photos = clean.match(/^Фото:\s*(\d+)\s*(?:→|->|,)?\s*добавьте ещё\s*(\d+)/iu);
    const missing = clean.match(/^Не заполнено:\s*(.+)$/iu);
    const filter = clean.match(/^Ключевой фильтр:\s*(.+)$/iu);
    const fields = clean.match(/^дополнительные поля категории:\s*(\d+)\s*из\s*(\d+)/iu);
    if (photos) textLine = `Добавьте ещё ${photos[2]} фото`;
    else if (/^Видео:/iu.test(clean)) textLine = "Добавьте видео";
    else if (filter) textLine = `Заполните ключевой фильтр: ${filter[1]}`;
    else if (fields) textLine = `Заполните дополнительные поля категории (сейчас ${fields[1]} из ${fields[2]})`;
    else if (missing) textLine = `Заполните: ${missing[1]!.replace(/\s*,\s*/gu, ", ")}`;
    else textLine = clean.charAt(0).toUpperCase() + clean.slice(1);
    out.push({ text: textLine, points: points > 0 ? points : null });
  }
  return out;
}

/** Вопросы и отзывы из описания движка: «16 окт.: можно ли сажать цветы» отдельными строками. */
function quotedItems(description: string): string[] {
  const out: string[] = [];
  const re = /(\d{4}-\d{2}-\d{2}|\d{1,2}\s[а-я]{3,9}\.?):\s*(.+?)(?=;\s*(?:\d{4}-\d{2}-\d{2}|\d{1,2}\s[а-я]{3,9}\.?):|$)/giu;
  for (const m of description.matchAll(re)) {
    const body = m[2]!.replace(/[«»]/gu, "").replace(/[.…\s]+$/u, "").trim();
    if (body) out.push(`${m[1]}: «${body}»`);
  }
  return out;
}

/** Возможная причина, если движок её нашёл. Подаём как предположение. */
function causeExtra(evidence: TaskEvidence): string[] {
  const label = text(evidence, "probable_cause");
  if (!label) return [];
  const fromRaw = evidence["probable_cause_from"];
  const toRaw = evidence["probable_cause_to"];
  const from = fromRaw == null || fromRaw === "" ? NaN : Number(fromRaw);
  const to = toRaw == null || toRaw === "" ? NaN : Number(toRaw);
  const change = Number.isFinite(from) && Number.isFinite(to) && from > 0 && to > 0 ? ` (было ${rub(from)}, стало ${rub(to)})` : "";
  const sentence = `${label.charAt(0).toUpperCase()}${label.slice(1)}${change}`;
  return [`Возможная причина: ${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}. Это предположение, а не точный вывод.`];
}

function pluralWord(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(Math.trunc(n));
  const mod100 = abs % 100;
  const mod10 = abs % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

/**
 * Очистка любого текста движка перед показом человеку: без служебных идентификаторов (discount_changed),
 * без слова «Hub» и без стрелок «→» (вместо них «было …, стало …»).
 */
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

export function humanizeText(input: string): string {
  let value = input ?? "";
  // Ссылки и внутренние пути: человеку их не показываем, всё делается внутри KARTO.
  value = value.replace(/Ответьте в «Автоотзывах»[^.]*?(?:\.|$)/gu, "Ответьте в разделе «Автоответы» KARTO.");
  value = value.replace(/Разберите негативные отзывы окна в «Автоотзывах»[^.]*?(?:\.|$)/gu, "Разберите негативные отзывы в разделе «Автоответы» KARTO.");
  value = value.replace(/\s*\((?:\/[a-z0-9\-_/]+)\)/giu, "").replace(/https?:\/\/\S+/giu, "");
  // Склонение в уже сохранённых текстах: «1 вопросов» в «1 вопрос».
  value = value.replace(
    /(\d[\d\u00a0 ]*)\s+(негативных отзывов|негативных отзыва|негативный отзыв|вопросов|вопроса|вопрос|отзывов|отзыва|отзыв)(?=[\s.,;:)]|$)/gu,
    (match: string, digits: string, noun: string) => {
      const n = Number(digits.replace(/[\s\u00a0]/gu, ""));
      if (!Number.isFinite(n)) return match;
      const forms = noun.startsWith("негатив")
        ? (["негативный отзыв", "негативных отзыва", "негативных отзывов"] as const)
        : noun.startsWith("вопрос")
          ? (["вопрос", "вопроса", "вопросов"] as const)
          : (["отзыв", "отзыва", "отзывов"] as const);
      return `${digits} ${pluralWord(n, forms[0], forms[1], forms[2])}`;
    },
  );
  // Даты вида 2026-10-16 в «16 октября».
  value = value.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/gu, (_m, _y, month: string, day: string) => `${Number(day)} ${MONTHS[Number(month) - 1] ?? ""}`.trim());
  value = value.replace(/\s*\([^()]*(?:[a-z]+_[a-z0-9_]+|[0-9a-f]{8}-[0-9a-f]{4})[^()]*\)/giu, "");
  value = value.replace(/по данным Hub(?:а)?/giu, "по данным кабинета");
  value = value.replace(/Это не доказательство\./gu, "Это предположение, а не точный вывод.");
  value = value.replace(/\(\s*([^()→]+?)\s*→\s*([^()]+?)\s*\)/gu, "(было $1, стало $2)");
  value = value.replace(/:\s*([^:;→()]+?)\s*→\s*([^;.()]+)/gu, ": было $1, стало $2");
  value = value.replace(/\s*→\s*/gu, " — ");
  return value.replace(/ {2,}/gu, " ").trim();
}

/** Одна точка в конце фразы: «шт.» плюс завершающая точка не должны давать «шт..». */
function tidy(value: string | null): string | null {
  if (!value) return value;
  return value.replace(/\.{2,}$/u, ".").replace(/ {2,}/gu, " ").trim();
}

export function taskStory(task: SellerTask): TaskStory | null {
  const story = buildStory(task);
  if (!story) return null;
  return {
    fact: tidy(story.fact) ?? story.fact,
    cause: tidy(story.cause),
    action: tidy(story.action),
    extra: (story.extra ?? []).map((line) => humanizeText(line)).filter(Boolean),
    todo: story.todo,
  };
}

function buildStory(task: SellerTask): TaskStory | null {
  const e = task.evidence;
  switch (task.type) {
    case "TASK_NEGATIVE_MARGIN": {
      const marginRub = num(e, "margin_rub");
      const price = num(e, "price");
      const cost = num(e, "cost");
      const breakEven = num(e, "break_even_price");
      if (marginRub != null && marginRub < 0) {
        return {
          fact: `${price != null ? `Цена ${rub(price)} не покрывает расходы: ` : ""}на каждой продаже вы теряете ${rub(Math.abs(marginRub))}.`,
          cause: `Из цены уходят комиссия WB, логистика${cost != null ? ` и закупка (${rub(cost)})` : ""}, и остаток получается отрицательным.`,
          action:
            breakEven != null
              ? `Поставьте цену не ниже ${rubUp(breakEven)}.`
              : "При текущих удержаниях WB ценой в плюс не выйти: пересмотрите закупку.",
        };
      }
      const before = num(e, "margin_before_cost_u");
      if (before != null && before < 0) {
        const fee = num(e, "fee_rate_k");
        const logistics = num(e, "logistics_per_unit");
        return {
          fact: `Ещё до закупки каждая продажа уходит в минус на ${rub(Math.abs(before))}.`,
          cause: `Комиссия WB${fee != null ? ` (${pct(fee * 100)})` : ""} и логистика${logistics != null ? ` (${rub(logistics)} на штуку)` : ""} съедают всю цену.`,
          action: "Поднимите цену и укажите закупку, чтобы увидеть точный результат.",
        };
      }
      return null;
    }

    case "TASK_STOCK_OUT": {
      const outDays = num(e, "days_out_of_stock");
      const pace = num(e, "pace_before_per_day");
      const missed = num(e, "missed_orders_rub_est");
      return {
        fact: `Остаток 0 шт.${outDays != null && outDays > 0 ? ` Товара нет уже ${days(outDays)}.` : ""}`,
        cause:
          pace != null && pace > 0
            ? `Раньше уходило около ${oneFmt.format(pace)} шт. в день, сейчас продажи стоят${missed != null && missed > 0 ? `, недополучено примерно ${rub(missed)}` : ""}.`
            : null,
        action: recommended(task),
      };
    }

    case "TASK_LOW_STOCK": {
      const cover = num(e, "cover_days");
      const demand = num(e, "demand_per_day");
      const lead = num(e, "lead_time_days");
      const need = num(e, "replenish_units");
      if (cover == null) return null;
      return {
        fact: `Остатка хватит примерно на ${days(cover)}.`,
        cause:
          demand != null
            ? `Уходит около ${oneFmt.format(demand)} шт. в день${lead != null ? `, а поставка едет ${days(lead)}` : ""}.`
            : null,
        action: need != null && need > 0 ? `Привезите не меньше ${pcs(need)}.` : recommended(task),
      };
    }

    case "TASK_EXCESS_STOCK": {
      const stock = num(e, "stock") ?? num(e, "available_stock");
      const cover = num(e, "cover_days_burn");
      const sitting = num(e, "sitting_rub");
      if (stock == null) return null;
      return {
        fact: `На складе ${pcs(stock)}${cover != null ? `, этого хватит на ${days(cover)} продаж` : ""}.`,
        cause: sitting != null && sitting > 0 ? `В товаре лежит около ${rub(sitting)}, которые не работают.` : null,
        action: recommended(task),
      };
    }

    case "TASK_NO_SALES": {
      const noSales = num(e, "no_sales_days");
      const stock = num(e, "stock");
      if (noSales == null) return null;
      return {
        fact: `Заказов нет уже ${days(noSales)}${stock != null ? ` при остатке ${pcs(stock)}` : ""}.`,
        cause: firstSentence(text(e, "diagnosis_text")),
        action: recommended(task),
      };
    }

    case "TASK_SALES_DROP": {
      const prev = num(e, "previous_sales_28d");
      const now = num(e, "current_sales_28d");
      const change = num(e, "change_percent");
      if (prev == null || now == null) return null;
      return {
        fact: `Продаж стало меньше: было ${pcs(prev)}, стало ${pcs(now)} за 28 дней${change != null ? ` (${pct(change)})` : ""}.`,
        cause: e.price_changed === true ? "Незадолго до этого менялась цена." : null,
        action: recommended(task),
        extra: causeExtra(e),
      };
    }

    case "TASK_SALES_GROWTH": {
      const prev = num(e, "previous_sales_28d");
      const now = num(e, "current_sales_28d");
      const change = num(e, "change_percent");
      const cover = num(e, "cover_days");
      if (prev == null || now == null) return null;
      return {
        fact: `Заказов стало заметно больше: было ${pcs(prev)}, стало ${pcs(now)} за 28 дней${change != null ? ` (${change > 0 ? "+" : ""}${pct(change)})` : ""}.`,
        cause: cover != null ? `Запаса хватит примерно на ${days(cover)}, при таком темпе он закончится быстрее.` : null,
        action: "Сверьте запас с ростом и при необходимости пополните склад.",
        extra: causeExtra(e),
      };
    }

    case "TASK_CONVERSION_DROP": {
      const stage = text(e, "conversion_stage");
      const cartNow = num(e, "add_to_cart_percent");
      const cartPrev = num(e, "prior_add_to_cart_percent");
      const orderNow = num(e, "cart_to_order_percent");
      const orderPrev = num(e, "prior_cart_to_order_percent");
      if (stage === "cart_to_order" && orderNow != null && orderPrev != null) {
        return {
          fact: `Из корзины в заказ стали доходить реже: было ${pct(orderPrev)}, стало ${pct(orderNow)}.`,
          cause: "Покупатели кладут товар в корзину, но передумывают на последнем шаге.",
          action: recommended(task),
        };
      }
      if (cartNow != null && cartPrev != null) {
        return {
          fact: `Товар стали реже класть в корзину: было ${pct(cartPrev)}, стало ${pct(cartNow)}.`,
          cause: "Карточку открывают, но она убеждает хуже, чем раньше.",
          action: recommended(task),
        };
      }
      return null;
    }

    case "TASK_LOW_TRAFFIC": {
      const prev = num(e, "prior_open_count");
      const now = num(e, "open_count");
      if (prev == null || now == null) return null;
      return {
        fact: `Карточку открывают реже: было ${intFmt.format(prev)}, стало ${intFmt.format(now)} переходов.`,
        cause: "Меньше людей видят товар, поэтому падают заказы.",
        action: recommended(task),
      };
    }

    case "TASK_LOW_MARGIN": {
      const margin = num(e, "margin_percent");
      const target = num(e, "target_margin_percent");
      const targetPrice = num(e, "target_price");
      if (margin == null) return null;
      return {
        fact: `Маржа ${pct(margin)}${target != null ? `, а цель ${pct(target)}` : ""}.`,
        cause: "После комиссии WB, логистики и закупки остаётся меньше, чем вы планировали.",
        action: targetPrice != null ? `Цена от ${rubUp(targetPrice)} вернёт маржу к цели.` : recommended(task),
      };
    }

    case "TASK_MARGIN_NEAR_ZERO": {
      const margin = num(e, "margin_percent");
      if (margin == null) return null;
      return {
        fact: `Маржа всего ${pct(margin)}.`,
        cause: "Почти вся цена уходит на комиссию WB, логистику и закупку.",
        action: recommended(task),
      };
    }

    case "TASK_LOW_CONTENT_SCORE":
    case "TASK_CONTENT_OPPORTUNITY": {
      const score = num(e, "content_score");
      if (score == null) return null;
      const gaps = (text(e, "content_gaps") ?? text(e, "content_gap") ?? "")
        .split(/\n|(?<=\))\s+(?=[A-ZА-ЯЁa-zа-яё])/u)
        .map((line) => line.trim())
        .filter(Boolean);
      return {
        fact: `Карточку можно улучшить: она набрала ${intFmt.format(score)} из 100 баллов.`,
        cause: null,
        action: "Добавьте фото и дополните описание карточки.",
        todo: parseContentTodo(gaps),
      };
    }

    case "TASK_LOW_PHOTO_COUNT": {
      const photos = num(e, "photo_count");
      const full = num(e, "full_photo_count");
      if (photos == null) return null;
      return {
        fact: `В карточке ${photos} ${pluralWord(photos, "фото", "фото", "фото")}${full != null ? ` из ${full} рекомендуемых` : ""}.`,
        cause: "Покупатель решает по фотографиям, чем их больше, тем выше доверие.",
        action: recommended(task),
      };
    }

    case "TASK_UNANSWERED_REVIEWS": {
      const count = num(e, "unanswered_feedbacks");
      if (count == null) return null;
      return {
        fact: `Без ответа ${intFmt.format(count)} ${pluralWord(count, "отзыв", "отзыва", "отзывов")}.`,
        cause: "Покупатели видят, отвечает ли продавец, это влияет на доверие.",
        action: recommended(task),
      };
    }

    case "TASK_UNANSWERED_QUESTIONS": {
      const count = num(e, "unanswered_questions");
      if (count == null) return null;
      return {
        fact: `Без ответа ${intFmt.format(count)} ${pluralWord(count, "вопрос", "вопроса", "вопросов")}.`,
        cause: "Пока вопрос без ответа, покупатель может уйти к другому продавцу.",
        action: recommended(task),
      };
    }

    case "TASK_UNANSWERED_QUESTION": {
      const count = num(e, "count");
      const orders = num(e, "orders_28d");
      if (count == null) return null;
      return {
        fact: `${intFmt.format(count)} ${pluralWord(count, "вопрос", "вопроса", "вопросов")} без ответа дольше 24 часов.`,
        cause: orders != null && orders > 0 ? "У товара есть заказы, а вопросы задают перед покупкой: без ответа покупатель может уйти." : null,
        action: "Ответьте на вопрос в разделе «Автоответы» KARTO.",
        extra: quotedItems(task.description),
      };
    }

    case "TASK_UNANSWERED_NEGATIVE_REVIEW": {
      const count = num(e, "count");
      const orders = num(e, "orders_28d");
      if (count == null) return null;
      return {
        fact: `${intFmt.format(count)} ${pluralWord(count, "негативный отзыв", "негативных отзыва", "негативных отзывов")} без ответа дольше 24 часов.`,
        cause: e.visible_on_card === true && orders != null && orders > 0 ? "Отзыв видят покупатели, которые выбирают этот товар прямо сейчас." : null,
        action: "Ответьте на отзыв в разделе «Автоответы» KARTO.",
        extra: quotedItems(task.description),
      };
    }

    case "TASK_PROMO_OPPORTUNITY": {
      const name = text(e, "promo_name");
      const price = num(e, "plan_price");
      const marginRub = num(e, "promo_margin_rub");
      const marginPct = num(e, "promo_margin_percent");
      if (price == null || marginRub == null) return null;
      return {
        fact: `Товар подходит для акции${name ? ` «${name}»` : ""}: по цене ${rub(price)} вы заработаете ${rub(marginRub)} с продажи${marginPct != null ? ` (${pct(marginPct)})` : ""}.`,
        cause: "При такой цене вы остаётесь в плюсе, а в акции товар получает больше показов.",
        action: "Добавьте товар в акцию на странице «Акции».",
      };
    }

    case "TASK_PROMO_LOSS": {
      const name = text(e, "promo_name");
      const price = num(e, "plan_price");
      const marginRub = num(e, "promo_margin_rub");
      if (price == null || marginRub == null || marginRub >= 0) return null;
      return {
        fact: `В акции${name ? ` «${name}»` : ""} цена ${rub(price)} убыточна: с каждой продажи вы теряете ${rub(Math.abs(marginRub))}.`,
        cause: "Скидка в акции больше, чем остаётся от цены после комиссии, логистики и закупки.",
        action: recommended(task),
      };
    }

    case "TASK_AD_DRR_OVER_MARGIN": {
      const drr = num(e, "drr_percent");
      const margin = num(e, "margin_percent");
      if (drr == null) return null;
      return {
        fact: `Реклама отдаёт ${pct(drr)} выручки${margin != null ? `, а маржа товара ${pct(margin)}` : ""}.`,
        cause: "Расход на рекламу больше прибыли с продажи, поэтому каждый заказ из рекламы убыточен.",
        action: recommended(task),
      };
    }

    case "TASK_AD_NO_ORDERS": {
      const spend = num(e, "ad_spend");
      const window = num(e, "window_days");
      if (spend == null) return null;
      return {
        fact: `Реклама потратила ${rub(spend)}${window != null ? ` за ${intFmt.format(window)} ${pluralWord(window, "день", "дня", "дней")}` : ""}, заказов нет.`,
        cause: "Деньги уходят на показы и клики, но покупок они не приносят.",
        action: recommended(task),
      };
    }

    default:
      return null;
  }
}


/**
 * Название задачи для экрана. Одна и та же проверка может дать разную важность, и тогда одинаковые названия сбивают с толку:
 * «Излишек запаса» важный и «Излишек запаса» возможность. Различаем размером проблемы, смысл не меняется.
 */
const TITLE_BY_SEVERITY: Record<string, Partial<Record<TaskSeverity, string>>> = {
  TASK_EXCESS_STOCK: { critical: "Очень большой излишек запаса", important: "Большой излишек запаса", opportunity: "Небольшой излишек запаса" },
  TASK_LOW_STOCK: { critical: "Запас закончится на днях", important: "Запас скоро закончится", opportunity: "Запас стоит пополнить" },
  TASK_NEGATIVE_MARGIN: { critical: "Сильный убыток на продаже", important: "Убыточная цена", opportunity: "Небольшой убыток на продаже" },
  TASK_LOW_MARGIN: { critical: "Маржа сильно ниже целевой", important: "Маржа ниже целевой", opportunity: "Маржа немного ниже целевой" },
  TASK_MARGIN_DETERIORATION: { critical: "Маржа резко ухудшилась", important: "Маржа ухудшилась", opportunity: "Маржа немного просела" },
  TASK_NO_SALES: { critical: "Товар совсем не продаётся", important: "Товар не продаётся", opportunity: "Товар продаётся слабо" },
  TASK_LOW_CONTENT_SCORE: { critical: "Контент карточки слабый", important: "Контент карточки ниже порога", opportunity: "Контент можно улучшить" },
  TASK_UNANSWERED_REVIEWS: { critical: "Много отзывов без ответа", important: "Есть отзывы без ответа", opportunity: "Остались отзывы без ответа" },
  TASK_UNANSWERED_QUESTIONS: { critical: "Много вопросов без ответа", important: "Есть вопросы без ответа", opportunity: "Остались вопросы без ответа" },
};

export function taskDisplayTitle(task: Pick<SellerTask, "type" | "severity" | "title">): string {
  return TITLE_BY_SEVERITY[task.type]?.[task.severity] ?? task.title;
}
