import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyzeSearchTexts, tokens } from "./seo";
import type { SellerSearchText } from "./types";

const q = (text: string, frequency: number, avgPosition: number | null): SellerSearchText => ({
  text,
  nmId: "1",
  frequency,
  avgPosition,
  avgPositionDynamics: null,
  openCard: null,
  addToCart: null,
  openToCart: null,
  orders: null,
  cartToOrder: null,
  visibility: null,
});

describe("tokens", () => {
  it("нижний регистр, ё = е, без знаков, служебных и однобуквенных слов", () => {
    assert.deepEqual(tokens("Ведро для Мусора, 10 л  (ёмкость)"), ["ведро", "мусора", "10", "емкость"]);
  });
});

describe("analyzeSearchTexts", () => {
  const card = { title: "Строительное ведро 10 л", description: "Пластиковое ведро с ручкой для воды" };

  it("слова, которых нет в названии и описании, считаются недостающими; окончания не мешают", () => {
    const { rows } = analyzeSearchTexts(
      [q("ведро строительное", 100, 5), q("ведро пищевое с крышкой", 80, 25), q("ведра пластиковые", 50, null)],
      card,
    );
    assert.deepEqual(rows[0]!.missingWords, []);
    assert.deepEqual(rows[1]!.missingWords, ["пищевое", "крышкой"]);
    // «ведра» ~ «ведро», «пластиковые» ~ «пластиковое» по основе
    assert.deepEqual(rows[2]!.missingWords, []);
  });

  it("класс позиции: 1–10, 11–40, ниже или нет позиции", () => {
    const { rows } = analyzeSearchTexts([q("а1", 1, 3), q("а2", 1, 25), q("а3", 1, 80), q("а4", 1, null)], card);
    assert.deepEqual(rows.map((r) => r.positionClass), ["top10", "mid", "low", "low"]);
  });

  it("недостающие слова суммируются по частоте запросов и сортируются", () => {
    const { missingKeywords } = analyzeSearchTexts(
      [q("пищевое ведро", 100, 5), q("ведро пищевое с крышкой", 50, 30), q("ведро крышка", 10, 50)],
      card,
    );
    assert.deepEqual(missingKeywords.map((k) => [k.word, k.frequency]), [
      ["пищевое", 150],
      ["крышкой", 50],
      ["крышка", 10],
    ]);
  });

  it("куда расти: частые запросы (не ниже медианы), где вы не в топ-10", () => {
    const { growth } = analyzeSearchTexts(
      [q("а", 1000, 40), q("б", 500, 4), q("в", 800, 60), q("г", 10, 70)],
      card,
    );
    assert.deepEqual(growth.map((r) => r.text), ["а", "в"]);
  });

  it("пустой список не ломается", () => {
    const result = analyzeSearchTexts([], card);
    assert.deepEqual(result.rows, []);
    assert.deepEqual(result.growth, []);
  });
});
