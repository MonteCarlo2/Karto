import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { friendlyWbError } from "@/lib/seller-hub/friendly-errors";
import { campaignStep, detectQuickCommand, handleDepositSumStep, priceStep, stepForCallback } from "./quick-commands";
import { progressFrame, withProgress } from "./progress";

const snapshot = {
  items: [
    { externalId: "11", title: "Строительное ведро 10л, 3шт", price: 1000, discountPercent: 20 },
    { externalId: "12", title: "Строительное ведро 12л, 15шт", price: 1500, discountPercent: 10 },
    { externalId: "13", title: "Кашпо 16л", price: 700, discountPercent: 5 },
  ],
  ads: {
    campaigns: [
      { id: "101", name: "Кампания от 05.10.2026", status: 9, statusLabel: "Активна", budget: 300 },
      { id: "102", name: "Кампания от 16.11.2026", status: 9, statusLabel: "Активна", budget: 0 },
      { id: "103", name: "Старая", status: 11, statusLabel: "На паузе", budget: 50 },
      { id: "104", name: "Готовая", status: 7, statusLabel: "Завершена" },
    ],
  },
  adsStats: { campaigns: [{ advertId: "101", spend: 752 }] },
} as unknown as SellerCatalogSnapshot;

describe("быстрые команды: распознавание", () => {
  it("пауза, запуск, пополнение", () => {
    assert.deepEqual(detectQuickCommand("останови рекламную компанию"), { kind: "pause" });
    assert.deepEqual(detectQuickCommand("компанию 1 хочу остановить"), { kind: "pause" });
    assert.deepEqual(detectQuickCommand("Поставь кампанию на паузу"), { kind: "pause" });
    assert.deepEqual(detectQuickCommand("запусти рекламу"), { kind: "resume" });
    assert.deepEqual(detectQuickCommand("пополни бюджет компании"), { kind: "deposit", sum: null });
    assert.deepEqual(detectQuickCommand("пополни бюджет на 1 500 ₽"), { kind: "deposit", sum: 1500 });
    assert.deepEqual(detectQuickCommand("закинь на рекламу на 2 тыс"), { kind: "deposit", sum: 2000 });
  });

  it("цена: проценты, направление, абсолютное значение, запрос товара", () => {
    assert.deepEqual(detectQuickCommand("подними цену на строительное ведро 10 литров на 3%"), { kind: "price", direction: 1, pct: 3, value: null, query: "строительное ведро 10 литров" });
    assert.deepEqual(detectQuickCommand("снизь цену на кашпо на 5 процентов"), { kind: "price", direction: -1, pct: 5, value: null, query: "кашпо" });
    const abs = detectQuickCommand("поставь цену 1200 на кашпо");
    assert.equal(abs?.kind, "price");
    assert.equal((abs as { value: number }).value, 1200);
    assert.equal((abs as { query: string }).query, "кашпо");
  });

  it("вопросы и чужие фразы не считаются командой", () => {
    assert.equal(detectQuickCommand("какая цена на ведро"), null);
    assert.equal(detectQuickCommand("как идёт реклама"), null);
    assert.equal(detectQuickCommand("сколько заказов сегодня"), null);
    assert.equal(detectQuickCommand("что такое пауза в рекламе и как её использовать правильно для начинающих продавцов"), null);
  });
});

