import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SCOPE_QUESTION, MAX_PLAN_PRODUCTS, chatGroups, chatPayload, chatTitle, orderGaps, smartOrderOptions, timeOptions, parseChatBlocks, parseChatTurn, productsMatching, parsePlanForProduct, planProductPayload, type ChatProduct } from "./chat";

const products: ChatProduct[] = [
  { nmId: "1", title: "Ведро", facts: { orders_28d: 15, margin_pct: -3, cart_pct: 4 }, tasks: ["Убыточная цена"] },
  { nmId: "2", title: "Лопата", facts: { orders_28d: 5, margin_pct: 20 }, tasks: [] },
];
const profile = { sku_total: 2, orders_28d_total: 20 };
const facts = new Map(products.map((p) => [p.nmId, p.facts]));
const groups = chatGroups(products, "c1", "Увеличить продажи, не меняя карточки");
const turn = (mode: string, extra: Record<string, unknown> = {}) => "```json\n" + JSON.stringify({ mode, reply: "ответ", questions: [], selected: [], ...extra }) + "\n```";
const planRaw = (nmId: string, over: Record<string, unknown> = {}) =>
  JSON.stringify({
    solutions: [
      {
        nmId,
        verdict: "problem",
        kind: "conversion",
        title: `План ${nmId}`,
        diagnosis: "d",
        evidence: [{ key: "orders_28d", value: facts.get(nmId)?.orders_28d ?? 5 }],
        goal: "Поднять заказы",
        steps: [{ day: 0, when: "сразу", by: "human", step: "Проверить рекламу", action: null }],
        checks: [],
        success: [{ metric: "orders_28d", op: ">=", value: 20 }],
        guards: [],
        reviewAfterDays: 14,
        failNote: "",
        fallback: "другой подход",
        ...over,
      },
    ],
  });

describe("чат «поставить задачу»: шаг 1, вопросы или выбор товаров", () => {
  it("вопросы принимаются, пока раунды не исчерпаны", () => {
    const t = parseChatTurn(turn("ask", { questions: ["Можно менять цену?", "Какая минимальная маржа?"] }), products, 0);
    assert.equal(t.mode, "ask");
    assert.equal(t.questions.length, 2);
  });
  it("после двух раундов вопросов ИИ обязан выбрать товары: вопросы без выбора превращаются в честное сообщение", () => {
    const t = parseChatTurn(turn("ask", { questions: ["Ещё вопрос?"], reply: "" }), products, 2);
    assert.equal(t.mode, "ask");
    assert.equal(t.questions.length, 0);
    assert.match(t.reply, /Не удалось подобрать товары/);
  });
  it("выбор товаров: чужие и повторные товары отбрасываются", () => {
    const t = parseChatTurn(turn("plan", { selected: [{ nmId: "1", why: "падают заказы" }, { nmId: "999", why: "?" }, { nmId: "1", why: "повтор" }, { nmId: 2, why: "числом" }] }), products, 1);
    assert.equal(t.mode, "plan");
    assert.deepEqual(t.selected.map((s) => s.nmId), ["1", "2"]);
    assert.equal(t.dropped, 2);
  });
  it("не больше заданного числа товаров", () => {
    const many: ChatProduct[] = Array.from({ length: 10 }, (_, i) => ({ nmId: `n${i}`, title: `Т${i}`, facts: { orders_28d: 5 }, tasks: [] }));
    const t = parseChatTurn(turn("plan", { selected: many.map((p) => ({ nmId: p.nmId, why: "w" })) }), many, 1);
    assert.equal(t.selected.length, MAX_PLAN_PRODUCTS);
  });
  it("мусор вместо JSON даёт понятное сообщение", () => {
    assert.equal(parseChatTurn("не json", products, 0).selected.length, 0);
  });
});

