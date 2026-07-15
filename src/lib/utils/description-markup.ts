/**
 * Маркеры продающих триггеров: ⟦фраза⟧
 * Жирный в редакторе: **фраза**
 */

export function stripDescriptionMarkup(text: string): string {
  return text.replace(/⟦([^⟧]*)⟧/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1");
}

export function countHighlightMarkers(text: string): number {
  return (text.match(/⟦[^⟧]+⟧/g) || []).length;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Жирный с явным style — иначе в contenteditable вес часто «съедается». */
const BOLD_OPEN = '<b class="seo-desc-bold" style="font-weight:700">';
const BOLD_CLOSE = "</b>";

function applyInlineMarksToEscaped(escaped: string): string {
  return escaped
    .replace(/⟦([^⟧]+)⟧/g, '<span class="ai-highlight">$1</span>')
    .replace(/\*\*([^*]+)\*\*/g, `${BOLD_OPEN}$1${BOLD_CLOSE}`);
}

/** HTML для contenteditable: абзацы, подсветки, жирный. */
export function descriptionToEditableHtml(text: string): string {
  const paragraphs = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return paragraphs
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "<p><br></p>";

      const withBreaks = escapeHtml(trimmed).replace(/\n/g, "<br>");
      const withMarks = applyInlineMarksToEscaped(withBreaks);

      // Короткие подзаголовки с «:» — тоже визуально жирные в редакторе
      const plainOneLine = trimmed.replace(/\n/g, " ");
      if (
        plainOneLine.endsWith(":") &&
        plainOneLine.length > 3 &&
        plainOneLine.length < 60 &&
        !plainOneLine.includes("**")
      ) {
        return `<p>${BOLD_OPEN}${withMarks}${BOLD_CLOSE}</p>`;
      }

      return `<p>${withMarks}</p>`;
    })
    .join("");
}

function isBoldElement(el: HTMLElement): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === "strong" || tag === "b") return true;
  if (el.classList.contains("seo-desc-bold")) return true;
  const weight = (el.style.fontWeight || "").toString().trim();
  if (weight === "bold" || weight === "bolder") return true;
  const numeric = Number(weight);
  return Number.isFinite(numeric) && numeric >= 700;
}

/** Схлопывает вложенные **...****...** → один уровень. */
function normalizeBoldMarkers(text: string): string {
  let prev = "";
  let cur = text;
  while (prev !== cur) {
    prev = cur;
    cur = cur.replace(/\*\*\*\*+/g, "**").replace(/\*\*\s*\*\*/g, "");
  }
  return cur;
}

/** Обратно в текст с маркерами ⟦⟧ и **. */
export function editableHtmlToDescription(html: string): string {
  const root = document.createElement("div");
  root.innerHTML = html;

  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent ?? "";
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const inner = Array.from(el.childNodes).map(walk).join("");

    if (tag === "br") return "\n";
    if (tag === "span" && el.classList.contains("ai-highlight")) {
      return `⟦${inner}⟧`;
    }
    if (isBoldElement(el)) {
      const core = inner.trim();
      if (!core) return "";
      // Не дублируем **, если внутри уже есть маркеры на весь фрагмент
      if (core.startsWith("**") && core.endsWith("**")) return core;
      return `**${inner}**`;
    }
    if (tag === "p" || tag === "div" || tag === "li") {
      return inner;
    }
    return inner;
  };

  const blocks: string[] = [];
  const pushBlock = (raw: string) => {
    let t = normalizeBoldMarkers(raw.replace(/\n{3,}/g, "\n\n")).trim();
    // Подзаголовок с «:», обёрнутый целиком в ** — сохраняем как обычный заголовок
    const boldHeading = t.match(/^\*\*(.+:)\*\*$/);
    if (boldHeading?.[1] && boldHeading[1].length < 60) {
      t = boldHeading[1];
    }
    if (t) blocks.push(t);
  };

  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const tag = (child as HTMLElement).tagName.toLowerCase();
      if (tag === "p" || tag === "div" || tag === "li") {
        pushBlock(walk(child));
        continue;
      }
      if (tag === "ul" || tag === "ol") {
        for (const li of Array.from(child.childNodes)) {
          pushBlock(walk(li));
        }
        continue;
      }
    }
    pushBlock(walk(child));
  }

  if (blocks.length === 0) {
    return normalizeBoldMarkers(walk(root)).replace(/\n{3,}/g, "\n\n").trim();
  }
  return blocks.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Если модель мало разметила триггеры — аккуратно добираем 5–7 сильных фраз.
 * Не чаще чем нужно: только выгоды/свойства, не каждое слово.
 */
export function ensureSellingHighlights(text: string, minMarkers = 5, maxMarkers = 7): string {
  const current = countHighlightMarkers(text);
  if (current >= minMarkers) return text;

  const needed = Math.min(maxMarkers, minMarkers) - current;
  if (needed <= 0) return text;

  const benefitRe =
    /(?:^|[^А-Яа-яЁёA-Za-z0-9⟦⟧])((?:лёгк\w*|прочн\w*|удобн\w*|быстр\w*|натуральн\w*|дышащ\w*|гипоаллерген\w*|влагозащит\w*|антискольз\w*|компактн\w*|эргономичн\w*|беспроводн\w*|износостойк\w*|мягк\w*|тёпл\w*|тепл\w*|охлажд\w*|премиальн\w*|эконом\w*|долговечн\w*|безопасн\w*)(?:\s+[А-Яа-яЁёA-Za-z0-9\-]+){0,3})/gi;

  const materialRe =
    /(?:^|[^А-Яа-яЁёA-Za-z0-9⟦⟧])((?:из|с|без)\s+[А-Яа-яЁёA-Za-z0-9\-]+(?:\s+[А-Яа-яЁёA-Za-z0-9\-]+){0,3})/gi;

  const measureRe =
    /(?:^|[^А-Яа-яЁёA-Za-z0-9⟦⟧])(\d+[.,]?\d*\s?(?:мм|см|м|кг|г|мл|л|Вт|мА·?ч|mah|ч|°C|%)(?:\s+[А-Яа-яЁёA-Za-z\-]+){0,2})/gi;

  type Hit = { start: number; end: number; phrase: string };
  const hits: Hit[] = [];

  const inMarker = (index: number): boolean => {
    const left = text.lastIndexOf("⟦", index);
    const right = text.lastIndexOf("⟧", index);
    return left > right;
  };

  const collect = (re: RegExp) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const phrase = (m[1] || "").trim();
      if (!phrase || phrase.length < 4 || phrase.length > 42) continue;
      const wordCount = phrase.split(/\s+/).filter(Boolean).length;
      if (wordCount < 1 || wordCount > 6) continue;
      const start = m.index + (m[0].length - phrase.length);
      if (inMarker(start)) continue;
      if (phrase.endsWith(":")) continue;
      hits.push({ start, end: start + phrase.length, phrase });
    }
  };

  collect(benefitRe);
  collect(materialRe);
  collect(measureRe);

  hits.sort((a, b) => a.start - b.start);
  const picked: Hit[] = [];
  for (const hit of hits) {
    if (picked.length >= needed) break;
    const overlaps = picked.some((p) => !(hit.end <= p.start || hit.start >= p.end));
    if (overlaps) continue;
    picked.push(hit);
  }

  if (picked.length === 0) return text;

  let result = text;
  for (const hit of [...picked].sort((a, b) => b.start - a.start)) {
    if (result.slice(hit.start, hit.end) !== hit.phrase) continue;
    result = result.slice(0, hit.start) + `⟦${hit.phrase}⟧` + result.slice(hit.end);
  }
  return result;
}
