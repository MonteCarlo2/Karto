import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyKbPatches, diffWbHelp, renameCandidates, isWbHelpReadable, parseWbHelpArticle, parseWbHelpTree, unknownNumbers, validateKbPatch } from "./wb-help-parse";

const TREE = `x{"id":"670fe9cd-fc34-411e-b944-0e04658a9d22","slug":"prices","title":"Цены","articles":[{"id":"A-34","title":"Карантин цен","type":"article","slug":"price-quarantine"}]},{"id":"1ee00f33-a93c-4941-b480-da92b152c304","slug":"offer","title":"Оферта","articles":[{"id":"A-179","title":"1. Определения","type":"article","slug":"defs"}]}`;
const page = (lines: string[]) => lines.map((l) => `{"children":"${l}"}`).join(",");

describe("разбор справки WB", () => {
  it("дерево: статьи с категорией, оферта пропущена", () => {
    assert.deepEqual(parseWbHelpTree(TREE), [{ id: "A-34", title: "Карантин цен", slug: "price-quarantine", category: "Цены" }]);
  });

  it("статья: дата отдельно, служебные строки убраны, отпечаток не зависит от даты", () => {
    const a = parseWbHelpArticle(page(["Обновлено 04.08.2026", "Карантин цен", "Порог 33,3%", "Такой страницы нет"]), "Карантин цен");
    const b = parseWbHelpArticle(page(["Обновлено 05.09.2026", "Карантин цен", "Порог 33,3%"]), "Карантин цен");
    assert.equal(a.updated, "04.08.2026");
    assert.equal(a.text, "Порог 33,3%");
    assert.equal(a.hash, b.hash);
  });

  it("закрытая или пустая статья не читается", () => {
    assert.equal(isWbHelpReadable("Статья доступна только продавцам Wildberries. ".repeat(20)), false);
    assert.equal(isWbHelpReadable("коротко"), false);
  });

  it("сравнение: было и стало по строке с числом", () => {
    const facts = diffWbHelp("Вступление\nБазовый тариф на хранение 0,08 ₽ в день за литр", "Вступление\nБазовый тариф на хранение 0,09 ₽ в день за литр");
    assert.deepEqual(facts, [{ was: "Базовый тариф на хранение 0,08 ₽ в день за литр", now: "Базовый тариф на хранение 0,09 ₽ в день за литр" }]);
  });

  it("числа пересказа должны быть в первоисточнике", () => {
    assert.deepEqual(unknownNumbers("Штраф 25 000 ₽ и 3 шага", "штраф 25 000 ₽"), []);
    assert.deepEqual(unknownNumbers("Штраф 30 000 ₽", "штраф 25 000 ₽"), ["30000"]);
  });

  it("переименование: одно слово-название заменилось, обычные слова и числа не считаются", () => {
    assert.deepEqual(renameCandidates("Модель продаж FBS доступна всем", "Модель продаж LBS доступна всем"), [{ from: "FBS", to: "LBS" }]);
    assert.deepEqual(renameCandidates("Срок 5 дней", "Срок 7 дней"), []);
    assert.deepEqual(renameCandidates("Красный цвет FBS", "Синий цвет LBS"), []);
  });

  it("правка статьи: только числа, один раз в тексте, число есть в справке", () => {
    const body = "Хранение стоит **0,08 ₽ за литр в день**. Другое.";
    const ok = { articleId: "w-logistics", find: "0,08 ₽ за литр в день", replace: "0,09 ₽ за литр в день" };
    assert.equal(validateKbPatch(ok, body, "тариф 0,09 ₽ в день"), null);
    assert.equal(applyKbPatches(body, [ok]), "Хранение стоит **0,09 ₽ за литр в день**. Другое.");
    assert.match(validateKbPatch(ok, body, "тариф 0,10 ₽") ?? "", /нет в справке/);
    assert.match(validateKbPatch({ ...ok, replace: "0,09 ₽ за литр бесплатно" }, body, "0,09") ?? "", /не только числа/);
    assert.match(validateKbPatch({ ...ok, find: "нет такого" }, body, "0,09") ?? "", /не найден/);
  });
});