describe("чат «поставить задачу»: шаг 2, план по одному товару", () => {
  it("план с верными цифрами принимается", () => {
    const r = parsePlanForProduct(planRaw("1"), groups[0]!, facts, profile);
    assert.equal(r.plan?.nmId, "1");
    assert.equal(r.plan?.strategy?.steps.length, 1);
  });
  it("неверная цифра отклоняет план, план без шагов не принимается", () => {
    assert.equal(parsePlanForProduct(planRaw("1", { evidence: [{ key: "orders_28d", value: 999 }] }), groups[0]!, facts, profile).plan, null);
    assert.equal(parsePlanForProduct(planRaw("1", { steps: [] }), groups[0]!, facts, profile).plan, null);
  });
});

describe("чат «поставить задачу»: запросы к ИИ", () => {
  it("на первом шаге в запрос уходят все товары с фактами, диалог и сколько раундов вопросов осталось", () => {
    const payload = JSON.parse(chatPayload({ profile, products, messages: [{ role: "user", text: "Увеличить продажи", at: "t" }], roundsUsed: 1, nowIso: "2026-10-28T10:00:00Z" }));
    assert.equal(payload.products.length, 2);
    assert.equal(payload.products[0].open_algorithm_signals[0], "Убыточная цена");
    assert.equal(payload.question_rounds_left, 1);
    assert.equal(payload.dialog[0].text, "Увеличить продажи");
  });
  it("на втором шаге контекст сфокусирован на одном товаре: он, профиль магазина, причина выбора и весь диалог", () => {
    const payload = JSON.parse(planProductPayload({ profile, product: products[0]!, why: "падают заказы", messages: [{ role: "user", text: "маржа не ниже 15%", at: "t" }], nowIso: "x" }));
    assert.equal(payload.product.nmId, "1");
    assert.equal(payload.products, undefined);
    assert.equal(payload.why_selected, "падают заказы");
    assert.equal(payload.dialog[0].text, "маржа не ниже 15%");
  });
  it("заголовок диалога: первая реплика без лишних пробелов", () => {
    assert.equal(chatTitle("  Увеличить   продажи \n сегодня "), "Увеличить продажи сегодня");
  });
  it("общая задача без названной области: вместо планов вопрос, к чему применить", () => {
    const t = parseChatTurn(turn("plan", { scope: "unclear", selected: [{ nmId: "1", why: "падают заказы" }] }), products, 0, "Поднять маржу");
    assert.equal(t.mode, "ask");
    assert.deepEqual(t.questions, [SCOPE_QUESTION]);
    assert.equal(t.selected.length, 0);
  });
  it("«весь магазин» без слов владельца о магазине тоже уточняется; со словами «ко всему магазину» идёт в планы", () => {
    const body = turn("plan", { scope: "store", selected: [{ nmId: "1", why: "w" }] });
    assert.equal(parseChatTurn(body, products, 0, "увеличить продажи").mode, "ask");
    assert.equal(parseChatTurn(body, products, 1, "увеличить продажи, ко всему магазину").mode, "plan");
  });
  it("конкретный товар или группа идут сразу в планы; после раундов вопросов область не спрашивается снова", () => {
    assert.equal(parseChatTurn(turn("plan", { scope: "product", selected: [{ nmId: "1", why: "w" }] }), products, 0, "ведро 12 литров").mode, "plan");
    assert.equal(parseChatTurn(turn("plan", { scope: "group", selected: [{ nmId: "1", why: "w" }] }), products, 0, "все залежавшиеся").mode, "plan");
    assert.equal(parseChatTurn(turn("plan", { scope: "unclear", selected: [{ nmId: "1", why: "w" }] }), products, 2, "сделай").mode, "plan");
  });

  it("вопрос или совет: режим answer без плана и вопросов, подсказки ограничены тремя", () => {
    const raw = JSON.stringify({ mode: "answer", reply: "У ведра 12 л **45 заказов**.", questions: ["лишний?"], selected: [{ nmId: "1", why: "w" }], suggestions: ["Составь план по ведру", "Покажи рекламу", "Что с остатком?", "четвёртая"] });
    const t = parseChatTurn(raw, products, 2);
    assert.equal(t.mode, "answer");
    assert.equal(t.questions.length, 0);
    assert.equal(t.selected.length, 0);
    assert.equal(t.suggestions?.length, 3);
    assert.match(t.reply, /45 заказов/);
  });

  it("answer с пустым ответом даёт понятный текст", () => {
    assert.match(parseChatTurn(JSON.stringify({ mode: "answer", reply: "" }), products, 0).reply, /Повторите вопрос/);
  });

  it("блоки ответа: только известные товары, задачи и статьи, не больше двух", () => {
    const ctx = { products, tasksByNm: new Map([["1", ["Проверить минус на 1 продаже"]]]), kb: (id: string) => (id === "kb-1" ? { title: "Комиссии WB", summary: "Как считается комиссия.", branch: "wb" as const } : null) };
    const raw = JSON.stringify({
      blocks: [
        { type: "products", title: "Какой товар?", nmIds: ["1", "999", 2, "1"] },
        { type: "product", nmId: "999" },
        { type: "task", nmId: "1", title: "Проверить минус на 1 продаже" },
        { type: "task", nmId: "1", title: "Выдуманная задача" },
        { type: "article", id: "kb-1" },
        { type: "section", id: "analytics" },
        { type: "section", id: "выдуманный" },
        { type: "article", id: "нет-такой" },
        { type: "product", nmId: "1" },
      ],
    });
    const blocks = parseChatBlocks(raw, ctx);
    assert.equal(blocks.length, 2, "не больше двух");
    assert.equal(parseChatBlocks(JSON.stringify({ blocks: [{ type: "section", id: "analytics" }, { type: "section", id: "analytics" }, { type: "section", id: "нет" }] }), ctx).length, 1, "раздел: только из списка и без повторов");
    assert.deepEqual(blocks[0], { type: "products", title: "Какой товар?", nmIds: ["1", "2"] });
    assert.deepEqual(blocks[1], { type: "task", nmId: "1", title: "Проверить минус на 1 продаже" });
  });
  it("без блоков или с мусором вместо них: пустой список", () => {
    const ctx = { products, tasksByNm: new Map(), kb: () => null };
    assert.deepEqual(parseChatBlocks(JSON.stringify({ blocks: "x" }), ctx), []);
    assert.deepEqual(parseChatBlocks("не json", ctx), []);
  });

  it("товары под слова владельца: ведро 10л находит все упаковки и не берёт другой объём", () => {
    const mk = (nmId: string, title: string) => ({ ...products[0]!, nmId, title });
    const list = [mk("1", "Строительное ведро 10л, 1шт"), mk("2", "Строительное ведро 10 л, 5шт"), mk("3", "Строительное ведро 12л, 3шт"), mk("4", "Основа для кашпо 16л")];
    assert.deepEqual(productsMatching("подскажи цену строительного ведра 10л", list), ["1", "2"]);
    assert.deepEqual(productsMatching("цена", list), []);
  });
});

