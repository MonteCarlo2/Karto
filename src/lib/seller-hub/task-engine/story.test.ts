import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SellerTask } from "./types";
import { taskStory } from "./story";

function task(type: SellerTask["type"], evidence: SellerTask["evidence"], recommendation = ""): SellerTask {
  return {
    id: "t1",
    storeId: "s1",
    nmId: "1",
    itemId: "i1",
    productTitle: "Товар",
    vendorCode: "A-1",
    type,
    category: "economics",
    severity: "critical",
    status: "active",
    title: "Заголовок",
    description: "Описание",
    reason: "Причина",
    evidence,
    recommendation,
    actionType: "OPEN_PRICE_EDITOR",
    businessImpactType: "PROFIT_PROTECTION",
    score: 1,
    sourceEventId: null,
    createdAt: "2026-10-28T00:00:00.000Z",
    updatedAt: "2026-10-28T00:00:00.000Z",
    snoozeUntil: null,
    resolvedAt: null,
    resolution: null,
  } as SellerTask;
}

describe("taskStory: факт, причина, действие", () => {
  it("убыточная цена: человеческий рассказ с безубыточной ценой, округлённой вверх", () => {
    const story = taskStory(
      task("TASK_NEGATIVE_MARGIN", { margin_rub: -164.4, price: 1688, cost: 900, break_even_price: 1941.2 }),
    );
    assert.ok(story);
    assert.match(story.fact, /Цена 1\s688 ₽ не покрывает расходы/);
    assert.match(story.fact, /теряете 164 ₽/);
    assert.match(story.cause ?? "", /комиссия WB, логистика и закупка \(900 ₽\)/);
    assert.equal(story.action, "Поставьте цену не ниже 1 942 ₽.".replace(" ", " "));
  });

  it("без безубыточной цены не обещает цену", () => {
    const story = taskStory(task("TASK_NEGATIVE_MARGIN", { margin_rub: -10, price: 500, cost: 400 }));
    assert.ok(story);
    assert.match(story.action ?? "", /ценой в плюс не выйти/);
  });

  it("закончился товар: берёт только настоящие цифры", () => {
    const story = taskStory(task("TASK_STOCK_OUT", { stock: 0, days_out_of_stock: 6, pace_before_per_day: 4.2 }, "Соберите поставку. Потом проверьте остатки."));
    assert.ok(story);
    assert.match(story.fact, /Остаток 0 шт\. Товара нет уже 6 дн\./);
    assert.match(story.cause ?? "", /около 4,2 шт\. в день/);
    assert.equal(story.action, "Соберите поставку.");
  });

  it("запас скоро закончится: сколько привезти", () => {
    const story = taskStory(task("TASK_LOW_STOCK", { cover_days: 6, demand_per_day: 2.3, lead_time_days: 9, replenish_units: 40 }));
    assert.ok(story);
    assert.match(story.fact, /хватит примерно на 6 дн\./);
    assert.match(story.cause ?? "", /поставка едет 9 дн\./);
    assert.equal(story.action, "Привезите не меньше 40 шт.");
  });

  it("нет нужных цифр: рассказа нет", () => {
    assert.equal(taskStory(task("TASK_SALES_DROP", {})), null);
    assert.equal(taskStory(task("TASK_LOW_STOCK", {})), null);
  });

  it("отзывы без ответа: склонение", () => {
    assert.match(taskStory(task("TASK_UNANSWERED_REVIEWS", { unanswered_feedbacks: 4 }))!.fact, /4 отзыва/);
    assert.match(taskStory(task("TASK_UNANSWERED_REVIEWS", { unanswered_feedbacks: 5 }))!.fact, /5 отзывов/);
    assert.match(taskStory(task("TASK_UNANSWERED_REVIEWS", { unanswered_feedbacks: 1 }))!.fact, /1 отзыв\./);
  });

  it("для неописанных типов возвращает null", () => {
    assert.equal(taskStory(task("TASK_FROM_EVENT", { x: 1 })), null);
  });
});

import { humanizeText } from "./story";

