import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeMinusPhrases, normalizeMinusPhrase, parseAdMinusRequest } from "./ads-minus";

describe("parseAdMinusRequest", () => {
  const base = { advertId: 1, nmId: 2, queries: ["ведро 10 л", "кашпо"], confirmCount: 2 };

  it("принимает корректный запрос", () => {
    const parsed = parseAdMinusRequest(base);
    assert.equal(parsed.ok, true);
  });

  it("не принимает пустой список — он стёр бы все минус-фразы", () => {
    assert.equal(parseAdMinusRequest({ ...base, queries: [], confirmCount: 0 }).ok, false);
  });

  it("не принимает без подтверждения количества", () => {
    assert.equal(parseAdMinusRequest({ ...base, confirmCount: undefined }).ok, false);
    assert.equal(parseAdMinusRequest({ ...base, confirmCount: 5 }).ok, false);
  });

  it("повторы с другим регистром считаются одной фразой", () => {
    const parsed = parseAdMinusRequest({ advertId: 1, nmId: 2, queries: ["Ведро", "ведро "], confirmCount: 1 });
    assert.equal(parsed.ok, true);
  });

  it("плохие id, слишком длинная фраза, не текст, слишком много фраз", () => {
    assert.equal(parseAdMinusRequest({ ...base, advertId: 0 }).ok, false);
    assert.equal(parseAdMinusRequest({ ...base, nmId: "2" }).ok, false);
    assert.equal(parseAdMinusRequest({ ...base, queries: ["а".repeat(201)], confirmCount: 1 }).ok, false);
    assert.equal(parseAdMinusRequest({ ...base, queries: [5], confirmCount: 1 }).ok, false);
    const many = Array.from({ length: 51 }, (_, i) => `фраза ${i}`);
    assert.equal(parseAdMinusRequest({ ...base, queries: many, confirmCount: 51 }).ok, false);
  });
});

describe("mergeMinusPhrases", () => {
  it("сохраняет уже стоящие фразы и добавляет только новые", () => {
    const { merged, added } = mergeMinusPhrases(["старая", "Ёлка"], ["новая", "елка", "СТАРАЯ"]);
    assert.deepEqual(merged, ["старая", "Ёлка", "новая"]);
    assert.deepEqual(added, ["новая"]);
  });

  it("нормализация: регистр, ё и пробелы", () => {
    assert.equal(normalizeMinusPhrase("  Ёлка   Новая "), "елка новая");
  });
});
