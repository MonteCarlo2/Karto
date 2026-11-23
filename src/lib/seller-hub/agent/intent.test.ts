import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyIntent } from "./intent";

describe("вид запроса к агенту", () => {
  it("узнаёт план, задачу, цену, поиск, анализ, рекламу и отзывы", () => {
    assert.equal(classifyIntent("Составь план по ускорению продаж этого ведра"), "plan");
    assert.equal(classifyIntent("поставь на паузу кампанию без заказов"), "task");
    assert.equal(classifyIntent("подскажи цену строительного ведра 10л"), "product");
    assert.equal(classifyIntent("Как WB считает комиссию?"), "search");
    assert.equal(classifyIntent("почему падают заказы"), "analyze");
    assert.equal(classifyIntent("какой у меня ДРР по рекламе"), "ads");
    assert.equal(classifyIntent("что с отзывами без ответа"), "reviews");
    assert.equal(classifyIntent("привет"), "think");
  });
});

import { classifyIntent as __ci } from "./intent";
it("web: вопросы про интернет и свежие новости WB", () => {
  assert.equal(__ci("найди в интернете комиссии wildberries"), "web");
  assert.equal(__ci("какие последние новости WB для продавцов"), "web");
  assert.notEqual(__ci("сколько осталось ведра"), "web");
});

import { classifyIntent as classifyHowTo } from "./intent";
describe("вопросы «как сделать в кабинете WB» идут с поиском в интернете", () => {
  it("порядок действий ищем, данные магазина и команды не трогаем", () => {
    for (const q of ["как создать заказ ФБС на сайте вб", "что нажать чтобы по программе fbs его отгрузить", "как отгружать заказы по фбс", "как собрать заказ", "как работает схема FBS на Wildberries"]) assert.equal(classifyHowTo(q), "web", q);
    for (const q of ["как идёт реклама", "как у меня дела с заказами", "сколько заказов сегодня", "подними цену на ведро на 3%"]) assert.notEqual(classifyHowTo(q), "web", q);
  });
});
