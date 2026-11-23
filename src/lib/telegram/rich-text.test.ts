import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calloutOf, parseUnits, richTelegramHtml } from "./rich-text";

describe("красивое оформление ответов ИИ", () => {
  const sample = [
    "Заказ FBS нужно собрать и передать в доставку в личном кабинете WB.",
    "",
    "**Что сделать**",
    "1. Откройте раздел **Маркетплейс → Сборочные задания** и найдите новый заказ.",
    "2. Нажмите «Добавить к поставке» и выберите открытую поставку.",
    "3. Распечатайте стикер.",
    "",
    "Важно: за просрочку отгрузки заказ отменяется автоматически.",
    "",
    "Для вашего магазина: сейчас 13 новых заказов, начните с Ведро оцинкованное 9л.",
  ].join("\n");

  it("абзацы, заголовок, шаги с цифрами-иконками, цитаты с иконкой", () => {
    const html = richTelegramHtml(sample);
    assert.match(html, /^Заказ FBS нужно собрать/);
    assert.match(html, /\n\n<b>Что сделать<\/b>\n\n1️⃣ Откройте раздел <b>Маркетплейс → Сборочные задания<\/b>/);
    assert.match(html, /2️⃣ Нажмите «Добавить к поставке»/);
    assert.match(html, /<blockquote>⚠️ <b>Важно<\/b>\n\nЗа просрочку отгрузки/);
    assert.match(html, /<blockquote>🛍 <b>Для вашего магазина<\/b>\n\nСейчас 13 новых заказов/);
    // Между крупными частями всегда пустая строка.
    assert.ok(html.split("\n\n").length >= 6);
  });

  it("теги парные, опасные символы экранированы, нет сырого markdown", () => {
    const html = richTelegramHtml("## Заголовок\n- пункт <script> & **жирный**\n- ещё *курсив* и `код`\n\nхвост ** без пары");
    for (const tag of ["b", "i", "code", "blockquote"]) assert.equal((html.match(new RegExp(`<${tag}>`, "g")) ?? []).length, (html.match(new RegExp(`</${tag}>`, "g")) ?? []).length, tag);
    assert.match(html, /&lt;script&gt; &amp; <b>жирный<\/b>/);
    assert.ok(!/\*\*|^#/m.test(html));
    assert.match(html, /^<b>Заголовок<\/b>\n\n• пункт/);
  });

  it("длинный сплошной абзац режется на короткие", () => {
    const long = Array.from({ length: 9 }, (_, i) => `Это предложение номер ${i + 1} про маркировку товаров на Wildberries.`).join(" ");
    const html = richTelegramHtml(long);
    assert.ok(html.split("\n\n").length >= 2);
    assert.ok(html.split("\n\n").every((p) => p.length < 420));
  });

  it("короткие пункты через строку, длинные через пустую", () => {
    const html = richTelegramHtml("- раз\n- два\n- " + "очень длинный пункт ".repeat(8));
    assert.match(html, /• раз\n• два\n\n• очень длинный/);
  });

  it("обычные слова «итог» и «совет» внутри предложения не становятся цитатой", () => {
    assert.equal(calloutOf("Итого за неделю 5 заказов"), null);
    assert.equal(calloutOf("Совет дня простой"), null);
    assert.ok(calloutOf("Совет: проверьте цену"));
    assert.ok(parseUnits("Важно: не забыть").some((u) => u.kind === "callout"));
    assert.equal(richTelegramHtml("   "), "");
  });
});

describe("разнообразие оформления", () => {
  it("советы и итоги не цитаты, цитат не больше двух, длинные шаги без иконок", () => {
    const html = richTelegramHtml(["Совет: проверьте цену.", "", "Итог: всё просто.", "", "Важно: первое.", "", "Важно: второе.", "", "Важно: третье.", "", "Для вашего магазина: это про вёдра."].join("\n"));
    assert.match(html, /^💡 <b>Совет:<\/b> Проверьте цену\./);
    assert.match(html, /📌 <b>Итог:<\/b> Всё просто\./);
    assert.equal((html.match(/<blockquote>/g) ?? []).length, 2);
    assert.match(html, /⚠️ <b>Важно:<\/b> Третье\./);
    const long = richTelegramHtml("1. " + "длинный шаг ".repeat(10) + "\n2. короткий");
    assert.match(long, /<b>1\.<\/b> длинный шаг/);
    assert.ok(!long.includes("1️⃣"));
    assert.match(richTelegramHtml("1. раз\n2. два\n3. три"), /^1️⃣ раз\n2️⃣ два\n3️⃣ три$/);
  });
});
