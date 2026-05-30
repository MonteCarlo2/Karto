import type { AutoRepliesShopSettings, StarKey } from "./settings-types";
import { pickSignatureForStar } from "./signature-settings";
import {
  isReviewWithoutText,
  resolveEmptyReviewBody,
  shouldUseEmptyReviewTemplate,
} from "./empty-review-settings";
import {
  finalizeReplyText,
  reviewMentionsDelivery,
  reviewMentionsPhotos,
} from "./reply-postprocess";

export type MockReplyInput = {
  reviewText: string;
  starRating: StarKey;
  shop: AutoRepliesShopSettings;
  brandName?: string | null;
  buyerName?: string | null;
  productName?: string | null;
  hasReviewPhotos?: boolean;
};

function starSentiment(star: StarKey): "positive" | "neutral" | "negative" {
  const n = Number(star);
  if (n <= 2) return "negative";
  if (n >= 4) return "positive";
  return "neutral";
}

const NEGATIVE_REVIEW_RE =
  /ужас|кошмар|брак|обман|верн|не рекоменд|разочар|плох|отврат|помят|мят|поврежд|дефект|бит|скол|царап|трещ|сломан|не работ|бракован|крив|косо|не соответств|разбит|устарел|запах|грязн|пятн|мягковат|тонк|тонковат|хлипк|слабоват|неудоб/i;

const CONS_SECTION_RE = /(?:^|\n|\.\s*)\s*(?:минусы|минус|недостатки|cons)\s*[:\-—]/i;

const POSITIVE_REVIEW_RE =
  /спасиб|отлич|супер|рекоменд|довол|класс|идеал|превосход|гениаль|восторг|красив|удобн|быстр|качеств/i;

export function resolveReviewSentiment(
  text: string,
  star: StarKey
): "positive" | "neutral" | "negative" {
  const t = text.toLowerCase();
  if (NEGATIVE_REVIEW_RE.test(t) || CONS_SECTION_RE.test(text)) return "negative";
  if (POSITIVE_REVIEW_RE.test(t) && !CONS_SECTION_RE.test(text)) return "positive";
  return starSentiment(star);
}

function reviewSentiment(text: string, star: StarKey): "positive" | "neutral" | "negative" {
  return resolveReviewSentiment(text, star);
}

function greeting(
  style: AutoRepliesShopSettings["style"],
  buyerName?: string | null
): string {
  const vy = style.addressForm === "vy";
  const name = buyerName?.trim();
  const useName = style.useBuyerName && name && name.length >= 2;

  if (useName) {
    if (vy) return `Здравствуйте, ${name}!`;
    return `Привет, ${name}!`;
  }
  if (vy) return "Здравствуйте!";
  return "Привет!";
}

function toneOpener(
  sentiment: "positive" | "neutral" | "negative",
  style: AutoRepliesShopSettings["style"],
  greetingLine: string
): string {
  const tone =
    sentiment === "positive"
      ? style.tonePositive
      : sentiment === "negative"
        ? style.toneNegative
        : style.toneNeutral;

  const vy = style.addressForm === "vy";
  const warm = tone === "warm";
  const formal = tone === "formal";

  let tail = "";
  if (sentiment === "negative") {
    if (formal) tail = vy ? "Приносим извинения за доставленные неудобства." : "Приносим извинения — разберёмся.";
    else if (warm) tail = vy ? "Нам очень жаль, что опыт оказался неидеальным." : "Нам жаль, что так вышло.";
    else tail = vy ? "Спасибо за обратную связь — мы разберёмся в ситуации." : "Спасибо за обратную связь — разберёмся.";
  } else if (sentiment === "positive") {
    if (formal) tail = vy ? "Благодарим вас за отзыв." : "Благодарим за отзыв.";
    else if (warm) tail = vy ? "Большое спасибо за тёплые слова!" : "Спасибо за тёплые слова!";
    else tail = vy ? "Спасибо за отзыв и за выбор нашего магазина." : "Спасибо за отзыв!";
  } else {
    if (formal) tail = vy ? "Благодарим за обратную связь." : "Благодарим за обратную связь.";
    else tail = vy ? "Спасибо, что поделились мнением." : "Спасибо, что написали.";
  }

  return `${greetingLine} ${tail}`.replace(/\s+/g, " ").trim();
}

function lengthBody(base: string, length: AutoRepliesShopSettings["style"]["length"]): string {
  if (length === "short") {
    const first = base.split(/(?<=[.!?])\s+/)[0]?.trim();
    return first ? (first.endsWith(".") || first.endsWith("!") || first.endsWith("?") ? first : `${first}.`) : base;
  }
  if (length === "long") {
    return `${base} Мы на связи и поможем решить вопрос по заказу.`;
  }
  return base;
}

