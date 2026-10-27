import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeCharacteristics } from "./card-characteristics";

const current = [{ id: 1, name: "Материал", value: ["сталь"] }, { id: 2, name: "Объем", value: 12 }];

describe("правка характеристик карточки", () => {
  it("меняет только названное по идентификатору, остальное сохраняет как есть", () => {
    const next = mergeCharacteristics(current, [{ id: 1, value: "сталь оцинкованная" }]) as Array<{ id: number; value: unknown }>;
    assert.deepEqual(next[0]!.value, ["сталь оцинкованная"]);
    assert.equal(next[1]!.value, 12);
    assert.deepEqual(current[0]!.value, ["сталь"]);
  });
  it("числовая характеристика пишется числом, новая добавляется", () => {
    const next = mergeCharacteristics(current, [{ id: 2, value: "15", numeric: true }, { id: 7, value: "Россия" }]) as Array<{ id: number; value: unknown }>;
    assert.equal(next[1]!.value, 15);
    assert.deepEqual(next[2], { id: 7, value: ["Россия"] });
  });
  it("мусор пропускается: пустые значения, нечисловое для числовой, неверный идентификатор", () => {
    assert.deepEqual(mergeCharacteristics(current, [{ id: 1, value: "  " }, { id: 2, value: "много", numeric: true }, { id: -3, value: "x" }]), current);
    assert.equal(mergeCharacteristics(current, undefined), current);
  });
});
