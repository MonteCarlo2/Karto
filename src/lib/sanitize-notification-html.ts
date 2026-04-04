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
  installHooksOnce();
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ["style", "href", "target", "rel", "colspan", "rowspan"],
    ALLOW_DATA_ATTR: false,
  });
}

/** Старые уведомления без тегов — показываем как обычный текст. */
export function notificationBodyLooksLikeHtml(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  return /<[a-z][\s\S]*>/i.test(t);
}

/** Пустой документ редактора или только пробелы / &nbsp; */
export function isNotificationBodyEmpty(html: string): boolean {
  const plain = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length === 0;
}
