import { cleanText, escapeHtml, paragraphs } from "./format";

/**
 * Красивое оформление текстовых ответов ИИ для Telegram. Модель пишет markdown и сплошные абзацы, а в чате нужны воздух и структура:
 * короткие абзацы через пустую строку, заголовки разделов, нумерованные шаги с цифрами-иконками, списки, цитаты для «Важно», «Совет» и «Для вашего магазина».
 * Всё экранируется, теги только наши и парные.
 */

const KEYCAPS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

/** Жирный, курсив, код внутри уже экранированного текста. Непарные звёздочки убираются. */
export function inlineMd(escaped: string): string {
  const html = escaped
    .replace(/\*\*([^*\n]+?)\*\*/g, "<b>$1</b>")
    .replace(/__([^_\n]+?)__/g, "<b>$1</b>")
    .replace(/(^|[\s(])\*([^*\n]+?)\*(?=[\s).,;:!?]|$)/g, "$1<i>$2</i>")
    .replace(/`([^`\n]+?)`/g, "<code>$1</code>");
  return html.replace(/\*\*/g, "").replace(/(?<![\w<])\*(?![\w>])/g, "");
}

const MD_LINK = /\[([^\]\n]+)\]\((?:https?:\/\/|\/)[^)\s]*\)/g;

/** quote: оформлять цитатой. Цитаты только для предупреждений и «Для вашего магазина»; советы и итоги идут обычной строкой с иконкой, иначе их слишком много. */
type Callout = { icon: string; label: string; quote: boolean };

/** «Важно: …», «Совет: …», «Для вашего магазина: …» оформляются цитатой с иконкой. */
export function calloutOf(line: string): { callout: Callout; rest: string } | null {
  const m = /^(?:\*\*|__)?\s*(важно|внимание|осторожно|предупреждение|совет|лайфхак|подсказка|для вашего магазина|для вас|итог|вывод|коротко|суть)\s*[:!.]?\s*(?:\*\*|__)?\s*[:!]?\s*(.*)$/i.exec(line.trim());
  if (!m) return null;
  const key = m[1]!.toLowerCase();
  const table: Record<string, Callout> = {
    важно: { icon: "⚠️", label: "Важно", quote: true },
    внимание: { icon: "⚠️", label: "Внимание", quote: true },
    осторожно: { icon: "⚠️", label: "Осторожно", quote: true },
    предупреждение: { icon: "⚠️", label: "Предупреждение", quote: true },
    совет: { icon: "💡", label: "Совет", quote: false },
    лайфхак: { icon: "💡", label: "Лайфхак", quote: false },
    подсказка: { icon: "💡", label: "Подсказка", quote: false },
    "для вашего магазина": { icon: "🛍", label: "Для вашего магазина", quote: true },
    "для вас": { icon: "🛍", label: "Для вас", quote: true },
    итог: { icon: "📌", label: "Итог", quote: false },
    вывод: { icon: "📌", label: "Вывод", quote: false },
    коротко: { icon: "📌", label: "Коротко", quote: false },
    суть: { icon: "📌", label: "Суть", quote: false },
  };
  const callout = table[key];
  if (!callout) return null;
  // Короткие «Итог» или «Совет» без двоеточия в начале обычного предложения не трогаем: нужно двоеточие или восклицание.
  if (!/[:!]/.test(line.slice(0, key.length + 8))) return null;
  return { callout, rest: m[2]!.trim() };
}

type Unit =
  | { kind: "heading"; text: string }
  | { kind: "step"; n: number; text: string }
  | { kind: "bullet"; level: number; text: string }
  | { kind: "callout"; callout: Callout; text: string }
  | { kind: "para"; text: string };

/** Делит текст на смысловые части. Подряд идущие обычные строки склеиваются в абзац, пустая строка разделяет абзацы. */
export function parseUnits(raw: string): Unit[] {
  const lines = cleanText(String(raw ?? "").replace(MD_LINK, "$1")).split("\n");
  const units: Unit[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) units.push({ kind: "para", text: para.join(" ").replace(/\s+/g, " ").trim() });
    para = [];
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    const t = line.trim();
    if (!t) {
      flush();
      continue;
    }
    const heading = /^#{1,6}\s+(.+?)\s*#*$/.exec(t) ?? /^(?:\*\*|__)([^*_\n]{2,70})(?:\*\*|__)\s*:?$/.exec(t);
    if (heading) {
      flush();
      units.push({ kind: "heading", text: heading[1]!.trim().replace(/[:：]$/, "") });
      continue;
    }
    const step = /^(\d{1,2})[.)]\s+(.+)$/.exec(t);
    if (step) {
      flush();
      units.push({ kind: "step", n: Number(step[1]), text: step[2]! });
      continue;
    }
    const bullet = /^([-*•–])\s+(.+)$/.exec(t);
    if (bullet) {
      flush();
      const indent = line.length - line.trimStart().length;
      units.push({ kind: "bullet", level: indent >= 2 ? 1 : 0, text: bullet[2]! });
      continue;
    }
    const call = calloutOf(t);
    if (call && (call.rest || /[:!]\s*$/.test(t))) {
      flush();
      // Текст «Важно:» может продолжаться на следующих строках до пустой строки.
      const rest = [call.rest];
      while (i + 1 < lines.length && lines[i + 1]!.trim() && !/^(\d{1,2}[.)]|[-*•–]|#)\s/.test(lines[i + 1]!.trim()) && !calloutOf(lines[i + 1]!)) {
        rest.push(lines[i + 1]!.trim());
        i += 1;
      }
      units.push({ kind: "callout", callout: call.callout, text: rest.filter(Boolean).join(" ") });
      continue;
    }
    // Короткая строка с двоеточием на конце — заголовок раздела («Что нужно:»).
    if (/^[^.!?]{2,60}:$/.test(t) && !/^\d/.test(t)) {
      flush();
      units.push({ kind: "heading", text: t.replace(/:$/, "") });
      continue;
    }
    para.push(t);
  }
  flush();
  return units;
}

/** Длинный сплошной абзац режется на 2–3 коротких по предложениям. */
function splitLong(text: string): string {
  if (text.length <= 340) return escapeHtml(text);
  return paragraphs(text, Math.min(4, Math.ceil(text.length / 260)));
}

/** Части ответа с отступом перед каждой. Цитаты и списки не разрываются, поэтому по границам частей текст безопасно делить на сообщения. */
export function richTelegramPieces(raw: string): Array<{ gap: string; piece: string }> {
  const units = parseUnits(raw);
  const out: Array<{ gap: string; piece: string }> = [];
  // Цифры-иконки только у коротких списков шагов (до пяти коротких пунктов): так ответы не выглядят одинаково.
  const keycapRun = new Set<Unit>();
  for (let i = 0; i < units.length; ) {
    if (units[i]!.kind !== "step") {
      i += 1;
      continue;
    }
    let j = i;
    while (j < units.length && units[j]!.kind === "step") j += 1;
    const run = units.slice(i, j) as Array<Extract<Unit, { kind: "step" }>>;
    if (run.length <= 5 && run.every((s) => s.text.length <= 80)) run.forEach((s) => keycapRun.add(s));
    i = j;
  }
  let quotes = 0;
  let prev: Unit["kind"] | null = null;
  let prevLong = false;
  for (const u of units) {
    let piece = "";
    let long = false;
    switch (u.kind) {
      case "heading":
        piece = `<b>${inlineMd(escapeHtml(u.text))}</b>`;
        break;
      case "step":
        piece = `${keycapRun.has(u) ? (KEYCAPS[u.n - 1] ?? `${u.n}.`) : `<b>${u.n}.</b>`} ${inlineMd(escapeHtml(u.text))}`;
        long = u.text.length > 110;
        break;
      case "bullet":
        piece = `${u.level ? "      ◦" : "•"} ${inlineMd(escapeHtml(u.text))}`;
        long = u.text.length > 110;
        break;
      case "callout": {
        const text = u.text ? u.text.charAt(0).toUpperCase() + u.text.slice(1) : "";
        const body = text ? inlineMd(splitLong(text)) : "";
        if (u.callout.quote && quotes < 2) {
          quotes += 1;
          piece = `<blockquote>${u.callout.icon} <b>${escapeHtml(u.callout.label)}</b>${body ? `\n\n${body}` : ""}</blockquote>`;
        } else {
          piece = `${u.callout.icon} <b>${escapeHtml(u.callout.label)}:</b> ${body}`.trim();
        }
        break;
      }
      default:
        piece = inlineMd(splitLong(u.text));
        long = true;
    }
    const sameList = (u.kind === "step" || u.kind === "bullet") && prev === u.kind;
    // Внутри списка: короткие пункты через строку, длинные через пустую. Всё остальное разделяется пустой строкой.
    const gap = out.length === 0 ? "" : sameList && !long && !prevLong ? "\n" : "\n\n";
    out.push({ gap, piece });
    prev = u.kind;
    prevLong = long;
  }
  return out;
}

/** Готовый HTML для одного сообщения Telegram. Пустой текст даёт пустую строку. */
export function richTelegramHtml(raw: string): string {
  return richTelegramPieces(raw).map((p) => `${p.gap}${p.piece}`).join("");
}

/** То же, но длинный ответ делится на сообщения не длиннее лимита по границам частей. */
export function richTelegramMessages(raw: string, limit = 3600): string[] {
  const messages: string[] = [];
  let cur = "";
  for (const { gap, piece } of richTelegramPieces(raw)) {
    if (cur && cur.length + gap.length + piece.length > limit) {
      messages.push(cur);
      cur = piece;
    } else cur += cur ? `${gap}${piece}` : piece;
  }
  if (cur) messages.push(cur);
  return messages;
}
