import type {
  AutoRepliesMarketplaceSettings,
  AutoRepliesShopSettings,
  StarKey,
} from "./settings-types";
import {
  isReviewWithoutText,
  resolveEmptyReviewBody,
  shouldUseEmptyReviewTemplate,
} from "./empty-review-settings";
import { buildTrainingKnowledgeSnippet } from "./training-knowledge";
import { pickSignatureForStar, resolveSignatureText } from "./signature-settings";
import { buildMockAutoReply, resolveReviewSentiment } from "./mock-reply";
import { buildSettingsSnapshotForPrompt } from "./reply-history-store";
import { reviewMentionsDelivery, reviewMentionsPhotos } from "./reply-postprocess";

export type GenerateReplyRequest = {
  reviewText: string;
  starRating: StarKey;
  shop: AutoRepliesShopSettings;
  mp: AutoRepliesMarketplaceSettings;
  brandName?: string | null;
  buyerName?: string | null;
  productName?: string | null;
  hasReviewPhotos?: boolean;
  revisionHint?: string | null;
  /** Предыдущий вариант ответа — только при перегенерации с уточнением. */
  previousReply?: string | null;
};

const TONE_RU: Record<string, string> = {
  warm: "тёплый, дружелюбный",
  neutral: "спокойный, нейтральный",
  formal: "официальный, сдержанный",
};

const LENGTH_RU: Record<string, string> = {
  short: "короткий (1–2 предложения)",
  normal: "средний (2–4 предложения)",
  long: "развёрнутый (4–6 предложений)",
  auto: "подходящий по ситуации",
};

function toneForStar(star: StarKey, style: AutoRepliesShopSettings["style"]): string {
  const n = Number(star);
  if (n <= 2) return TONE_RU[style.toneNegative] ?? "нейтральный";
  if (n >= 4) return TONE_RU[style.tonePositive] ?? "тёплый";
  return TONE_RU[style.toneNeutral] ?? "нейтральный";
}

function toneForSentiment(
  sentiment: "positive" | "neutral" | "negative",
  style: AutoRepliesShopSettings["style"]
): string {
  const tone =
    sentiment === "positive"
      ? style.tonePositive
      : sentiment === "negative"
        ? style.toneNegative
        : style.toneNeutral;
  return TONE_RU[tone] ?? "нейтральный";
}

function reviewMentionsProduct(review: string, productName?: string | null): boolean {
  if (productName?.trim()) return true;
  return /товар|заказ|покупк|артикул|модел|размер|цвет|упаковк|доставк/i.test(review);
}

function reviewMentionsPhotosInText(review: string): boolean {
  return reviewMentionsPhotos(review);
}

function buildManualModeRules(
  review: string,
  style: AutoRepliesShopSettings["style"],
  hasReviewPhotos?: boolean
): string[] {
  const lines = [
    "РЕЖИМ РУЧНОГО ВВОДА (только текст отзыва, без данных кабинета):",
    "— Имя покупателя недоступно: не обращайся по имени, даже если настройка включена.",
    reviewMentionsProduct(review, null)
      ? "— Покупатель упомянул товар/заказ в тексте — можно аккуратно ответить по теме."
      : "— Конкретный товар неизвестен: не называй товар, если покупатель сам не написал о нём.",
  ];

  if ((hasReviewPhotos || reviewMentionsPhotosInText(review)) && style.thankForPhotos) {
    lines.push("— Есть фото или упоминание фото — поблагодари за фото.");
  } else {
    lines.push("— Не благодари за фото: фотографий нет и в тексте они не упомянуты.");
  }

  return lines;
}