describe("humanizeText: служебные слова не доходят до человека", () => {
  it("убирает идентификаторы событий в скобках и слово Hub", () => {
    const out = humanizeText("Заказы выросли. Вероятная причина по данным Hub: изменилась скидка (discount_changed). Это не доказательство.");
    assert.ok(!out.includes("discount_changed"));
    assert.ok(!out.includes("Hub"));
    assert.match(out, /по данным кабинета: изменилась скидка\./);
    assert.match(out, /Это предположение, а не точный вывод\./);
  });

  it("заменяет стрелки на «было, стало»", () => {
    assert.equal(humanizeText("Заказы выросли (10 шт. → 100 шт.)"), "Заказы выросли (было 10 шт., стало 100 шт.)");
    assert.equal(humanizeText("Переходы: 3 090 → 3 180"), "Переходы: было 3 090, стало 3 180");
  });

  it("рост заказов: человеческий рассказ и причина как предположение", () => {
    const story = taskStory(
      task("TASK_SALES_GROWTH", {
        previous_sales_28d: 10,
        current_sales_28d: 100,
        change_percent: 900,
        cover_days: 8,
        probable_cause: "изменилась скидка",
      }),
    );
    assert.ok(story);
    assert.match(story.fact, /было 10 шт\., стало 100 шт\./);
    assert.match(story.fact, /\+900%/);
    assert.match(story.cause ?? "", /Запаса хватит примерно на 8 дн\./);
    assert.ok((story.extra ?? []).some((line) => /изменилась скидка/.test(line) && /предположение/.test(line)));
  });

  it("слабый контент: в карточке общие слова, подробности только в extra", () => {
    const story = taskStory(
      task("TASK_LOW_CONTENT_SCORE", { content_score: 46, photo_count: 3, content_gaps: "Фото: 3, добавьте ещё 4 (+11 баллов)\nОписание короткое" }),
    );
    assert.ok(story);
    assert.equal(story.fact, "Карточку можно улучшить: она набрала 46 из 100 баллов.");
    assert.equal(story.action, "Добавьте фото и дополните описание карточки.");
    assert.ok((story.todo ?? []).some((row) => row.text === "Описание короткое"));
  });
});

describe("задачи про вопросы, акции и контент", () => {
  it("вопрос без ответа: правильное склонение, наш раздел вместо ссылки на WB, вопрос покупателя с датой", () => {
    const base = task("TASK_UNANSWERED_QUESTION", { count: 1, orders_28d: 5 }, "Ответьте в «Автоотзывах» (/studio/auto-replies/workspace) или в кабинете WB: https://seller.wildberries.ru/feedback-question/questions.");
    base.description = "Товар: 1 вопросов без ответа дольше 24 часов. У товара есть заказы за 28 дней — вопрос задают до покупки. 2026-10-16: можно ли сажать комнатные цветы";
    const story = taskStory(base);
    assert.ok(story);
    assert.match(story.fact, /^1 вопрос без ответа дольше 24 часов\.$/);
    assert.match(story.action ?? "", /раздел.* «Автоответы» KARTO/);
    assert.ok(!(story.action ?? "").includes("wildberries.ru"));
    assert.deepEqual(story.extra, ["16 октября: «можно ли сажать комнатные цветы»"]);
  });

  it("очиститель убирает ссылки, пути и ISO-даты", () => {
    const out = humanizeText("Ответьте в «Автоотзывах» (/studio/auto-replies/workspace) или в кабинете WB: https://seller.wildberries.ru/x. 2026-10-16: вопрос");
    assert.ok(!out.includes("http"));
    assert.ok(!out.includes("/studio"));
    assert.match(out, /Автоответы/);
    assert.match(out, /16 октября: вопрос/);
  });

  it("акция: человеческая причина и цифры только из данных", () => {
    const story = taskStory(task("TASK_PROMO_OPPORTUNITY", { promo_name: "Осенняя распродажа", plan_price: 1090, promo_margin_rub: 214, promo_margin_percent: 19.6 }));
    assert.ok(story);
    assert.match(story.fact, /подходит для акции «Осенняя распродажа»/);
    assert.match(story.fact, /по цене 1\s090 ₽/);
    assert.match(story.fact, /заработаете 214 ₽/);
    assert.equal(taskStory(task("TASK_PROMO_OPPORTUNITY", {})), null);
  });

  it("контент: список «что улучшить» без стрелок, с баллами отдельно", () => {
    const story = taskStory(
      task("TASK_LOW_CONTENT_SCORE", {
        content_score: 59,
        content_gaps: "Фото: 3 → добавьте ещё 4 (+11 б.)\nВидео: нет (+10 б.)\nКлючевой фильтр: Объём (л) (+8 б.)\nдополнительные поля категории: 1 из 3 (+5 б.)\nНе заполнено: Цвет (+3 б.), Комплектация (+2 б.)",
      }),
    );
    assert.ok(story?.todo);
    assert.deepEqual(
      story.todo.map((row) => row.text),
      [
        "Добавьте ещё 4 фото",
        "Добавьте видео",
        "Заполните ключевой фильтр: Объём (л)",
        "Заполните дополнительные поля категории (сейчас 1 из 3)",
        "Заполните: Цвет, Комплектация",
      ],
    );
    assert.deepEqual(story.todo.map((row) => row.points), [11, 10, 8, 5, 5]);
  });
});