describe("быстрые команды: шаги", () => {
  it("пауза: предлагает только активные кампании кнопками", () => {
    const r = campaignStep("pause", snapshot, null);
    assert.equal(r.keyboard?.length, 3);
    assert.match(JSON.stringify(r.keyboard), /qa:p:101/);
    assert.ok(!JSON.stringify(r.keyboard).includes("qa:p:103"));
    assert.match(r.html, /Какую кампанию остановить/);
    assert.match(JSON.stringify(r.keyboard), /752/);
  });

  it("запуск: единственная кампания на паузе выбирается сама и даёт карточку", () => {
    const r = campaignStep("resume", snapshot, null);
    assert.deepEqual(r.action, { type: "resume", campaignId: "103" });
  });

  it("нет подходящих кампаний: понятный ответ без кнопок", () => {
    const none = { ...snapshot, ads: { campaigns: [] } } as unknown as SellerCatalogSnapshot;
    const r = campaignStep("pause", none, null);
    assert.equal(r.keyboard, undefined);
    assert.match(r.html, /нет активных кампаний/);
    assert.match(campaignStep("pause", null, null).html, /нет активных кампаний/);
  });

  it("пополнение: сначала выбор кампании, потом суммы, потом карточка", () => {
    const pick = campaignStep("deposit", snapshot, null);
    assert.match(JSON.stringify(pick.keyboard), /qa:d:101/);
    const amount = stepForCallback("qa:d:101", snapshot)!;
    assert.match(JSON.stringify(amount.keyboard), /qa:s:101:1000/);
    assert.match(amount.html, /На сколько пополнить/);
    assert.deepEqual(stepForCallback("qa:s:101:1000", snapshot)!.action, { type: "deposit", campaignId: "101", sumRub: 1000 });
    // Сумма названа сразу: после выбора кампании сразу карточка.
    assert.deepEqual(stepForCallback("qa:d:102:1500", snapshot)!.action, { type: "deposit", campaignId: "102", sumRub: 1500 });
    // Меньше минимума WB: карточки нет, снова выбор суммы с пояснением.
    const small = stepForCallback("qa:d:102:500", snapshot)!;
    assert.equal(small.action, undefined);
    assert.match(small.html, /Минимальное пополнение/);
    assert.match(stepForCallback("qa:s:999:500", snapshot)!.html, /не найдена/i);
  });

  it("цена: один товар сразу карточка, несколько товаров кнопки, без процента кнопки шагов", () => {
    const one = priceStep({ kind: "price", direction: 1, pct: 5, value: null, query: "кашпо" }, snapshot);
    assert.deepEqual(one.action, { type: "price_edit", nmId: "13", field: "price", value: 735, prevPrice: 700, prevDiscount: 5, title: "Кашпо 16л" });
    const many = priceStep({ kind: "price", direction: -1, pct: 3, value: null, query: "строительное ведро" }, snapshot);
    assert.equal(many.keyboard?.length, 3);
    assert.match(JSON.stringify(many.keyboard), /qa:u:11:-3/);
    const noPct = priceStep({ kind: "price", direction: 1, pct: null, value: null, query: "кашпо" }, snapshot);
    assert.match(JSON.stringify(noPct.keyboard), /qa:u:13:3/);
    assert.ok(!JSON.stringify(noPct.keyboard![0]).includes("-"));
    assert.match(priceStep({ kind: "price", direction: 1, pct: 3, value: null, query: "самокат" }, snapshot).html, /Не нашёл такой товар/);
    assert.deepEqual(stepForCallback("qa:u:12:-10", snapshot)!.action, { type: "price_edit", nmId: "12", field: "price", value: 1350, prevPrice: 1500, prevDiscount: 10, title: "Строительное ведро 12л, 15шт" });
    assert.equal(stepForCallback("ax:y:abc12345", snapshot), null);
    assert.equal(stepForCallback("qa:w:1", snapshot), null);
  });
});

describe("дружелюбные ошибки и анимация ожидания", () => {
  it("сырые ошибки Wildberries превращаются в понятные", () => {
    assert.match(friendlyWbError("advertChangeStatusViaGRPC: Not Found: advert not found"), /Кампания не найдена/);
    assert.match(friendlyWbError("429 Too Many Requests"), /подождать/);
    assert.match(friendlyWbError("fetch failed"), /Нет связи/);
    assert.match(friendlyWbError("401 Unauthorized"), /токен/i);
    assert.match(friendlyWbError("{\"error\":\"x\"}"), /не принял изменение/);
    assert.match(friendlyWbError(""), /не принял изменение/);
    assert.equal(friendlyWbError("Ставка не подтверждена"), "Ставка не подтверждена");
    for (const raw of ["advertChangeStatusViaGRPC: Not Found", "TypeError: x is not a function", "ECONNRESET"]) assert.ok(!/grpc|TypeError|ECONN/i.test(friendlyWbError(raw)));
  });

  it("кадры ожидания меняются и не повторяются подряд", () => {
    const phrases = ["Думаю", "Сверяю цифры"];
    const frames = Array.from({ length: 12 }, (_, i) => progressFrame(phrases, i));
    for (let i = 1; i < frames.length; i += 1) assert.notEqual(frames[i], frames[i - 1]);
    assert.match(frames[0]!, /Думаю/);
    assert.match(frames[4]!, /Сверяю цифры/);
  });

  it("долгий ответ: сообщение «Думаю» появляется, правится и исчезает; быстрый ответ без него", async () => {
    const log: string[] = [];
    const api = { typing: async () => undefined, send: async () => (log.push("send"), 7), edit: async () => void log.push("edit"), remove: async () => void log.push("remove") };
    const slow = await withProgress(1, ["Думаю"], async () => (await new Promise((r) => setTimeout(r, 120)), "готово"), { api, delayMs: 20, tickMs: 30 });
    assert.equal(slow, "готово");
    assert.equal(log[0], "send");
    assert.ok(log.includes("edit"));
    assert.equal(log.at(-1), "remove");
    log.length = 0;
    const fast = await withProgress(1, ["Думаю"], async () => "быстро", { api, delayMs: 50, tickMs: 30 });
    assert.equal(fast, "быстро");
    assert.deepEqual(log, []);
  });

  it("сбой анимации не мешает ответу и ошибка ответа не теряется", async () => {
    const bad = { typing: async () => { throw new Error("x"); }, send: async () => { throw new Error("y"); }, edit: async () => { throw new Error("z"); }, remove: async () => { throw new Error("w"); } };
    assert.equal(await withProgress(1, ["Думаю"], async () => (await new Promise((r) => setTimeout(r, 60)), 5), { api: bad, delayMs: 10, tickMs: 15 }), 5);
    await assert.rejects(withProgress(1, ["Думаю"], async () => { throw new Error("агент упал"); }, { api: bad, delayMs: 10, tickMs: 15 }), /агент упал/);
  });
});

