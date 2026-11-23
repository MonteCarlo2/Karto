import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { KB_ARTICLES, KB_CATEGORIES, kbArticle, searchArticles } from "./index";

describe("база знаний", () => {
  it("идентификаторы статей уникальны, категории существуют", () => {
    const ids = KB_ARTICLES.map((a) => a.id);
    assert.equal(new Set(ids).size, ids.length);
    const cats = new Set(KB_CATEGORIES.map((c) => c.id));
    for (const a of KB_ARTICLES) assert.ok(cats.has(a.category), `${a.id}: нет категории ${a.category}`);
  });
  it("ветка статьи совпадает с веткой категории", () => {
    const branchOf = new Map(KB_CATEGORIES.map((c) => [c.id, c.branch]));
    for (const a of KB_ARTICLES) assert.equal(branchOf.get(a.category), a.branch, a.id);
  });
  it("связанные статьи существуют", () => {
    for (const a of KB_ARTICLES) for (const r of a.related ?? []) assert.ok(kbArticle(r), `${a.id} → ${r}`);
  });
  it("у каждой категории есть статьи, а у каждой статьи название, описание и текст", () => {
    for (const c of KB_CATEGORIES) assert.ok(KB_ARTICLES.some((a) => a.category === c.id), `пустая категория ${c.id}`);
    for (const a of KB_ARTICLES) {
      assert.ok(a.title.length > 5 && a.summary.length > 20 && a.body.length > 200, a.id);
    }
  });
  it("в тексте нет упоминания подписки Джем и расходов на нейросеть", () => {
    for (const a of KB_ARTICLES) {
      assert.doesNotMatch(`${a.title} ${a.summary} ${a.body}`, /джем|jam|\$|openrouter/i, a.id);
    }
  });
});

describe("поиск по базе знаний", () => {
  const top = (q: string) => searchArticles(KB_ARTICLES, q)[0]?.article.id;
  it("находит по словам продавца, а не только по названию", () => {
    assert.equal(top("что такое ДРР"), "k-ads-metrics");
    assert.equal(top("как вывести деньги"), "w-payout");
    assert.equal(top("карантин цен"), "w-price-quarantine");
    assert.equal(top("fbs или fbw что выбрать"), "w-models-choose");
    assert.equal(top("почему цифры не сходятся"), "k-faq-differs");
    assert.equal(top("упали продажи"), "w-sales-drop");
  });
  it("устойчив к окончаниям слов", () => {
    assert.equal(top("комиссии вайлдберриз"), "w-commission");
    assert.equal(top("себестоимости"), "k-cost");
  });
  it("пустой запрос и мусор ничего не находят", () => {
    assert.equal(searchArticles(KB_ARTICLES, "").length, 0);
    assert.equal(searchArticles(KB_ARTICLES, "щщщщ ъъъ").length, 0);
  });
});

it("поиск по разделам даёт фрагмент и раздел", async () => {
  const { searchSections } = await import("./search");
  const hits = searchSections(KB_ARTICLES, "как вывести деньги", 5);
  assert.ok(hits.length > 0);
  assert.ok(hits[0]!.snippet.length > 20);
  assert.equal(searchSections(KB_ARTICLES, "щщщщ ъъъ").length, 0);
});