function buildRevisionPromptParts(
  revisionHint: string | null | undefined,
  previousReply: string | null | undefined
): { systemRules: string[]; userAppend: string } {
  const hint = revisionHint?.trim();
  if (!hint) {
    return { systemRules: [], userAppend: "" };
  }

  const systemRules = [
    "РЕЖИМ ПЕРЕГЕНЕРАЦИИ: продавец просит изменить уже сгенерированный ответ.",
    `ОБЯЗАТЕЛЬНО выполни уточнение продавца полностью и явно: «${hint}».`,
    "Уточнение продавца имеет наивысший приоритет — ответ должен отражать это пожелание.",
    "Сохрани остальные настройки: тон, длину, обращение, подпись, минус-слова и стоп-слова.",
  ];

  let userAppend = `\n\n--- УТОЧНЕНИЕ ПРОДАВЦА (обязательно к выполнению) ---\n${hint}`;

  const prev = previousReply?.trim();
  if (prev) {
    userAppend += `\n\n--- ПРЕДЫДУЩИЙ ВАРИАНТ ОТВЕТА ---\n${prev}`;
    userAppend +=
      "\n\nСформируй новый ответ: учти уточнение продавца и измени формулировку там, где это нужно. Не игнорируй уточнение.";
  }

  return { systemRules, userAppend };
}

