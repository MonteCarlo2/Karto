import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChatBlock } from "@/lib/seller-hub/agent/chat";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { mdToTelegramHtml, renderBlocks, renderChatReply, type RenderCtx } from "./assistant-render";
import { isChangeRequest } from "./assistant-ai";
import { strictIntent } from "./assistant-text";
import { TELEGRAM_TEXT_LIMIT } from "./format";

const NOW = Date.parse("2026-11-20T12:00:00Z");

const snapshot = {
  syncedAt: new Date(NOW).toISOString(),
  items: [
    { externalId: "111", vendorCode: "BK-10", title: "Ведро <строительное> 10 л, 3 шт", price: 1500, discountedPrice: 1200, discountPercent: 20, stockFbo: 10, stockFbs: 5 },
    { externalId: "222", vendorCode: "BK-5", title: "Ведро 5 л", price: 500, discountedPrice: 500 },
  ],
  analytics: { periodStart: "2026-11-14", periodEnd: "2026-11-20", ordersTotal: 30, revenueTotal: 60000, buyoutsTotal: 0, avgOrderValue: 2000, daily: [{ date: "2026-11-19", orders: 12, revenue: 24000 }, { date: "2026-11-20", orders: 3, revenue: 6000 }], currency: "RUB" },
  funnel: { loadedAt: "", version: 2, dateFrom: "2026-11-01", dateTo: "2026-11-20", byNm: { "111": { orders: 20, priorOrders: null, feedbackRating: 4.8, ordersPerDay: 1, selected: { openCount: 1000, cartCount: 100, orderCount: 20, orderSum: 24000, buyoutCount: 10, cancelCount: 2, avgOrdersCountPerDay: 1, avgPrice: 1200, addToCartPercent: 10, cartToOrderPercent: 20, buyoutPercent: 80 }, past: null }, "222": { orders: 5, priorOrders: null, feedbackRating: null, ordersPerDay: 0.2, selected: { openCount: 200, cartCount: 10, orderCount: 5, orderSum: 2500, buyoutCount: 3, cancelCount: 1, avgOrdersCountPerDay: 0, avgPrice: 500, addToCartPercent: 5, cartToOrderPercent: 50, buyoutPercent: 75 }, past: null } } },
  promotions: [{ id: "1", name: "Чёрная пятница", startAt: "2026-11-25T00:00:00Z", endAt: "2026-12-01T00:00:00Z", participatingSkuCount: 3 }, { id: "2", name: "Старая", endAt: "2026-10-01T00:00:00Z" }],
  comms: { unansweredFeedbacks: 2, unansweredQuestions: 1 },
} as unknown as SellerCatalogSnapshot;
const ctx: RenderCtx = { snapshot, events: [], tasks: [], nowMs: NOW, url: "https://karto.pro/studio/seller-hub" };

describe("текст агента в HTML Telegram", () => {
  it("жирный, курсив, код, списки и заголовки; чужая разметка экранируется", () => {
    assert.equal(mdToTelegramHtml("**Итог**: 5 < 7 & 3 > 2"), "<b>Итог</b>: 5 &lt; 7 &amp; 3 &gt; 2");
    assert.equal(mdToTelegramHtml("## Заголовок\n- первое\n* второе\n• третье"), "<b>Заголовок</b>\n• первое\n• второе\n• третье");
    assert.equal(mdToTelegramHtml("Цена *важна* и `арт 12`"), "Цена <i>важна</i> и <code>арт 12</code>");
    assert.equal(mdToTelegramHtml("<script>alert(1)</script> <b>x</b>"), "&lt;script&gt;alert(1)&lt;/script&gt; &lt;b&gt;x&lt;/b&gt;");
    assert.equal(mdToTelegramHtml("Смотри [статью](https://x.ru/a) здесь"), "Смотри статью здесь");
    assert.equal(mdToTelegramHtml("мусор ** без пары и * одинокая"), "мусор  без пары и  одинокая");
  });

  it("теги всегда парные", () => {
    const html = mdToTelegramHtml("**а** *б* `в` **г");
    for (const tag of ["b", "i", "code"]) assert.equal((html.match(new RegExp(`<${tag}>`, "g")) ?? []).length, (html.match(new RegExp(`</${tag}>`, "g")) ?? []).length);
  });
});

