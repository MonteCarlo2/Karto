import DOMPurify from "isomorphic-dompurify";

const ALLOWED_TAGS = [
  "p",
  "br",
  "span",
  "div",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "strike",
  "del",
  "sub",
  "sup",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "code",
  "hr",
  "a",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
];

let hooksInstalled = false;

function installHooksOnce() {
  if (hooksInstalled) return;
  DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
    if (data.attrName === "style" && typeof data.attrValue === "string") {
      const v = data.attrValue;
      if (
        /url\s*\(/i.test(v) ||
        /expression\s*\(/i.test(v) ||
        /@import/i.test(v) ||
        /javascript:/i.test(v) ||
        /behavior\s*:/i.test(v) ||
        /-moz-binding/i.test(v)
      ) {
        data.keepAttr = false;
      }
    }
    if (data.attrName === "class") {
      data.keepAttr = false;
    }
  });
  hooksInstalled = true;
}

/** Безопасный HTML для тела уведомления (сохраняем инлайн-стили: размер, цвет, жирный и т.д.). */
export function sanitizeNotificationHtml(dirty: string): string {
  if (!dirty || typeof dirty !== "string") return "";
  const cleaned = normalizeNotificationBodySource(decodeNotificationEntities(dirty));
  installHooksOnce();
  return DOMPurify.sanitize(cleaned, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ["style", "href", "target", "rel", "colspan", "rowspan"],
    ALLOW_DATA_ATTR: false,
  });
}

/** Убираем BOM / zero-width, чтобы детектор HTML не ломался после вставки из Word. */
export function normalizeNotificationBodySource(s: string): string {
  return s
    .replace(/^\uFEFF+/, "")
    .replace(/\u200B/g, "")
    .replace(/\u200C/g, "")
    .replace(/\u200D/g, "")
    .trim();
}

/** Декодируем типичные сущности, если тело пришло экранированным (&lt;p&gt;…). */
export function decodeNotificationEntities(s: string): string {
  if (!/&(?:#(?:\d+|x[0-9a-fA-F]+)|lt|gt|quot|nbsp|amp);/.test(s)) return s;
  let out = s;
  for (let i = 0; i < 6; i++) {
    const next = out
      .replace(/&nbsp;/gi, "\u00a0")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/&amp;/gi, "&");
    if (next === out) break;
    out = next;
  }
  return out;
}

/** Есть ли в строке разметка (сырая или после decode). */
export function notificationBodyLooksLikeHtml(s: string): boolean {
  const t = normalizeNotificationBodySource(s);
  if (!t) return false;
  if (/&lt;\/?[a-zA-Z]/i.test(t)) return true;
  return /<\/?[a-zA-Z][\w:-]*(?:\s[^>]*)?>/.test(t);
}

/** Пустой документ редактора или только пробелы / &nbsp; */
export function isNotificationBodyEmpty(html: string): boolean {
  const plain = normalizeNotificationBodySource(decodeNotificationEntities(html))
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length === 0;
}
