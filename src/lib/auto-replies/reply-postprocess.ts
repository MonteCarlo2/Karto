import type { AutoRepliesShopSettings } from "./settings-types";

const EMOJI_RE = /\p{Extended_Pictographic}/gu;

export function stripEmojis(text: string): string {
  return text.replace(EMOJI_RE, "").replace(/\s{2,}/g, " ").trim();
}

export function applyMinusWords(text: string, shop: AutoRepliesShopSettings): string {
  if (!shop.advanced.minusWordsEnabled || shop.advanced.minusWords.length === 0) return text;
  let out = text;
  for (const word of shop.advanced.minusWords) {
    const w = word.trim();
    if (!w) continue;
    const re = new RegExp(`\\b${escapeRegExp(w)}\\b`, "gi");
    out = out.replace(re, "").replace(/\s{2,}/g, " ").trim();
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const TRAILING_SIGNATURE_RE =
  /\n+(?:С\s+уважением[^\n]*|С\s+наилучшими\s+пожеланиями[^\n]*|Команда\s+«?[^»\n]+»?[^\n]*|магазин\s+[^\n]+)$/iu;

/** Убирает подпись из текста, если подписи отключены в настройках. */
export function applySignaturePolicy(text: string, shop: AutoRepliesShopSettings): string {
  if (shop.templates.signaturesEnabled) return text;

  let out = text.trimEnd();
  for (let i = 0; i < 4; i++) {
    const next = out.replace(TRAILING_SIGNATURE_RE, "").trimEnd();
    if (next === out) break;
    out = next;
  }
  return out;
}

/** Сохраняет абзацы и переносы для отправки на маркетплейс. */
export function prepareReplyTextForMarketplace(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Убирает утечки внутренних ключей addressForm (vy/ty) из текста модели. */
export function sanitizeAddressFormLeaks(text: string): string {
  return text
    .split("\n")
    .map((line) =>
      line
        .replace(/,\s*\(?\s*vy\s*\)?(?=[.!?,])/gi, "")
        .replace(/,\s*\(?\s*ty\s*\)?(?=[.!?,])/gi, "")
        .replace(/(?:^|[\s,(])\(?\s*vy\s*\)?(?=[\s.!?,]|$)/gi, " ")
        .replace(/(?:^|[\s,(])\(?\s*ty\s*\)?(?=[\s.!?,]|$)/gi, " ")
        .replace(/\baddressForm\s*[:=]?\s*(?:vy|ty)\b/gi, "")
        .replace(/[^\S\n]{2,}/g, " ")
        .replace(/\s+([.!?,])/g, "$1")
        .trimEnd()
    )
    .join("\n")
    .trim();
}

/** Разбивает длинный сплошной текст на абзацы — только когда это улучшает читаемость. */
export function beautifyReplyLayout(text: string): string {
  const normalized = prepareReplyTextForMarketplace(text);
  if (normalized.includes("\n\n")) return normalized;

  // Короткие ответы оставляем одним блоком — без искусственных переносов.
  if (normalized.length < 200) return normalized;

  const sentences = normalized.match(/[^.!?…]+[.!?…]+(?:\s|$)|[^.!?…]+$/g);
  if (!sentences || sentences.length < 3) return normalized;

  const first = sentences[0]?.trim();
  const rest = sentences.slice(1).join(" ").trim();
  if (!first || !rest || rest.length < 40) return normalized;

  // Средние ответы из 3 предложений — только если текст действительно длинный.
  if (normalized.length < 280 && sentences.length < 4) return normalized;

  return `${first}\n\n${rest}`;
}

/** Китайский, японский, корейский и т.п. — не должны попадать в ответ продавца. */
const FOREIGN_SCRIPT_RE =
  /[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/u;

export function containsForeignScript(text: string): boolean {
  return FOREIGN_SCRIPT_RE.test(text);
}

export function finalizeReplyText(text: string, shop: AutoRepliesShopSettings): string {
  let out = text.trim();
  out = sanitizeAddressFormLeaks(out);
  if (!shop.style.emojis) out = stripEmojis(out);
  out = applyMinusWords(out, shop);
  out = applySignaturePolicy(out, shop);
  out = beautifyReplyLayout(out);
  if (containsForeignScript(out)) {
    throw new Error("Ответ содержит текст не на русском языке");
  }
  return prepareReplyTextForMarketplace(out);
}

/** Единая подготовка текста перед отправкой на любой маркетплейс. */
export function prepareReplyForMarketplaceSend(
  text: string,
  shop: AutoRepliesShopSettings
): string {
  return finalizeReplyText(text, shop);
}

export function prepareReplyForCopy(text: string, shop?: AutoRepliesShopSettings): string {
  const normalized = prepareReplyTextForMarketplace(text);
  return shop ? finalizeReplyText(normalized, shop) : normalized;
}

export function reviewMentionsDelivery(review: string): boolean {
  return /достав|курьер|приех|пришл|получ|упаков|сломан|повреж|задерж|почт|логист/i.test(review);
}

export function reviewMentionsPhotos(review: string): boolean {
  return /фото|снимок|картинк|изображен/i.test(review);
}