import { quickAnswers as __quickAnswers } from "./chat";
it("quickAnswers: да/нет, варианты, открытые вопросы без кнопок", () => {
  assert.deepEqual(__quickAnswers("Хотите, чтобы я учёл рекламу?"), ["Да", "Нет"]);
  assert.deepEqual(__quickAnswers("Сколько дней наблюдать?"), []);
  assert.deepEqual(__quickAnswers("Какой товар вы имеете в виду?"), []);
  assert.deepEqual(__quickAnswers("Снижать цену или повышать ставку?"), ["Снижать цену", "Повышать ставку"]);
  assert.deepEqual(__quickAnswers("Без вопросительного знака"), []);
});

import { ensureTaskBlocks as __ensureTaskBlocks, type ChatTaskRef as __Ref } from "./chat";
it("ensureTaskBlocks: показывает настоящие задачи, критичные первыми, не вмешивается в просьбу создать", () => {
  const products = [{ nmId: "1", title: "Ведро строительное 10 л", facts: {}, tasks: [], ads: [], adsOther: [], promos: [], promoOpen: [], clubDiscount: null, card: undefined }] as unknown as ChatProduct[];
  const list: __Ref[] = [
    { id: "a", nmId: "1", title: "Излишек запаса", severity: "important", category: "stock" },
    { id: "b", nmId: "1", title: "Нулевой остаток", severity: "critical", category: "stock" },
    { id: "c", nmId: "2", title: "Чужая", severity: "critical", category: "ads" },
  ];
  const r = __ensureTaskBlocks([], "Какие есть задачи по ведру?", products, list);
  assert.equal(r[0]?.type, "tasks");
  assert.deepEqual((r[0] as { items: Array<{ id: string }> }).items.map((x) => x.id), ["b", "a"]);
  assert.equal(__ensureTaskBlocks([], "Покажи критичные задачи", products, list).length, 1);
  assert.equal(__ensureTaskBlocks([], "Поставь задачу снизить цену", products, list).length, 0);
});

