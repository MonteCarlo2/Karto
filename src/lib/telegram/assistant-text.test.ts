import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import type { SellerTask } from "@/lib/seller-hub/task-engine/types";
import type { SellerProductEvent } from "@/lib/seller-hub/event-engine/types";
import { detectIntent, eventsText, ordersText, plansText, reviewsText, summaryText, tasksText, whenMsk } from "./assistant-text";
import { TELEGRAM_TEXT_LIMIT } from "./format";

const NOW = Date.parse("2026-11-20T12:00:00Z");

describe("помощник в Telegram: понимание вопросов", () => {
  it("кнопки, команды и обычные слова", () => {
    assert.equal(detectIntent("📊 Сводка"), "summary");
    assert.equal(detectIntent("/summary"), "summary");
    assert.equal(detectIntent("Как дела?"), "summary");
    assert.equal(detectIntent("какой оборот за неделю"), "summary");
    assert.equal(detectIntent("📌 Задачи"), "tasks");
    assert.equal(detectIntent("что мне сделать"), "tasks");
    assert.equal(detectIntent("🔔 События"), "events");
    assert.equal(detectIntent("что нового"), "events");
    assert.equal(detectIntent("🧭 Планы"), "plans");
    assert.equal(detectIntent("🤖 Поручения"), "orders");
    assert.equal(detectIntent("💬 Отзывы"), "reviews");
    assert.equal(detectIntent("помощь"), "help");
    assert.equal(detectIntent("/start"), "help");
    assert.equal(detectIntent("расскажи анекдот"), "unknown");
    assert.equal(detectIntent("   "), "unknown");
  });
});

describe("помощник в Telegram: ответы", () => {
  const snapshot = {
    syncedAt: new Date(NOW - 5 * 60_000).toISOString(),
    analytics: { periodStart: "", periodEnd: "", ordersTotal: 28, revenueTotal: 59516, buyoutsTotal: 0, avgOrderValue: 2126, daily: [{}, {}, {}], currency: "RUB" },
    orders: { newCount: 2, inAssembly: 0, inDelivery: 14, delivered: 0, canceled: 4 },
    comms: { unansweredFeedbacks: 1, unansweredQuestions: 0 },
    finance: { available: true, balance: 79233 },
  } as unknown as SellerCatalogSnapshot;
  const task = (over: Partial<SellerTask>): SellerTask => ({ id: "t", severity: "critical", status: "active", type: "negative_margin", category: "economics", evidence: {}, title: "Цена <ниже> нуля", description: "", recommendation: "", productTitle: "Кашпо & «16л»", nmId: "1", score: 1, snoozeUntil: null, createdAt: new Date(NOW).toISOString(), updatedAt: new Date(NOW).toISOString(), ...over }) as unknown as SellerTask;

  it("сводка с настоящими числами и экранированием", () => {
    const [text] = summaryText(snapshot, [task({})], NOW);
    assert.match(text!, /Оборот — <b>59 516 ₽<\/b>/);
    assert.match(text!, /Заказов — <b>28<\/b> \(чек 2 126 ₽\)/);
    assert.match(text!, /На счёте — <b>79 233 ₽<\/b>/);
    assert.match(text!, /<b>2<\/b> новых ждут сборки, <b>14<\/b> уже переданы в доставку/);
    assert.match(text!, /<b>1<\/b> отзывов, <b>0<\/b> вопросов/);
    assert.match(text!, /обновлено 5 мин назад/);
    assert.match(summaryText(null, [], NOW)[0]!, /ещё не загружены/);
  });

  it("задачи, события, планы, поручения, отзывы", () => {
    const tasks = tasksText([task({}), task({ id: "t2", severity: "important", title: "Мало запаса" })], NOW, "https://karto.pro");
    assert.match(tasks.join(""), /Задачи в работе: 2/);
    assert.match(tasks.join(""), /Кашпо &amp; «16л»/);
    assert.match(tasksText([], NOW, "https://karto.pro")[0]!, /Срочного нет/);

    const events = eventsText([{ id: "e", createdAt: new Date(NOW - 3_600_000).toISOString(), kind: "stock_out", group: "stock", severity: "important", title: "Закончился <товар>", detail: "", productTitle: null, vendorCode: null, nmId: null, itemId: null } as SellerProductEvent], NOW, "https://karto.pro");
    assert.match(events.join(""), /Закончился &lt;товар&gt;/);
    assert.match(events.join(""), /1 ч назад/);
    assert.match(eventsText([], NOW, "u")[0]!, /Новых событий пока нет/);

    const plans = plansText([{ title: "Поднять выкуп", state: { status: "running", acceptedAt: new Date(NOW - 2 * 86_400_000).toISOString() } }, { title: "Старый", state: { acceptedAt: "2026-10-01T00:00:00Z", resolvedAt: "2026-10-10T00:00:00Z" } }], NOW);
    assert.match(plans.join(""), /Планы в работе: 1/);
    assert.match(plans.join(""), /идёт, 3-й день/);
    assert.match(plansText([], NOW)[0]!, /нет планов/);

    const orders = ordersText([{ title: "Напомнить про отзывы", status: "active", nextRunAt: new Date(NOW + 3_600_000).toISOString() }, { title: "Пауза", status: "paused", nextRunAt: null }], NOW);
    assert.match(orders.join(""), /Поручения агента: 1/);
    assert.match(orders.join(""), /следующий запуск сегодня 16:00/);

    assert.match(reviewsText(snapshot, "https://karto.pro").join(""), /Отзывов без ответа — <b>1<\/b>/);
    assert.match(reviewsText(null, "https://karto.pro")[0]!, /Данных пока нет/);
  });

  it("время по Москве и длина сообщений", () => {
    assert.equal(whenMsk("2026-11-21T06:30:00Z", NOW), "завтра 09:30");
    assert.equal(whenMsk("2026-11-25T06:30:00Z", NOW), "25.11 09:30");
    assert.equal(whenMsk(null, NOW), "—");
    const many = Array.from({ length: 50 }, (_, i) => task({ id: `t${i}`, title: "Очень длинное название задачи ".repeat(10) }));
    for (const m of tasksText(many, NOW, "https://karto.pro")) assert.ok(m.length <= TELEGRAM_TEXT_LIMIT);
  });
});