describe("одинаковые названия кампаний", () => {
  it("различаются номером в списке и в карточке", async () => {
    const { campaignLabel } = await import("./quick-commands");
    const { cardCtx } = await import("./action-cards");
    const dup = { ads: { campaigns: [{ id: "40000101", name: "Кампания от 05.10.2026" }, { id: "40000202", name: "Кампания от 05.10.2026" }, { id: "40000303", name: "Другая" }] } } as unknown as SellerCatalogSnapshot;
    const all = dup.ads!.campaigns as never[];
    assert.equal(campaignLabel(all[0]!, all), "Кампания от 05.10.2026 №0101");
    assert.equal(campaignLabel(all[2]!, all), "Другая");
    assert.equal(cardCtx(dup).campaignName("40000202"), "Кампания от 05.10.2026 №0202");
    assert.equal(cardCtx(dup).campaignName("40000303"), "Другая");
  });
});

describe("правила WB, назад, закрыть, своя сумма, автопополнение", () => {
  it("суммы только от минимума WB, есть «Назад» и «Закрыть»", () => {
    const step = stepForCallback("qa:d:101", snapshot)!;
    const kb = JSON.stringify(step.keyboard);
    assert.ok(!kb.includes("qa:s:101:500\""));
    for (const sum of [1000, 2000, 5000]) assert.match(kb, new RegExp("qa:s:101:" + sum));
    assert.match(kb, /qa:k:d/);
    assert.match(kb, /qa:x/);
    assert.match(step.html, /Минимум пополнения у Wildberries/);
    assert.match(JSON.stringify(stepForCallback("qa:s:101:200", snapshot)), /Минимальное пополнение/);
    assert.deepEqual(stepForCallback("qa:x", snapshot), { html: "", close: true });
    assert.match(JSON.stringify(stepForCallback("qa:k:d", snapshot)!.keyboard), /qa:d:102/);
  });

  it("своя сумма ждёт число; автопополнение даёт карточку поручения", () => {
    const c = stepForCallback("qa:c:101", snapshot)!;
    assert.deepEqual(c.awaitSum, { campaignId: "101" });
    const z = stepForCallback("qa:z:101:2000", snapshot)!.action as { type: string; input: { kind: string; params: { topUpRub: number; belowRub: number }; limits: { maxPerDayRub: number }; mode: string } };
    assert.equal(z.type, "order_create");
    assert.equal(z.input.kind, "ads_deposit");
    assert.equal(z.input.params.topUpRub, 2000);
    assert.equal(z.input.limits.maxPerDayRub, 4000);
    assert.equal(z.input.mode, "ask");
    assert.match(JSON.stringify(stepForCallback("qa:z:101:500", snapshot)), /Минимальное пополнение/);
  });

  it("ввод своей суммы: число, слишком мало, отмена, не число", async () => {
    const sent: string[] = [];
    const cards: unknown[] = [];
    let cleared = 0;
    const deps = {
      snapshot: async () => snapshot,
      sendHtml: async (_c: number, html: string) => void sent.push(html),
      sendCard: async (i: { action: unknown }) => void cards.push(i.action),
      sandbox: async () => false,
      clearSession: async () => void cleared++,
      edit: async () => undefined,
      remove: async () => undefined,
      setSession: async () => undefined,
    };
    const ctx = { userId: "u", chatId: 1, telegramUserId: 2 };
    const pay = { campaignId: "101" };
    await handleDepositSumStep("1500", pay, ctx, deps);
    assert.deepEqual(cards.at(-1), { type: "deposit", campaignId: "101", sumRub: 1500 });
    await handleDepositSumStep("2 тыс", pay, ctx, deps);
    assert.deepEqual(cards.at(-1), { type: "deposit", campaignId: "101", sumRub: 2000 });
    const before = cards.length;
    await handleDepositSumStep("300", pay, ctx, deps);
    assert.equal(cards.length, before);
    assert.match(sent.at(-1)!, /не подходит/);
    await handleDepositSumStep("привет", pay, ctx, deps);
    assert.match(sent.at(-1)!, /Не понял сумму/);
    const clearedBefore = cleared;
    await handleDepositSumStep("отмена", pay, ctx, deps);
    assert.equal(cleared, clearedBefore + 1);
    await handleDepositSumStep("1000", { campaignId: "999" }, ctx, deps);
    assert.match(sent.at(-1)!, /Кампания не найдена/);
  });
});