import { leadText as __lead, ensureAnalyticsBlocks as __chart } from "./chat";
it("leadText оставляет подводку без списка; quickAnswers видит варианты в двух предложениях; график по просьбе", () => {
  assert.equal(__lead("В магазине 13 вариантов. Остатки:\n- Ведро 1 — 98 шт.\n- Ведро 2 — 97 шт.\n\nВсего 195."), "В магазине 13 вариантов. Остатки:");
  assert.equal(__lead("- a\n- b"), "Вот что есть в кабинете:");
  assert.deepEqual(__quickAnswers("Поднять или снизить цену на 1 ₽? Можно обрабатывать партиями по 6 штук?"), ["Поднять", "Снизить"]);
  const c = __chart([], "покажи график продаж в штуках за последние 28 дней", []);
  assert.deepEqual(c[0], { type: "analytics", view: "trend", days: 28, part: "orders" });
  assert.equal((__chart([], "покажи куда уходит выручка", [])[0] as { view: string }).view, "money");
  assert.equal((__chart([], "покажи на сколько дней хватит остатков", [])[0] as { view: string }).view, "stock");
  assert.equal((__chart([], "покажи ДРР по рекламе за неделю", [])[0] as { view: string; days: number }).days, 7);
  assert.equal(__chart([], "привет", []).length, 0);
});

import { ensurePriceEditBlocks as __price } from "./chat";
it("ensurePriceEditBlocks: товар по названию, число из «до N», не трогает планы", () => {
  const products = [{ nmId: "111111", title: "Ведро строительное 12л 15шт" }, { nmId: "222222", title: "Лопата" }] as unknown as ChatProduct[];
  const r = __price([], ["поменяй скидку у ведра строительного 12л 15шт с -2 до 0"], products);
  assert.deepEqual(r[0], { type: "price_edit", nmId: "111111", field: "discount", value: 0 });
  assert.equal(__price([], ["составь план по скидке ведра"], products).length, 0);
  assert.equal(__price([], ["измени цену у всех товаров"], products).length, 0);
});

import { ensureEventsBlocks as __events } from "./chat";
it("ensureEventsBlocks и части экранов: новости за неделю, реклама, остатки, просевшие товары", () => {
  assert.deepEqual(__events([], "расскажи последние новости за последние 7 дней, которые меня касаются")[0], { type: "events", days: 7 });
  assert.deepEqual(__events([], "что произошло с рекламой за месяц")[0], { type: "events", days: 30, group: "ads" });
  assert.equal(__events([], "привет").length, 0);
  assert.deepEqual(__chart([], "покажи какие товары просели", [])[0], { type: "analytics", view: "products", days: 28, part: "worst" });
  assert.equal((__chart([], "покажи на сколько дней хватит остатков", [])[0] as { part: string }).part, "low");
  assert.equal((__chart([], "покажи излишек запаса", [])[0] as { part: string }).part, "over");
});

import { stripLinks as __strip } from "./chat";
it("stripLinks убирает адреса и пустые скобки", () => {
  assert.equal(__strip("Комиссия 7% ([seller.wildberries.ru](https://seller.wildberries.ru/x?a=1)) и ещё (https://a.b/c) тут https://z.z ."), "Комиссия 7% (seller.wildberries.ru) и ещё тут.");
});

