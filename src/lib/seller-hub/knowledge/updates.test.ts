import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { KB_ARTICLES, kbArticle, kbArticlesOf, kbCategories } from "./index";
import { applyKbUpdates, type KbUpdates } from "./updates";

describe("автообновления базы знаний в памяти", () => {
  it("добавляет пересказанную статью и категорию, меняет цифру точечно, повторный вызов ничего не ломает", () => {
    const target = kbArticle("w-logistics")!;
    const before = target.body;
    const find = "| Короб, суперсейф, поштучная паллета | 0,08 ₽ в день за литр |";
    assert.equal(before.split(find).length, 2);
    const count = KB_ARTICLES.length;
    const updates: KbUpdates = {
      autoArticles: [{ id: "w-auto-a-1", branch: "wb", category: "w-auto", title: "Пересказ", summary: "Кратко о статье справки.", body: "Суть.\n\n## Раздел\nТекст." }],
      patches: { "w-logistics": [{ find, replace: find.replace("0,08", "0,09") }] },
      renames: [],
      checkedAt: "2026-11-10T10:00:00Z",
      feed: [],
    };
    assert.equal(applyKbUpdates(updates), true);
    assert.equal(KB_ARTICLES.length, count + 1);
    assert.equal(kbArticlesOf("w-auto").length, 1);
    assert.ok(kbCategories("wb").some((c) => c.id === "w-auto"));
    assert.ok(target.body.includes("0,09 ₽ в день за литр"));
    assert.equal(target.body.length, before.length);
    // Повтор: ничего не меняется и правка не накладывается дважды.
    assert.equal(applyKbUpdates(updates), false);
    assert.equal(KB_ARTICLES.length, count + 1);
    // Правку отозвали: текст возвращается к исходному.
    assert.equal(applyKbUpdates({ ...updates, patches: {} }), true);
    assert.equal(target.body, before);
  });

  it("переименование меняет слово целиком во всех статьях WB и откатывается", () => {
    const fbs = kbArticle("w-fbs")!;
    const before = { title: fbs.title, body: fbs.body };
    assert.ok(/FBS/.test(before.body));
    const up: KbUpdates = { autoArticles: [], patches: {}, renames: [{ from: "FBS", to: "LBS" }], checkedAt: null, feed: [] };
    assert.equal(applyKbUpdates(up), true);
    assert.ok(!/FBS/.test(fbs.body) && /LBS/.test(fbs.body) && fbs.title.includes("LBS") === before.title.includes("FBS"));
    assert.equal(kbArticle("k-what-is")!.body.includes("LBS"), false);
    assert.equal(applyKbUpdates({ ...up, renames: [] }), true);
    assert.equal(fbs.body, before.body);
    assert.equal(fbs.title, before.title);
  });
});
