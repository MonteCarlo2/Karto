import assert from "node:assert/strict";
import { it } from "node:test";
import { stripLinks } from "./chat";

const LT = String.fromCharCode(60);

it("stripLinks убирает теги цитат поискового плагина", () => {
  const raw = `Для расчёта ${LT}cite index="8-7,8-8">WB анализирует заказы${LT}/cite> и всё.`;
  assert.equal(stripLinks(raw), "Для расчёта WB анализирует заказы и всё.");
});

import { classifyIntent } from "./intent";
it("web: «узнай как вб говорит…» идёт как поиск в интернете", () => {
  assert.equal(classifyIntent("узнай как вб говорит упаковывать свои товары кратко"), "web");
  assert.equal(classifyIntent("выясни в интернете актуальные тарифы"), "web");
  assert.notEqual(classifyIntent("сколько осталось ведра"), "web");
});

import { scrubInternal } from "./chat";
it("scrubInternal убирает технические имена полей", () => {
  assert.equal(scrubInternal("Ни один товар не закончился (out_or_low_count = 0). Дальше."), "Ни один товар не закончился. Дальше.");
  assert.equal(scrubInternal("Заказы orders_28d упали."), "Заказы упали.");
  assert.equal(scrubInternal("Обычный текст без полей."), "Обычный текст без полей.");
});

import { ensureInfoBlocks } from "./chat";
it("ответ на отзыв с текстом от владельца идёт без списка «без ответа»", () => {
  assert.deepEqual(ensureInfoBlocks([{ type: "info", kind: "reviews" }], "Подготовь ответ на отзыв: «Ведро пришло с трещиной на ручке, очень разочарован»"), []);
  assert.equal(ensureInfoBlocks([], "покажи отзывы без ответа").some((b) => b.type === "info"), true);
});

import { campaignOptions } from "./chat";
it("вопрос про кампанию получает настоящие кампании, дубли различаются номером", () => {
  const camps = [{ id: "111222", name: "Кампания от 16.11.2026" }, { id: "333444", name: "Кампания от 16.11.2026" }, { id: "555", name: "Ведро 10л" }];
  const r = campaignOptions(["На какую кампанию ставить пополнение?", "Остаток это баланс кампании?"], [["Кашпо 10л", "Ведро 10л"], ["Да", "Нет"]], camps);
  assert.deepEqual(r?.[0], ["Кампания от 16.11.2026 №1222", "Кампания от 16.11.2026 №3444", "Ведро 10л"]);
  assert.deepEqual(r?.[1], ["Да", "Нет"]);
  assert.deepEqual(campaignOptions(["Какой лимит?"], [["1000"]], camps), [["1000"]]);
});

import { ensurePriceEditBlocks } from "./chat";
it("многошаговая просьба и расписание не превращаются в разовую правку цены", () => {
  const blocks = [{ type: "price_edit" as const, nmId: "1", field: "price" as const, value: null }];
  assert.equal(ensurePriceEditBlocks(blocks, ["Первое: каждые 3 дня повышай цену на 1%. Второе: если это не поможет, снизь ставку"], []).some((b) => b.type === "price_edit"), false);
  assert.equal(ensurePriceEditBlocks(blocks, ["Каждый день снижай цену на 5%"], []).some((b) => b.type === "price_edit"), false);
  assert.equal(ensurePriceEditBlocks(blocks, ["подними цену на 3%"], []).some((b) => b.type === "price_edit"), true);
});
