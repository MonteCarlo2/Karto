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
  /** Короткая версия для sendPhoto (caption ≤ 1024). */
  compact?: boolean;
}): string {
  const mp = MP_LABEL[input.item.marketplaceId] ?? input.item.marketplaceId;
  const mpEmoji = MP_EMOJI[input.item.marketplaceId] ?? "🛒";
  const shop = escapeHtml(input.shopLabel || input.item.shopName || "Магазин");
  const product = escapeHtml(trimBlock(input.item.productName, input.compact ? 90 : 140));
  const article = input.item.productArticle?.trim()
    ? escapeHtml(trimBlock(input.item.productArticle, input.compact ? 28 : 40))
    : "";
  const buyer = escapeHtml(
    trimBlock(input.item.buyerName || input.item.buyerLabel || "Покупатель", input.compact ? 50 : 80)
  );
  const review = escapeHtml(trimBlock(input.item.reviewText, input.compact ? 220 : 700));
  const draft = escapeHtml(trimBlock(input.item.replyDraft?.trim() || "—", input.compact ? 340 : 950));
  const when = [input.item.dateLabel, input.item.timeLabel].filter(Boolean).join(" · ");

  const header =
    input.status === "sent"
      ? "✅ <b>Ответ отправлен</b>"
      : "📩 <b>Отзыв на подтверждение</b>";

  const lines = [
    header,
    "",
    `${mpEmoji} <b>${mp}</b>  ·  ${shop}`,
    "",
    `📦 <b>${product}</b>`,
  ];

  if (article) lines.push(`<code>${article}</code>`);
  if (when) lines.push(`🕐 ${escapeHtml(when)}`);

  lines.push(
    "",
    `👤 <b>${buyer}</b>`,
    reviewStarLine(input.item.starRating),
    "",
    "━━━━━━━━━━━━━━",
    "💬 <b>Отзыв</b>",
    "",
    review,
    "",
    "━━━━━━━━━━━━━━",
    "✍️ <b>Черновик ответа</b>",
    "",
    draft
  );

  if (input.footer) {
    lines.push("", "━━━━━━━━━━━━━━", escapeHtml(input.footer));
  }

  let text = lines.join("\n");
  if (input.compact && text.length > TG_PHOTO_CAPTION_MAX) {
    const tighterReview = escapeHtml(trimBlock(input.item.reviewText, 120));
    const tighterDraft = escapeHtml(trimBlock(input.item.replyDraft?.trim() || "—", 240));
    const tightLines = [
      header,
      "",
      `${mpEmoji} <b>${mp}</b>  ·  ${shop}`,
      "",
      `📦 <b>${product}</b>`,
      "",
      `👤 <b>${buyer}</b>`,
      reviewStarLine(input.item.starRating),
      "",
      "━━━━━━━━━━━━━━",
      "💬 <b>Отзыв</b>",
      "",
      tighterReview,
      "",
      "━━━━━━━━━━━━━━",
      "✍️ <b>Черновик ответа</b>",
      "",
      tighterDraft,
    ];
    if (input.footer) {
      tightLines.push("", "━━━━━━━━━━━━━━", escapeHtml(input.footer));
    }
    text = tightLines.join("\n");
    if (text.length > TG_PHOTO_CAPTION_MAX) {
      text = `${text.slice(0, TG_PHOTO_CAPTION_MAX - 1)}…`;
    }
  }

  return text;
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