describe("карточки ответа из настоящих данных", () => {
  it("товары: цена, скидка, остаток, заказы, рейтинг; название экранируется", () => {
    const [text] = renderBlocks([{ type: "product", nmId: "111" } as ChatBlock], ctx);
    assert.match(text!, /<b>Ведро &lt;строительное&gt; 10 л, 3 шт<\/b>/);
    assert.match(text!, /Цена — <b>1\u00A0200\u00A0₽<\/b> \(скидка 20\u00A0%\)/);
    assert.match(text!, /Остаток — <b>15 шт<\/b>/);
    assert.match(text!, /Заказов за период — <b>20<\/b>/);
    assert.match(text!, /Рейтинг — <b>4,8<\/b>/);
    assert.deepEqual(renderBlocks([{ type: "product", nmId: "999" } as ChatBlock], ctx), []);
  });

  it("аналитика: динамика, воронка, кто даёт оборот; акции", () => {
    const trend = renderBlocks([{ type: "analytics", view: "trend", days: 7 } as ChatBlock], ctx).join("");
    assert.match(trend, /19 нояб +▰+ +12 шт · 24\u00A0000\u00A0₽/);
    assert.match(trend, /Итого за 2 дн\.<\/b>\n🛒 Заказов — <b>30<\/b>/);
    const funnel = renderBlocks([{ type: "analytics", view: "funnel", days: 28 } as ChatBlock], ctx).join("");
    assert.match(funnel, /Перешли в карточку — <b>1\u00A0200<\/b>/);
    assert.match(funnel, /Выкупили — <b>13<\/b>/);
    const top = renderBlocks([{ type: "analytics", view: "products", days: 28 } as ChatBlock], ctx).join("");
    assert.match(top, /🥇 <b>Ведро &lt;строительное&gt;/);
    const promos = renderBlocks([{ type: "info", kind: "promos" } as ChatBlock], ctx).join("");
    assert.match(promos, /Чёрная пятница/);
    assert.doesNotMatch(promos, /Старая/);
  });

  it("блоки-действия не показываются", () => {
    assert.deepEqual(renderBlocks([{ type: "price_edit", nmId: "111", field: "price", value: 1 } as ChatBlock, { type: "section", id: "tasks", title: "t", note: "n" } as ChatBlock], ctx), []);
  });
});

describe("ответ агента целиком", () => {
  it("текст, уточнения с вариантами на кнопках и источники", () => {
    const answer = renderChatReply({ role: "assistant", at: "", text: "**Сегодня** 3 заказа на 6 000 ₽", questions: ["За какой период?"], questionOptions: [["Сегодня", "Вчера", "Неделя"]], sources: [{ title: "Новости WB <тест>", url: "https://seller.wildberries.ru/news?a=1&b=2" }] }, { ...ctx, showSources: true });
    const text = answer.messages.join("\n");
    assert.match(text, /<b>Сегодня<\/b> 3 заказа/);
    assert.match(text, /Уточните/);
    assert.match(text, /За какой период\?/);
    assert.match(text, /<a href="https:\/\/seller\.wildberries\.ru\/news\?a=1&amp;b=2">Новости WB &lt;тест&gt;<\/a>/);
    assert.deepEqual(answer.keyboard, [["Сегодня"], ["Вчера"], ["Неделя"]]);
    assert.ok(answer.messages.every((m) => m.length <= TELEGRAM_TEXT_LIMIT));
  });

  it("пустой ответ не превращается в тишину; длинный режется на сообщения", () => {
    assert.ok(renderChatReply({ role: "assistant", at: "", text: "" }, ctx).messages.length === 1);
    const long = renderChatReply({ role: "assistant", at: "", text: Array.from({ length: 400 }, (_, i) => `- пункт ${i} ${"слово ".repeat(10)}`).join("\n") }, ctx);
    for (const m of long.messages) assert.ok(m.length <= TELEGRAM_TEXT_LIMIT);
  });
});

describe("что можно спрашивать в Telegram", () => {
  it("просьбы создать или изменить отклоняются, вопросы нет", () => {
    assert.equal(isChangeRequest("Составь план по ведрам"), true);
    assert.equal(isChangeRequest("поставь цену 1000 на ведро"), false);
    assert.equal(isChangeRequest("сколько у меня заказов сегодня"), false);
    assert.equal(isChangeRequest("какая цена на строительное ведро 10 литров"), false);
    assert.equal(isChangeRequest("когда будут ближайшие акции"), false);
  });

  it("кнопки и команды отвечают сразу, обычные фразы уходят агенту", () => {
    assert.equal(strictIntent("📊 Сводка"), "summary");
    assert.equal(strictIntent("/tasks"), "tasks");
    assert.equal(strictIntent("/events@KartoProBot"), "events");
    assert.equal(strictIntent("как дела"), null);
    assert.equal(strictIntent("что нового сегодня"), null);
  });
});

describe("источники под ответом", () => {
  it("по умолчанию скрыты, показываются только когда нужны", () => {
    const msg = { role: "assistant" as const, at: "", text: "Ответ", sources: [{ title: "WB", url: "https://seller.wildberries.ru/a" }] };
    assert.ok(!renderChatReply(msg, ctx).messages.join("").includes("Источники"));
    assert.match(renderChatReply(msg, { ...ctx, showSources: true }).messages.join(""), /Источники/);
  });
});
