import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LEVERS, capabilitiesPrompt } from "./capabilities";
import { jamSubscription } from "./ai-context";
import { STRATEGY_FORM } from "./ai-solver";

describe("сфера влияния агента", () => {
  it("реестр рычагов покрывает цену, карточку, рекламу, акции, остатки и покупателей, у каждого есть статус и описание", () => {
    const areas = new Set(LEVERS.map((l) => l.area));
    for (const a of ["Цена и скидки", "Карточка", "Реклама", "Акции", "Остатки и поставки", "Покупатели"]) assert.ok(areas.has(a), a);
    assert.ok(LEVERS.every((l) => l.what.length > 10 && ["action", "human_api", "advice"].includes(l.status)));
  });
  it("рычаги Джема отделены: в промпте они только с условием подписки", () => {
    const text = capabilitiesPrompt();
    assert.match(text, /предлагай только при «есть»/);
    assert.match(text, /не упоминай его/);
    assert.ok(LEVERS.some((l) => l.jam));
  });
  it("смена категории существующей карточки подаётся как совет с оговоркой, а не как действие", () => {
    const category = LEVERS.find((l) => l.id === "category")!;
    assert.equal(category.status, "advice");
    assert.match(capabilitiesPrompt(), /предмет не меняется/);
  });
  it("форма решения содержит сферу влияния агента", () => {
    assert.match(STRATEGY_FORM, /СФЕРА ВЛИЯНИЯ АГЕНТА/);
    assert.match(STRATEGY_FORM, /ФОРМА РЕШЕНИЯ ВСЕГДА РАЗНАЯ/);
  });
  it("подписка Джем по данным воронки: есть, нет, неизвестно", () => {
    assert.equal(jamSubscription([{ jam_data: 1 }, { jam_data: null }]), "есть");
    assert.equal(jamSubscription([{ jam_data: 0 }, { jam_data: 0 }]), "нет");
    assert.equal(jamSubscription([{ jam_data: null }]), "неизвестно");
  });
});
