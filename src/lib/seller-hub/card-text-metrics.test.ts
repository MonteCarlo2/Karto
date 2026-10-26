import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { measureText, textMetricsForPrompt } from "./card-text-metrics";

const GOOD = [
  "Строительное ведро объёмом 10 литров предназначено для ремонта, дачи и хозяйственных работ.",
  "Изготовлено из ударопрочного пластика, выдерживает перепады температур.",
  "",
  "Преимущества:",
  "- мерная шкала внутри помогает точно дозировать смеси",
  "- усиленное дно не деформируется под нагрузкой",
  "- удобная металлическая ручка",
].join("\n");

describe("measureText", () => {
  it("структура: абзацы, списки, длина названия", () => {
    const m = measureText({ title: "Ведро строительное 10 л", description: GOOD });
    assert.equal(m.paragraphs, 2);
    assert.equal(m.bullets, 3);
    assert.equal(m.titleOverWb, false);
    assert.equal(m.forbidden.length, 0);
    assert.equal(m.shouting, false);
  });

  it("длинное название и пустое описание", () => {
    const m = measureText({ title: "Ведро ".repeat(15).trim(), description: null });
    assert.equal(m.titleOverWb, true);
    assert.equal(m.descriptionLength, 0);
    assert.equal(m.paragraphs, 0);
  });

  it("крик заглавными и переспам одним словом", () => {
    const shout = measureText({ title: "Ведро", description: "ЛУЧШЕЕ СТРОИТЕЛЬНОЕ ВЕДРО ДЛЯ ДАЧИ И РЕМОНТА ТОЛЬКО У НАС" });
    assert.equal(shout.shouting, true);
    const spam = measureText({ title: "Ведро", description: Array.from({ length: 12 }, () => "купить ведро строительное недорого").join(". ") + "." });
    assert.ok(spam.overused.length > 0);
    assert.ok(spam.overused.some((o) => o.word.startsWith("вед")));
  });

  it("находит запрещённое: телефон, сайт, мессенджер, цену", () => {
    const m = measureText({ title: "Ведро скидка 50%", description: "Звоните +7 900 123-45-67 или пишите в whatsapp, сайт moy-shop.ru. Цена 500 руб." });
    for (const part of ["номер телефона", "ссылка или адрес сайта", "мессенджер или соцсеть", "цена или скидка"]) {
      assert.ok(m.forbidden.includes(part), part);
    }
  });

  it("слова названия, которых нет в описании", () => {
    const m = measureText({ title: "Кашпо пластиковое черное", description: "Горшок для комнатных растений. Подходит для дома." });
    assert.ok(m.titleWordsMissingInDescription.includes("пластиковое"));
    assert.ok(m.titleWordsMissingInDescription.includes("кашпо"));
  });

  it("текст для нейросети содержит ключевые замеры", () => {
    const text = textMetricsForPrompt(measureText({ title: "Ведро", description: GOOD }));
    assert.match(text, /Описание: \d+ знаков/);
    assert.match(text, /Запрещённого/);
  });
});
