import type { InboxReviewItem } from "./inbox-demo-data";
import type { AutoRepliesShopSettings, AutoRepliesStyleSettings } from "./settings-types";
import { finalizeReplyText } from "./reply-postprocess";

export const EMPTY_REVIEW_MAX_LENGTH = 300;

const EMPTY_REVIEW_MARKERS = [
  "покупатель не оставил комментария",
  "только звёзды",
  "только звезды",
  "без комментария",
  "без текста",
];

const PROS_CONS_LINE_RE = /^(\s*плюсы|\s*минусы)\s*:\s*(.*)$/i;

function parseProsConsLine(line: string): { isProsCons: boolean; body: string } {
  const m = line.match(PROS_CONS_LINE_RE);
  if (!m) return { isProsCons: false, body: line.trim() };
  return { isProsCons: true, body: (m[2] ?? "").trim() };
}

/**
 * WB: шаблон «без комментария» — только если нет основного текста и после «Плюсы:/Минусы:»
 * ничего нет (пустые метки). Если после двоеточия есть текст — это обычный отзыв.
 */
export function isProsConsOnlyReviewText(reviewText: string): boolean {
  const lines = reviewText
    .trim()
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return true;

  let sawProsConsLine = false;
  for (const line of lines) {
    const { isProsCons, body } = parseProsConsLine(line);
    if (!isProsCons) {
      if (body.length >= 1) return false;
      continue;
    }
    sawProsConsLine = true;
    if (body.length >= 1) return false;
  }

  return sawProsConsLine;
}

export function hasMeaningfulReviewText(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (t.length < 3) return false;
  if (isProsConsOnlyReviewText(text)) return false;
  return !EMPTY_REVIEW_MARKERS.some((m) => t.includes(m));
}

export function isReviewWithoutText(reviewText: string): boolean {
  return isProsConsOnlyReviewText(reviewText) || !hasMeaningfulReviewText(reviewText);
}

export function shouldUseEmptyReviewTemplate(style: AutoRepliesStyleSettings): boolean {
  return style.emptyReviewEnabled && style.emptyReviewCustomText.trim().length > 0;
}

/** Списывать пакетный остаток при отправке (не для шаблона на пустой отзыв). */
export function shouldChargeAutoReplyCreditForSend(
  reviewText: string,
  shop: AutoRepliesShopSettings
): boolean {
  return !(isReviewWithoutText(reviewText) && shouldUseEmptyReviewTemplate(shop.style));
}

export function resolveEmptyReviewBody(style: AutoRepliesStyleSettings): string {
  return style.emptyReviewCustomText.trim();
}

/** Подставляет шаблон для pending-отзывов без текста, если черновик ещё пустой. */
export function hydrateInboxItemReplyDraft(
  item: InboxReviewItem,
  shop: AutoRepliesShopSettings
): InboxReviewItem {
  if (item.status !== "pending") return item;
  if (item.replyDraft?.trim().length >= 2) return item;
  if (!isReviewWithoutText(item.reviewText)) return item;
  if (!shouldUseEmptyReviewTemplate(shop.style)) return item;
  const body = resolveEmptyReviewBody(shop.style);
  if (body.length < 2) return item;
  return { ...item, replyDraft: body, draftGeneratedByAi: true };
}

export function hydrateInboxReplyDrafts(
  items: InboxReviewItem[],
  shop: AutoRepliesShopSettings
): InboxReviewItem[] {
  return items.map((item) => hydrateInboxItemReplyDraft(item, shop));
}

/** Текст ответа для UI: шаблон из настроек, если черновик пустой. */
export function resolveInboxDisplayReplyDraft(
  item: InboxReviewItem,
  shop: AutoRepliesShopSettings
): string {
  const draft = item.replyDraft?.trim() ?? "";
  const emptyWithTemplate =
    item.status === "pending" &&
    isReviewWithoutText(item.reviewText) &&
    shouldUseEmptyReviewTemplate(shop.style);

  if (draft.length >= 2) {
    if (emptyWithTemplate) {
      try {
        return finalizeReplyText(item.replyDraft, shop);
      } catch {
        return item.replyDraft;
      }
    }
    return item.replyDraft;
  }
  if (item.status === "sent" && isReviewWithoutText(item.reviewText) && shouldUseEmptyReviewTemplate(shop.style)) {
    try {
      return finalizeReplyText(resolveEmptyReviewBody(shop.style), shop);
    } catch {
      return resolveEmptyReviewBody(shop.style);
    }
  }
  if (item.status !== "pending") return item.replyDraft ?? "";
  if (!isReviewWithoutText(item.reviewText)) return item.replyDraft ?? "";
  if (!shouldUseEmptyReviewTemplate(shop.style)) return item.replyDraft ?? "";
  try {
    return finalizeReplyText(resolveEmptyReviewBody(shop.style), shop);
  } catch {
    return resolveEmptyReviewBody(shop.style);
  }
}

export function normalizeEmptyReviewCustomText(value: unknown): string {
  return String(value ?? "").slice(0, EMPTY_REVIEW_MAX_LENGTH);
}

type LegacyEmptyReviewStyle = Partial<AutoRepliesStyleSettings> & {
  emptyReviewTemplate?: "rating" | "review" | "custom";
};

export function normalizeEmptyReviewSettings(raw: LegacyEmptyReviewStyle): Pick<
  AutoRepliesStyleSettings,
  "emptyReviewEnabled" | "emptyReviewCustomText"
> {
  if (typeof raw.emptyReviewEnabled === "boolean") {
    return {
      emptyReviewEnabled: raw.emptyReviewEnabled,
      emptyReviewCustomText: normalizeEmptyReviewCustomText(raw.emptyReviewCustomText),
    };
  }

  const customText = normalizeEmptyReviewCustomText(raw.emptyReviewCustomText);
  const template = raw.emptyReviewTemplate;

  if (template === "custom") {
    return {
      emptyReviewEnabled: customText.length > 0,
      emptyReviewCustomText: customText,
    };
  }

  if (template === "review") {
    return {
      emptyReviewEnabled: true,
      emptyReviewCustomText: customText || "Спасибо за отзыв!",
    };
  }

  if (template === "rating") {
    return {
      emptyReviewEnabled: true,
      emptyReviewCustomText: customText || "Спасибо за оценку!",
    };
  }

  return {
    emptyReviewEnabled: false,
    emptyReviewCustomText: "",
  };
}
