import type { InboxReviewItem } from "@/lib/auto-replies/inbox-demo-data";
import type { AutoRepliesMarketplaceId } from "@/lib/auto-replies/types";
import type { InlineKeyboardButton } from "./bot-api";
import { shortCallbackId } from "./telegram-db";

const MP_LABEL: Record<AutoRepliesMarketplaceId, string> = {
  wildberries: "Wildberries",
  ozon: "Ozon",
  yandex: "Яндекс Маркет",
};

const MP_EMOJI: Record<AutoRepliesMarketplaceId, string> = {
  wildberries: "🟣",
  ozon: "🔵",
  yandex: "🟡",
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function trimBlock(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function reviewStarLine(starRating: number | string): string {
  const r = Math.min(5, Math.max(0, Math.round(Number(starRating) || 0)));
  return `${"⭐".repeat(r)}${"☆".repeat(5 - r)}  <b>${r}/5</b>`;
}

export function getReviewCardPhotos(
  item: Pick<InboxReviewItem, "productImageUrl" | "reviewPhotoUrls">
): { productPhotoUrl: string | null; reviewPhotoUrl: string | null } {
  const reviewPhoto =
    item.reviewPhotoUrls?.find((u) => u?.trim().startsWith("http"))?.trim() ?? null;
  const product = item.productImageUrl?.trim();
  const productPhotoUrl = product?.startsWith("http") ? product : null;
  return { productPhotoUrl, reviewPhotoUrl: reviewPhoto };
}

/** Одно фото для простой карточки (приоритет — фото из отзыва). */
export function getReviewPhotoUrl(
  item: Pick<InboxReviewItem, "productImageUrl" | "reviewPhotoUrls">
): string | null {
  const { productPhotoUrl, reviewPhotoUrl } = getReviewCardPhotos(item);
  return reviewPhotoUrl ?? productPhotoUrl;
}

/** Лимит подписи к фото в Telegram Bot API. */
export const TG_PHOTO_CAPTION_MAX = 1024;

/** Лимит обычного текстового сообщения в Telegram Bot API. */
export const TG_MESSAGE_MAX = 4096;

export type TelegramReviewCardFormat = "photo-caption" | "text-message";

function buildReviewCardLines(input: {
  header: string;
  mpEmoji: string;
  mp: string;
  shop: string;
  product: string;
  article: string;
  when: string;
  buyer: string;
  starRating: number | string;
  review: string;
  draft: string;
  footer?: string;
  includeMeta: boolean;
}): string[] {
  const lines = [input.header, "", `${input.mpEmoji} <b>${input.mp}</b>  ·  ${input.shop}`, ""];

  if (input.includeMeta) {
    lines.push(`📦 <b>${input.product}</b>`);
    if (input.article) lines.push(`<code>${input.article}</code>`);
    if (input.when) lines.push(`🕐 ${input.when}`);
  } else {
    lines.push(`📦 <b>${input.product}</b>`, "");
  }

  lines.push(
    `👤 <b>${input.buyer}</b>`,
    reviewStarLine(input.starRating),
    "",
    "━━━━━━━━━━━━━━",
    "💬 <b>Отзыв</b>",
    "",
    input.review,
    "",
    "━━━━━━━━━━━━━━",
    "✍️ <b>Черновик ответа</b>",
    "",
    input.draft
  );

  if (input.footer) {
    lines.push("", "━━━━━━━━━━━━━━", input.footer);
  }

  return lines;
}

function fitReviewCardToLimit(input: {
  header: string;
  mpEmoji: string;
  mp: string;
  shop: string;
  product: string;
  article: string;
  when: string;
  buyer: string;
  starRating: number | string;
  reviewText: string;
  draftText: string;
  footer?: string;
  includeMeta: boolean;
  maxLen: number;
}): string {
  const footer = input.footer ? escapeHtml(input.footer) : undefined;
  const reviewRaw = input.reviewText.trim() || "—";
  const draftRaw = input.draftText.trim() || "—";

  let reviewLimit = reviewRaw.length;
  let draftLimit = draftRaw.length;

  for (let pass = 0; pass < 24; pass += 1) {
    const review = escapeHtml(trimBlock(reviewRaw, reviewLimit));
    const draft = escapeHtml(trimBlock(draftRaw, draftLimit));
    const text = buildReviewCardLines({
      header: input.header,
      mpEmoji: input.mpEmoji,
      mp: input.mp,
      shop: input.shop,
      product: input.product,
      article: input.article,
      when: input.when,
      buyer: input.buyer,
      starRating: input.starRating,
      review,
      draft,
      footer,
      includeMeta: input.includeMeta,
    }).join("\n");

    if (text.length <= input.maxLen) return text;

    if (draftLimit > 120) {
      draftLimit = Math.max(120, Math.floor(draftLimit * 0.85));
      continue;
    }
    if (reviewLimit > 80) {
      reviewLimit = Math.max(80, Math.floor(reviewLimit * 0.85));
      continue;
    }

    return `${text.slice(0, input.maxLen - 1)}…`;
  }

  return buildReviewCardLines({
    header: input.header,
    mpEmoji: input.mpEmoji,
    mp: input.mp,
    shop: input.shop,
    product: input.product,
    article: input.article,
    when: input.when,
    buyer: input.buyer,
    starRating: input.starRating,
    review: escapeHtml(trimBlock(reviewRaw, 80)),
    draft: escapeHtml(trimBlock(draftRaw, 120)),
    footer,
    includeMeta: input.includeMeta,
  }).join("\n");
}

export function formatTelegramReviewCard(input: {
  item: Pick<
    InboxReviewItem,
    | "productName"
    | "starRating"
    | "reviewText"
    | "replyDraft"
    | "marketplaceId"
    | "shopName"
    | "buyerLabel"
    | "buyerName"
    | "productArticle"
    | "dateLabel"
    | "timeLabel"
  >;
  shopLabel?: string;
  status?: "pending" | "sent";
  footer?: string;
  /** @deprecated Используйте format. */
  compact?: boolean;
  /** photo-caption — подпись к фото (≤1024); text-message — отдельное сообщение (≤4096). */
  format?: TelegramReviewCardFormat;
}): string {
  const cardFormat: TelegramReviewCardFormat =
    input.format ?? (input.compact ? "photo-caption" : "text-message");
  const isCaption = cardFormat === "photo-caption";
  const maxLen = isCaption ? TG_PHOTO_CAPTION_MAX : TG_MESSAGE_MAX;

  const mp = MP_LABEL[input.item.marketplaceId] ?? input.item.marketplaceId;
  const mpEmoji = MP_EMOJI[input.item.marketplaceId] ?? "🛒";
  const shop = escapeHtml(input.shopLabel || input.item.shopName || "Магазин");
  const product = escapeHtml(trimBlock(input.item.productName, isCaption ? 90 : 200));
  const article = input.item.productArticle?.trim()
    ? escapeHtml(trimBlock(input.item.productArticle, isCaption ? 28 : 48))
    : "";
  const buyer = escapeHtml(
    trimBlock(input.item.buyerName || input.item.buyerLabel || "Покупатель", isCaption ? 50 : 120)
  );
  const when = escapeHtml([input.item.dateLabel, input.item.timeLabel].filter(Boolean).join(" · "));

  const header =
    input.status === "sent"
      ? "✅ <b>Ответ отправлен</b>"
      : "📩 <b>Отзыв на подтверждение</b>";

  return fitReviewCardToLimit({
    header,
    mpEmoji,
    mp,
    shop,
    product,
    article,
    when,
    buyer,
    starRating: input.item.starRating,
    reviewText: input.item.reviewText,
    draftText: input.item.replyDraft?.trim() || "—",
    footer: input.footer,
    includeMeta: !isCaption || Boolean(article || when),
    maxLen,
  });
}

/** Три кнопки: подтвердить (отдельной строкой), изменить + перегенерировать. */
export function reviewActionKeyboard(messageId: string): { inline_keyboard: InlineKeyboardButton[][] } {
  const sid = shortCallbackId(messageId);
  return {
    inline_keyboard: [
      [{ text: "✅  ПОДТВЕРДИТЬ И ОТПРАВИТЬ", callback_data: `cfm:${sid}` }],
      [
        { text: "✏️ Изменить", callback_data: `edt:${sid}` },
        { text: "🔄 Перегенерировать", callback_data: `rgn:${sid}` },
      ],
    ],
  };
}

export function reviewSentKeyboard(): { inline_keyboard: InlineKeyboardButton[][] } {
  return { inline_keyboard: [] };
}