function applyLocalRevisionHint(reply: string, hint: string): string {
  let text = reply.trim();
  const h = hint.toLowerCase();

  if (/корот|короч|кратк|1[\s-]*предлож|две строки|2[\s-]*предлож/.test(h)) {
    const first = text.split(/(?<=[.!?])\s+/)[0]?.trim();
    if (first) text = first.endsWith(".") || first.endsWith("!") || first.endsWith("?") ? first : `${first}.`;
  }

  if (/без эмодзи|убери эмодзи|emoji|смайл/.test(h)) {
    text = text.replace(/\p{Extended_Pictographic}/gu, "").replace(/\s{2,}/g, " ").trim();
  }

  if (/официальн|формальн|на «вы»|на вы/.test(h)) {
    text = text.replace(/\bПривет\b/g, "Здравствуйте").replace(/\bты\b/gi, (m) => (m === "ты" ? "вы" : "Вы"));
  }

  if (/тепл|дружел|мягк/.test(h) && !/официальн|формальн/.test(h)) {
    if (/^Здравствуйте[.!]/i.test(text) && !/рад|приятно|спасибо/i.test(text.slice(0, 80))) {
      text = text.replace(/^Здравствуйте[.!]\s*/i, "Здравствуйте! Спасибо за обратную связь. ");
    }
  }

  const addMatch = hint.match(/(?:добав(?:ь|ить)|упомян(?:и|ить)|напиш(?:и|ите))\s+[«"]?([^»"\n.]+)[»"]?/i);
  if (addMatch?.[1]) {
    const phrase = addMatch[1].trim();
    if (phrase && !text.toLowerCase().includes(phrase.toLowerCase())) {
      const parts = text.split(/\n\n+/);
      const body = parts.length > 1 ? parts.slice(0, -1).join("\n\n") : parts[0] ?? text;
      const sig = parts.length > 1 ? parts[parts.length - 1] : null;
      text = sig ? `${body}\n\n${phrase}\n\n${sig}` : `${body} ${phrase.endsWith(".") ? phrase : `${phrase}.`}`;
    }
  }

  return text;
}

export function buildAutoReplyPrompt(input: GenerateReplyRequest): {
  system: string;
  user: string;
  signatureLine: string | null;
} {
  const { reviewText, starRating, shop, mp, brandName, buyerName, productName, hasReviewPhotos, revisionHint, previousReply } = input;
  const style = shop.style;
  const review = reviewText.trim();
  const isManual = mp.usage === "manual";
  const isEmpty = isReviewWithoutText(review);
  const revision = buildRevisionPromptParts(revisionHint, previousReply);

  const snapshot = buildSettingsSnapshotForPrompt({ shop, mp, brandName, starRating, reviewText });

  const { text: signatureRaw } = pickSignatureForStar(shop.templates, starRating, brandName);
  const signatureLine =
    shop.templates.signaturesEnabled && signatureRaw
      ? resolveSignatureText(signatureRaw, brandName)
      : null;

  const training = buildTrainingKnowledgeSnippet(shop.training);

  const minusWords =
    shop.advanced.minusWordsEnabled && shop.advanced.minusWords.length
      ? shop.advanced.minusWords.join(", ")
      : null;

  const stopWords =
    shop.advanced.stopWordsEnabled && shop.advanced.stopWords.length
      ? shop.advanced.stopWords.join(", ")
      : null;

  const rules: string[] = [
    "Ты пишешь ответ продавца на отзыв покупателя на маркетплейсе от имени магазина.",
    "Отвечай на ТЕКСТ отзыва — разбирай формулировки покупателя (минусы, плюсы, вопросы). Оценка в звёздах — контекст настроения: используй текст и звёзды вместе, но содержание ответа строй по тексту отзыва.",
    "Не используй шаблон «покупка оправдала ожидания», если в отзыве есть жалобы, минусы или сомнения в качестве.",
    "Язык ответа: ТОЛЬКО русский. Запрещены китайский, английский и другие языки (допустимы лatin-названия брендов и товаров).",
    "Пиши только текст ответа — без пояснений, заголовков и markdown.",
    "Длинные ответы (от ~200 символов) можно разбить на 1–2 абзаца с пустой строкой между ними. Короткие и средние — одним блоком, без лишних переносов.",
    "Никогда не вставляй в текст служебные ключи vy, ty, addressForm и подобные — только живой русский язык.",
    "Строго следуй ВСЕМ применимым настройкам из JSON ниже.",
    "Раздел «Правила, возврат и ограничения» в базе знаний важнее любых шаблонов: если там запрещено «напишите в чат» — не предлагай писать в чат или личные сообщения.",
    "Не выдумывай факты, скидки, компенсации и контакты, которых нет в материалах.",
    brandName?.trim() ? `Название магазина: «${brandName.trim()}».` : "",
    style.addressForm === "vy"
      ? "Обращайся на «вы» с заглавной буквы."
      : "Обращайся на «ты», дружелюбно.",
    style.emojis ? "Можно 1–2 уместных эмодзи." : "Без эмодзи.",
    `Контекст доставки: ${snapshot.style.deliveryContextRu}.`,
    `Тон ответа (${starRating}★, по смыслу отзыва): ${toneForSentiment(resolveReviewSentiment(review, starRating), style)}.`,
    `Длина ответа: ${LENGTH_RU[style.length] ?? LENGTH_RU.normal}.`,
    `Пресет стиля: ${snapshot.style.presetTitle}.`,
    `Тоны по типу отзыва — позитивный: ${TONE_RU[style.tonePositive]}, нейтральный: ${TONE_RU[style.toneNeutral]}, негативный: ${TONE_RU[style.toneNegative]}.`,
    minusWords ? `Никогда не используй слова: ${minusWords}.` : "",
    stopWords
      ? `Стоп-слова в отзыве (ответ должен быть тактичным): ${stopWords}.`
      : "",
    shop.templates.signaturesEnabled && signatureLine
      ? `Заверши ответ подписью (отдельной строкой): «${signatureLine}».`
      : "Подпись и прощание магазина НЕ добавляй: без «С уважением», без названия магазина и без команды в конце — только текст ответа.",
  ].filter(Boolean);

  if (isManual) {
    rules.push(...buildManualModeRules(review, style, hasReviewPhotos));
  } else {
    if (style.useBuyerName && buyerName?.trim()) {
      rules.push(
        `Имя покупателя: «${buyerName.trim()}». Обратись по имени один раз в начале, не повторяй в каждом предложении.`
      );
    } else if (style.useBuyerName) {
      rules.push("Имя покупателя неизвестно — не выдумывай имя.");
    } else {
      rules.push("Не обращайся по имени.");
    }
    if (style.mentionProduct && productName?.trim()) {
      rules.push(`Товар: «${productName.trim()}». Упомяни его один раз, если уместно.`);
    } else if (style.mentionProduct) {
      rules.push("При уместности упомяни товар или заказ.");
    }
    if (style.thankForPhotos && (hasReviewPhotos || reviewMentionsPhotosInText(review))) {
      rules.push("К отзыву приложены фото — поблагодари за фото.");
    } else if (style.thankForPhotos) {
      rules.push("Не благодари за фото — фотографий нет.");
    }
    if (style.deliveryContext !== "ignore" && reviewMentionsDelivery(review)) {
      rules.push(
        style.deliveryContext === "marketplace"
          ? "В отзыве упомянута доставка — ответь с учётом логистики маркетплейса."
          : "В отзыве упомянута доставка — ответь от лица продавца."
      );
    }
  }

  if (training) {
    rules.push(
      "База знаний магазина — для понимания контекста (чем занимается магазин, правила, документы).",
      "НИКОГДА не копируй текст базы знаний дословно — только перефразируй и вплетай факты естественно.",
      "Если в правилах указано, как отвечать на негатив или что не писать — это обязательно.",
      `Контекст:\n${training.slice(0, 12000)}`
    );
  }

  if (revision.systemRules.length) {
    rules.push(...revision.systemRules);
  }

  if (shop.training.referenceImages.length) {
    rules.push(
      `Справочные фото товаров (только названия файлов): ${shop.training.referenceImages.map((i) => i.name).join(", ")}.`,
      "Содержимое изображений в промпт не передаётся — не описывай товар по фото, если этого нет в тексте отзыва или базе знаний."
    );
  }

  rules.push(
    `\n--- ПОЛНЫЙ JSON НАСТРОЕК ---\n${JSON.stringify(snapshot, null, 2)}`
  );

  const system = rules.join("\n");

  if (isEmpty) {
    const template =
      shouldUseEmptyReviewTemplate(style)
        ? resolveEmptyReviewBody(style)
        : "Спасибо за вашу оценку!";
    let user = `Отзыв без текста — только ${starRating} звёзд. Используй шаблон для пустого отзыва как основу: «${template}».`;
    user += revision.userAppend;
    return {
      system,
      user,
      signatureLine,
    };
  }

  let user = `Оценка: ${starRating} из 5.\n\nТекст отзыва (на него нужно ответить):\n${review}`;
  user += revision.userAppend;

  return { system, user, signatureLine };
}

/** Промпт второй модели: проверка черновика и точечные правки по настройкам. */
export function buildAutoReplyReviewPrompt(
  input: GenerateReplyRequest,
  draftReply: string
): { system: string; user: string } {
  const { reviewText, starRating, shop, mp, brandName, buyerName, productName } = input;
  const review = reviewText.trim();
  const snapshot = buildSettingsSnapshotForPrompt({ shop, mp, brandName, starRating, reviewText });
  const draft = draftReply.trim();

  const system = [
    "Ты — редактор качества ответов продавца на отзыв покупателя на маркетплейсе.",
    "Ответ должен соответствовать тексту отзыва и оценке в звёздах вместе. Язык — только русский, без китайского и других языков.",
    "Тебе передан черновик ответа от другой модели, текст отзыва и полный JSON настроек магазина.",
    "Проверь черновик на соответствие ВСЕМ настройкам: тон, длина, обращение, подпись, минус-слова, контекст доставки, упоминание товара/имени, эмодзи.",
    "Если черновик уже корректен — верни его БЕЗ ИЗМЕНЕНИЙ.",
    "Если есть нарушения — исправь ТОЛЬКО проблемные места. Сохраняй формулировки, структуру и тон черновика.",
    "Запрещено: переписывать ответ целиком; добавлять обещания компенсации/замены без оснований в материалах; markdown; пояснения.",
    "Верни ТОЛЬКО финальный текст ответа — одним сообщением, без кавычек и преамбулы.",
  ].join("\n");

  const userParts = [
    `Оценка: ${starRating} из 5.`,
    buyerName?.trim() ? `Имя покупателя: ${buyerName.trim()}.` : "",
    productName?.trim() ? `Товар: ${productName.trim()}.` : "",
    `\nТекст отзыва:\n${review || "Покупатель не оставил текста — только оценка."}`,
    `\nЧерновик ответа (от первой модели):\n${draft}`,
    `\n--- ПОЛНЫЙ JSON НАСТРОЕК ---\n${JSON.stringify(snapshot, null, 2)}`,
  ].filter(Boolean);

  return { system, user: userParts.join("\n") };
}

export function buildLocalAutoReply(input: GenerateReplyRequest): string {
  const { reviewText, shop, brandName, starRating, buyerName, productName, hasReviewPhotos, revisionHint, previousReply } =
    input;
  const hint = revisionHint?.trim();

  if (hint && previousReply?.trim()) {
    return applyLocalRevisionHint(previousReply.trim(), hint);
  }

  const fresh = buildMockAutoReply({
    reviewText,
    starRating,
    shop,
    brandName,
    buyerName,
    productName,
    hasReviewPhotos,
  });
  return hint ? applyLocalRevisionHint(fresh, hint) : fresh;
}
