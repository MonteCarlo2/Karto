import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bold, clip, cleanText, escapeHtml, fmtInt, fmtRub, link, packMessages, TELEGRAM_TEXT_LIMIT } from "./format";

describe("оформление текста для Telegram", () => {
  it("экранирует символы разметки в данных", () => {
    assert.equal(escapeHtml("Кашпо <b>16л</b> & «Тест»"), "Кашпо &lt;b&gt;16л&lt;/b&gt; &amp; «Тест»");
    assert.equal(bold("a < b"), "<b>a &lt; b</b>");
  });

  it("убирает невидимые и управляющие символы", () => {
    assert.equal(cleanText("a​b\u0007c\r\n\r\n\r\n\r\nd"), "abc\n\nd");
    assert.equal(cleanText(null), "");
  });

  it("обрезает по символам, не рвёт эмодзи и добавляет многоточие", () => {
    assert.equal(clip("короткий", 20), "короткий");
    const cut = clip("а".repeat(50), 10);
    assert.equal(Array.from(cut).length, 10);
    assert.ok(cut.endsWith("…"));
    const emoji = clip("😀".repeat(30), 5);
    assert.equal(Array.from(emoji).length, 5);
    assert.ok(!emoji.includes("�"));
  });

  it("ссылка: только http(s), адрес экранируется", () => {
    assert.equal(link("Открыть", "https://karto.pro/a?x=1&y=2"), '<a href="https://karto.pro/a?x=1&amp;y=2">Открыть</a>');
    assert.equal(link("Открыть <x>", "javascript:alert(1)"), "Открыть &lt;x&gt;");
    assert.equal(link("a", 'https://x.ru/"onclick="'), "a");
  });

  it("числа с неразрывным пробелом", () => {
    assert.equal(fmtInt(1234567), "1 234 567");
    assert.equal(fmtRub(60608), "60 608 ₽");
    assert.equal(fmtInt(null), "—");
  });

  it("сообщения не длиннее лимита и не рвут теги", () => {
    const block = `<b>${"я".repeat(1500)}</b>`;
    const parts = packMessages([block, block, block, block]);
    assert.ok(parts.length >= 2);
    for (const p of parts) {
      assert.ok(p.length <= TELEGRAM_TEXT_LIMIT);
      assert.equal((p.match(/<b>/g) ?? []).length, (p.match(/<\/b>/g) ?? []).length);
    }
    const huge = packMessages([`<b>${"x".repeat(9000)}</b>`]);
    assert.ok(huge[0]!.length <= TELEGRAM_TEXT_LIMIT);
    assert.ok(!/<[^>]*$/.test(huge[0]!));
  });
});