function deliverySentence(style: AutoRepliesShopSettings["style"], review: string): string | null {
  if (style.deliveryContext === "ignore" || !reviewMentionsDelivery(review)) return null;
  if (style.deliveryContext === "marketplace") {
    return "Проверим детали доставки вместе с маркетплейсом и постараемся помочь.";
  }
  return "Разберёмся с доставкой и предложим решение.";
}

const DAMAGE_REVIEW_RE = /мят|поврежд|бит|скол|царап|трещ|разбит|упаков/i;

function bodyForSentiment(
  sentiment: "positive" | "neutral" | "negative",
  style: AutoRepliesShopSettings["style"],
  review: string,
  productName?: string | null
): string {
  const t = review.toLowerCase();
  let body =
    sentiment === "negative"
      ? CONS_SECTION_RE.test(review) || /мягковат|тонк|тонковат|хлипк|слаб/i.test(t)
        ? "Спасибо за конкретику — мы учтём замечание по качеству и передадим команде. Если захотите обсудить детали по заказу, напишите в чат — поможем."
        : DAMAGE_REVIEW_RE.test(t)
          ? "Мы уже разбираемся в ситуации и постараемся помочь. Напишите в чат заказа, если нужна замена или возврат."
          : "Мы уже проверяем детали заказа и свяжемся с вами при необходимости."
      : sentiment === "positive"
        ? "Рады, что покупка оправдала ожидания — будем рады видеть вас снова."
        : "Мы учтём ваш комментарий и продолжим улучшать сервис.";

  const delivery = deliverySentence(style, review);
  if (delivery) body = `${body} ${delivery}`;

  if (style.mentionProduct && productName?.trim()) {
    const shortName =
      productName.trim().length > 60 ? `${productName.trim().slice(0, 57)}…` : productName.trim();
    body = `По товару «${shortName}»: ${body.charAt(0).toLowerCase()}${body.slice(1)}`;
  }

  return body;
}

function appendSignature(
  parts: string[],
  shop: AutoRepliesShopSettings,
  star: StarKey,
  brandName?: string | null
): string[] {
  if (!shop.templates.signaturesEnabled) return parts;
  const { text: sig } = pickSignatureForStar(shop.templates, star, brandName);
  if (sig?.trim()) parts.push(sig.trim());
  return parts;
}

/** Локальная генерация — все переключатели стиля, без дословного копирования обучения. */
export function buildMockAutoReply(input: MockReplyInput): string {
  const { reviewText, starRating, shop, brandName, buyerName, productName, hasReviewPhotos } = input;
  const review = reviewText.trim();
  const style = shop.style;

  if (isReviewWithoutText(review)) {
    const body = shouldUseEmptyReviewTemplate(style)
      ? resolveEmptyReviewBody(style)
      : starRating === "5" || Number(starRating) >= 4
        ? "Спасибо за высокую оценку!"
        : "Спасибо за вашу оценку!";
    const parts = appendSignature([body], shop, starRating, brandName);
    return finalizeReplyText(parts.join("\n\n"), shop);
  }

  const sentiment = reviewSentiment(review, starRating);
  let opener = toneOpener(sentiment, style, greeting(style, buyerName));
  if (style.emojis) {
    opener += sentiment === "positive" ? " 😊" : sentiment === "negative" ? "" : "";
  }

  let body = bodyForSentiment(sentiment, style, review, productName);

  if (/жаль|извин/i.test(opener) && /жаль|извин/i.test(body)) {
    body = body.replace(/^[^.!?]*(?:жаль|извин)[^.!?]*[.!?]\s*/i, "").trim();
  }

  if (
    style.thankForPhotos &&
    (hasReviewPhotos || reviewMentionsPhotos(review))
  ) {
    body = `${body} Спасибо, что приложили фото — это помогает другим покупателям.`;
  }

  body = lengthBody(body, style.length);

  const parts = appendSignature([opener, body], shop, starRating, brandName);
  return finalizeReplyText(parts.join("\n\n"), shop);
}

export function settingsCompletionScore(
  shop: AutoRepliesShopSettings,
  needsApi: boolean,
  apiOk: boolean
): number {
  const hasSignature = shop.templates.signatures.some(
    (s) => s.enabled !== false && s.text.trim().length > 3
  );
  const checks = [
    hasSignature,
    shop.training.aboutShop.trim().length > 20 ||
      shop.training.documents.some((d) => d.status === "ready" && d.charCount > 50),
    shop.training.rulesAndFaq.trim().length > 15,
    shop.style.addressForm === "vy" || shop.style.addressForm === "ty",
    !needsApi || apiOk,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}
