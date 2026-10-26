import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { wbLimitFor } from "@/lib/seller-hub/wb-limits";
import { hourlyLoad, SYNC_SOURCES, syncSource } from "./sources";

describe("источники фонового сбора", () => {
  it("каждый путь есть в спецификации WB с известным лимитом (опечатка в пути иначе осталась бы незамеченной)", () => {
    for (const source of SYNC_SOURCES) {
      for (const endpoint of source.endpoints) {
        const limit = wbLimitFor(endpoint.method, endpoint.path);
        assert.equal(limit.known, true, `${source.id}: ${endpoint.method} ${endpoint.path} не найден в реестре лимитов`);
        assert.equal(limit.readOnly, true, `${source.id}: фон должен только читать, ${endpoint.method} ${endpoint.path} изменяет данные`);
      }
    }
  });

  it("у источников уникальные id и разумные частоты: не чаще 5 минут и не реже суток", () => {
    const ids = new Set(SYNC_SOURCES.map((s) => s.id));
    assert.equal(ids.size, SYNC_SOURCES.length);
    for (const source of SYNC_SOURCES) {
      assert.ok(source.everyMs >= 5 * 60_000 && source.everyMs <= 24 * 3_600_000, source.id);
    }
  });

  it("база (цены, остатки, заказы, реклама) и отзывы обновляются чаще аналитики: свежесть там, где человек меняет значения", () => {
    const fast = ["base", "feedbacks"].map((id) => syncSource(id as never).everyMs);
    const slow = ["funnel", "realization"].map((id) => syncSource(id as never).everyMs);
    assert.ok(Math.max(...fast) < Math.min(...slow));
  });

  for (const skus of [44, 1000, 5000]) {
    it(`расписание вписывается в лимиты WB с запасом при ${skus} товарах: фон занимает не больше половины лимита`, () => {
      const over = hourlyLoad(skus).filter((row) => row.share > 0.5);
      assert.deepEqual(over.map((r) => `${r.key}: ${(r.share * 100).toFixed(0)}%`), []);
    });
  }

  it("сервисный токен считается так же", () => {
    const over = hourlyLoad(1000, "service").filter((row) => row.share > 0.5);
    assert.deepEqual(over, []);
  });
});