import { buildChatAction as __act, ensureInfoBlocks as __info, leadText as __lead2, storeDigest as __digest } from "./chat";
it("buildChatAction: проверяет кампанию, товар и границы; ensureInfoBlocks; leadText держит вывод", () => {
  const products = [{ nmId: "111111", title: "Ведро", facts: { stock: 100, orders_28d: 28, orders_prev_28d: 40 }, clubDiscount: 3 }] as unknown as ChatProduct[];
  const campaigns = [{ id: "7", name: "Кампания", status: 9, statusLabel: "Идут показы", paymentType: "cpc", bids: [{ nmId: "111111", searchRub: 100 }], dailyLimit: null }];
  const ctx = { products, campaigns };
  assert.deepEqual(__act({ op: "pause", campaignId: "7" }, ctx), { type: "pause", campaignId: "7" });
  assert.equal(__act({ op: "pause", campaignId: "999" }, ctx), null);
  assert.deepEqual(__act({ op: "bid", campaignId: "7", nmId: "111111", bidRub: 150 }, ctx), { type: "bid", advertId: "7", nmId: "111111", bidRub: 150, previousBidRub: 100 });
  assert.equal(__act({ op: "bid", campaignId: "7", nmId: "111111", bidRub: 99999 }, ctx), null);
  assert.equal(__act({ op: "deposit", campaignId: "7", sumRub: 700 }, ctx), null);
  assert.equal(__act({ op: "deposit", campaignId: "7", sumRub: 1000 }, ctx)?.type, "deposit");
  assert.equal(__act({ op: "daily_limit", campaignId: "7", limitRub: 500 }, ctx), null);
  assert.equal(__act({ op: "club_discount", nmId: "111111", clubPercent: 5 }, ctx)?.type, "club_discount");
  assert.equal((__info([], "какие отзывы без ответа")[0] as { kind: string }).kind, "reviews");
  assert.equal((__info([], "какие акции сейчас")[0] as { kind: string }).kind, "promos");
  assert.equal((__info([], "покажи поставки")[0] as { kind: string }).kind, "supplies");
  assert.equal(__lead2("На складе хватит на **28 дней**.\n\nЭто нормально, но два товара закончатся раньше.\n\nТретий абзац.\n- a"), "На складе хватит на **28 дней**.\n\nЭто нормально, но два товара закончатся раньше.\n\nТретий абзац.");
  assert.equal(__digest(products).store_days_of_stock, 100);
});

import { cleanOptions as __opts } from "./chat";
it("cleanOptions: варианты от модели чистятся, одиночные и длинные отбрасываются", () => {
  assert.deepEqual(__opts([["Да", "Нет"], ["Только", "Только"], "x"], 3), [["Да", "Нет"], [], []]);
  assert.equal(__opts([[]], 1), undefined);
  assert.deepEqual(__opts([["3 дня", "7 дней", "14 дней", "30 дней", "90 дней"]], 1), [["3 дня", "7 дней", "14 дней", "30 дней"]]);
});

import { editStrategy as __edit } from "./chat-plan-edit";
it("editStrategy: убрать, сдвинуть, переписать, добавить шаг; границы", () => {
  const base = { goal: "g", steps: [{ step: "Один шаг", by: "human", day: 0, when: "сразу", action: null }, { step: "Второй шаг", by: "human", day: 3, when: "через 3 дн.", action: null }, { step: "Пауза", by: "program", day: 5, when: "через 5 дн.", action: { type: "ads_pause", campaignId: "1", reason: "r" } }], checks: [], success: [], guards: [] } as never;
  const r1 = __edit(base, { op: "remove_step", stepIndex: 1 });
  assert.ok("strategy" in r1 && r1.strategy.steps.length === 2);
  const r2 = __edit(base, { op: "change_day", stepIndex: 0, day: 10 });
  assert.ok("strategy" in r2 && r2.strategy.steps[2]!.day === 10);
  assert.ok("error" in __edit(base, { op: "change_text", stepIndex: 2, text: "Новый текст шага" }));
  assert.ok("error" in __edit(base, { op: "remove_step", stepIndex: 9 }));
  assert.ok("error" in __edit(base, { op: "change_day", stepIndex: 0, day: 400 }));
  const r3 = __edit(base, { op: "add_step", day: 4, text: "Сфотографировать товар в комплекте" });
  assert.ok("strategy" in r3 && r3.strategy.steps.length === 4);
});

