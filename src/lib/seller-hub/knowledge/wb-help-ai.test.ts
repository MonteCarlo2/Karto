import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { KB_ARTICLES } from "./index";
import { WB_HELP_MAP, validateAutoArticle } from "./wb-help-ai";

const source = "Одновременно можно запустить 5 акций сроком от 3 до 14 дней. Штраф 25 000 ₽.";
const article = (body: string) => ({ title: "Собственные акции продавца", summary: "Как запустить собственную акцию и что учесть.", keywords: [], body });
const filler = "Текст пересказа без чисел, который нужен только для длины. ".repeat(12);

describe("пересказ статей справки WB", () => {
  it("принимает текст, где все числа из справки", () => {
    assert.equal(validateAutoArticle(article(`${filler}\n\n## Сроки\nАкция идёт от 3 до 14 дней. Штраф 25 000 ₽.`), source, "Акции"), null);
  });
  it("отклоняет выдуманное число, упоминание подписки и текст без разделов", () => {
    assert.match(validateAutoArticle(article(`${filler}\n\n## Сроки\nАкция идёт до 30 дней.`), source, "Акции") ?? "", /нет в справке: 30/);
    assert.match(validateAutoArticle(article(`${filler}\n\n## Сроки\nНужна подписка Джем.`), source, "Акции") ?? "", /запрещённое/);
    assert.match(validateAutoArticle(article(filler), source, "Акции") ?? "", /нет разделов/);
  });
  it("карта справки ссылается только на существующие статьи", () => {
    const ids = new Set(KB_ARTICLES.map((a) => a.id));
    for (const [help, ours] of Object.entries(WB_HELP_MAP)) for (const id of ours) assert.ok(ids.has(id), `${help} → ${id}`);
  });
});
