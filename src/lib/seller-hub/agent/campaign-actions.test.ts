import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ensureCampaignActions, pickCampaign, type ChatCampaign } from "./chat";

const camp = (id: string, name: string): ChatCampaign => ({ id, name, status: 9, statusLabel: "Идут показы", paymentType: "cpc", bids: [], dailyLimit: null });
const campaigns = [camp("1", "Кампания от 05.10.2026"), camp("2", "Кампания от 16.11.2026")];

describe("команды по кампании без участия модели", () => {
  it("кампания определяется по дате, одна кампания подходит без уточнения", () => {
    assert.equal(pickCampaign("пауза кампании от 16.11.2026", campaigns)?.id, "2");
    assert.equal(pickCampaign("пауза кампании", campaigns), null);
    assert.equal(pickCampaign("пауза кампании", [campaigns[0]!])?.id, "1");
  });
  it("пауза, запуск, пополнение и лимит", () => {
    assert.deepEqual(ensureCampaignActions([], "поставь на паузу кампанию от 16.11.2026", campaigns)[0], { type: "action", action: { type: "pause", campaignId: "2" } });
    assert.equal((ensureCampaignActions([], "запусти кампанию от 05.10.2026", campaigns)[0] as { action: { type: string } }).action.type, "resume");
    assert.deepEqual((ensureCampaignActions([], "пополни кампанию от 16.11.2026 на 1000 рублей", campaigns)[0] as { action: unknown }).action, { type: "deposit", campaignId: "2", sumRub: 1000 });
    assert.equal((ensureCampaignActions([], "поставь лимит расхода 2000 рублей на кампанию от 16.11.2026", campaigns)[0] as { action: { type: string } }).action.type, "daily_limit");
  });
  it("не угадывает: нет кампании, нет допустимой суммы, не про кампанию", () => {
    assert.equal(ensureCampaignActions([], "пополни кампанию на 1000 рублей", campaigns).length, 0);
    assert.equal(ensureCampaignActions([], "пополни кампанию от 16.11.2026 на 700 рублей", campaigns).length, 0);
    assert.equal(ensureCampaignActions([], "поставь на паузу цену", campaigns).length, 0);
  });
});

import { ensurePriceEditBlocks, ensureInfoBlocks, type ChatProduct } from "./chat";

describe("правка цены в процентах и устаревшие намерения", () => {
  const products = [{ nmId: "111111", title: "Ведро строительное 10л 5шт", facts: {}, tasks: [] }] as unknown as ChatProduct[];
  it("«подними цену на 3%» даёт pct, а старая просьба не липнет к новому вопросу", () => {
    const r = ensurePriceEditBlocks([], ["подними цену ведра строительного 10л 5шт на 3%"], products);
    assert.deepEqual(r[0], { type: "price_edit", nmId: "111111", field: "price", value: null, pct: 3 });
    const down = ensurePriceEditBlocks([], ["снизь цену ведра строительного 10л 5шт на 2%"], products);
    assert.equal((down[0] as { pct: number }).pct, -2);
    assert.equal(ensurePriceEditBlocks([], ["подними цену ведра строительного 10л 5шт на 3%", "помоги ответить на негативный отзыв про ведро"], products).length, 0);
  });
  it("просьба помочь с текстом отзыва не превращается в список отзывов", () => {
    assert.equal(ensureInfoBlocks([], "помоги ответить на негативный отзыв про качество").length, 0);
    assert.equal((ensureInfoBlocks([], "какие отзывы без ответа")[0] as { kind: string }).kind, "reviews");
  });
});

import { ensureAnalyticsBlocks } from "./chat";
describe("подсказка по словам молчит без явной просьбы показать данные", () => {
  it("вопросы без «покажи/график/воронка…» остаются на усмотрение модели", () => {
    assert.equal(ensureAnalyticsBlocks([], "почему упали заказы", []).length, 0);
    assert.equal(ensureAnalyticsBlocks([], "что такое оборачиваемость", []).length, 0);
    assert.equal((ensureAnalyticsBlocks([], "покажи график заказов", [])[0] as { view: string }).view, "trend");
  });
});
