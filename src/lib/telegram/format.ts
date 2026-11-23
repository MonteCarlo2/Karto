/**
 * Безопасное оформление текста для Telegram (parse_mode HTML). Все пользовательские и внешние тексты (названия товаров, отзывы, тексты событий)
 * экранируются, поэтому сообщение никогда не ломается из-за символов < > & в данных, а теги в нём только наши и всегда парные.
 * Лимит Telegram: 4096 символов на сообщение; режем заранее по целым блокам, а не посреди тега.
 */

export const TELEGRAM_TEXT_LIMIT = 4096;
const SAFE_LIMIT = 3900;

/** Убирает управляющие и невидимые символы, которые Telegram показывает квадратиками или ломают переносы. */
export function cleanText(input: unknown): string {
  return String(input ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁠﻿]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function escapeHtml(input: unknown): string {
  return cleanText(input).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Режет обычный текст до max символов (по символам Юникода, чтобы не порвать эмодзи) и добавляет «…». Экранировать после обрезки. */
export function clip(input: unknown, max: number): string {
  const text = cleanText(input).replace(/\s*\n\s*/g, " ");
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return `${chars
    .slice(0, Math.max(1, max - 1))
    .join("")
    .trimEnd()}…`;
}

export const bold = (text: unknown) => `<b>${escapeHtml(text)}</b>`;
export const italic = (text: unknown) => `<i>${escapeHtml(text)}</i>`;
export const code = (text: unknown) => `<code>${escapeHtml(text)}</code>`;

/** Ссылка: допускаются только http(s); адрес экранируется для атрибута. */
export function link(label: unknown, url: string): string {
  if (!/^https?:\/\/[^\s"'<>]+$/i.test(url)) return escapeHtml(label);
  return `<a href="${url.replace(/&/g, "&amp;")}">${escapeHtml(label)}</a>`;
}

const NBSP = " ";
/** Цитата-плашка Telegram для пояснений и деталей. Принимает уже собранный безопасный HTML. */
export const quote = (html: string) => (html ? `<blockquote>${html}</blockquote>` : "");

/** Шапка сообщения: иконка, жирное название и серая подпись под ним. */
export function header(icon: string, title: unknown, sub?: unknown): string {
  const subtitle = sub ? `\n${italic(sub)}` : "";
  return `${icon} ${bold(title)}${subtitle}`;
}

/** Строка показателя: «💰 Оборот — 59 516 ₽» (значение жирным, пояснение обычным). */
export function stat(icon: string, label: string, value: string, note?: string): string {
  return `${icon} ${escapeHtml(label)} — ${bold(value)}${note ? ` ${escapeHtml(note)}` : ""}`;
}

/** Метки мест для топа: медали, дальше цифры. */
export const PLACE = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣"] as const;

/**
 * Длинный текст в короткие абзацы: делит по предложениям, не больше maxParas абзацев, между ними пустая строка.
 * Возвращает безопасный HTML (всё экранировано), годится для цитат.
 */
export function paragraphs(text: unknown, maxParas = 3): string {
  const flat = cleanText(text).replace(/\s*\n\s*/g, " ");
  if (!flat) return "";
  const sentences = flat.split(/(?<=[.!?…])\s+(?=[А-ЯЁA-Z«"0-9])/).filter(Boolean);
  const size = Math.ceil(sentences.length / Math.max(1, maxParas));
  const groups: string[] = [];
  for (let i = 0; i < sentences.length; i += size) groups.push(sentences.slice(i, i + size).join(" "));
  return groups.map(escapeHtml).join("\n\n");
}

export function fmtInt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return Math.round(n)
    .toLocaleString("ru-RU")
    .replace(/[  ]/g, NBSP);
}
export function fmtRub(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? "—" : `${fmtInt(n)}${NBSP}₽`;
}
export function fmtPct(n: number | null | undefined, digits = 0): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toLocaleString("ru-RU", { maximumFractionDigits: digits })}${NBSP}%`;
}

/**
 * Склеивает готовые HTML-блоки в одно или несколько сообщений, каждое не длиннее лимита. Блок не рвётся. Если один блок длиннее лимита сам по себе,
 * он обрезается по границе тега (при сборке блоки уже ограничены clip, это страховка).
 */
export function packMessages(blocks: string[], separator = "\n\n"): string[] {
  const out: string[] = [];
  let cur = "";
  for (const block of blocks) {
    if (!block) continue;
    const safe = block.length > TELEGRAM_TEXT_LIMIT ? `${block.slice(0, SAFE_LIMIT).replace(/<[^>]*$/, "").replace(/&[a-z#0-9]*$/i, "")}…` : block;
    if (!cur) cur = safe;
    else if ((cur + separator + safe).length <= SAFE_LIMIT) cur += separator + safe;
    else {
      out.push(cur);
      cur = safe;
    }
  }
  if (cur) out.push(cur);
  return out;
}