import { stripLinks as __strip2 } from "./chat";
import { classifyIntent as __ci2 } from "./intent";
it("stripLinks убирает теги цитат; «поставки» не путаются со ставками", () => {
  assert.equal(__strip2('Факт <cite index="8-7,8-8">про индекс</cite> и ещё.'), "Факт про индекс и ещё.");
  assert.notEqual(__ci2("покажи поставки"), "ads");
  assert.equal(__ci2("подними ставку по рекламе"), "task");
});

describe("поручения из чата: время и срок спрашиваем, а не выдумываем", () => {
  const raw = (order: Record<string, unknown>) => "```json\n" + JSON.stringify({ blocks: [{ type: "order", title: "Т", kind: "when_orders", params: { belowOrders: 10, days: 1, then: "notify", text: "Мало" }, limits: {}, mode: "ask", ...order }] }) + "\n```";
  const ctx = { ownerText: "", products, tasksByNm: new Map<string, string[]>(), kb: () => null };

  it("каждый день без названного времени и срока: два вопроса, карточки нет", () => {
    const r = raw({ schedule: { type: "daily", time: "09:00" } });
    const gap = orderGaps(r);
    assert.deepEqual(gap?.questions, ["Во сколько по Москве это должно происходить?", "На сколько дней поручение должно работать?"]);
    assert.equal(parseChatBlocks(r, ctx).some((b) => b.type === "order"), false);
  });

  it("время и срок подтверждены владельцем: карточка создаётся", () => {
    const r = raw({ schedule: { type: "daily", time: "08:30", durationDays: 14 }, confirmed: ["time", "duration"] });
    assert.equal(orderGaps(r), null);
    assert.equal(parseChatBlocks(r, ctx).some((b) => b.type === "order"), true);
  });

  it("проверка каждые N часов: время суток не нужно, а срок нужен", () => {
    const noEnd = raw({ schedule: { type: "check", everyMinutes: 180 } });
    assert.deepEqual(orderGaps(noEnd)?.questions, ["На сколько дней поручение должно работать?"]);
    assert.equal(orderGaps(raw({ schedule: { type: "check", everyMinutes: 180, durationDays: 7 } })), null);
    assert.equal(orderGaps(raw({ schedule: { type: "check", everyMinutes: 180 }, confirmed: ["duration"] })), null);
  });

  it("разовое поручение: срок не нужен, время нужно", () => {
    const once = raw({ kind: "remind", params: { text: "Позвонить" }, schedule: { type: "once", at: "2030-01-01T07:00:00Z" } });
    assert.deepEqual(orderGaps(once)?.questions, ["Во сколько по Москве это должно происходить?"]);
    assert.equal(orderGaps(raw({ kind: "remind", params: { text: "Позвонить" }, schedule: { type: "once", at: "2030-01-01T07:00:00Z" }, confirmed: ["time"] })), null);
  });
});

describe("умные быстрые ответы про время и срок", () => {
  it("«утром» даёт часы с 6 до 10, «вечером» с 18 до 21", () => {
    assert.deepEqual(timeOptions("каждое утро присылай"), ["06:00", "07:00", "08:00", "09:00", "10:00"]);
    assert.deepEqual(timeOptions("напомни вечером"), ["18:00", "19:00", "20:00", "21:00"]);
    assert.deepEqual(timeOptions("в обед"), ["12:00", "13:00", "14:00"]);
    assert.equal(timeOptions("раз в день").length, 5);
  });

  it("варианты подставляются только к вопросам про время и срок", () => {
    const o = smartOrderOptions(["Во сколько по Москве?", "На сколько дней поручение должно работать?", "Какую кампанию?"], [["x"], ["y"], ["Кампания 1"]], "каждое утро");
    assert.deepEqual(o?.[0], ["06:00", "07:00", "08:00", "09:00", "10:00"]);
    assert.deepEqual(o?.[1], ["7 дней", "14 дней", "30 дней", "Пока не остановлю"]);
    assert.deepEqual(o?.[2], ["Кампания 1"]);
    assert.equal(smartOrderOptions(["Какую кампанию?"], [["А"]], "утром")?.[0]?.[0], "А");
  });
});
