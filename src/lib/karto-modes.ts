/** Названия и подписи режимов KARTO (прайс, navbar, лендинг). */

export const KARTO_FLOW_MODE = {
  title: "Поток",
  tagline: "Когда нужна карточка целиком",
} as const;

export const KARTO_CREATIVE_MODE = {
  title: "Креатив",
  tagline: "Когда нужны отдельные картинки или видео",
} as const;

export const KARTO_REVIEWS_MODE = {
  title: "Отзывы",
  tagline: "Ответы на отзывы покупателей",
} as const;

export const KARTO_PRICING_MODES = [
  KARTO_FLOW_MODE,
  KARTO_CREATIVE_MODE,
  KARTO_REVIEWS_MODE,
] as const;

/** Первый пункт списка «Что вы получаете» для Креатива в прайсе. */
export const KARTO_CREATIVE_VALUE_PROP =
  "Генерируйте карточки, любые изображения и видео";

/** Подпись второго режима в студии Креатива (зависит от формата). */
export function kartoStudioFreeModeLabel(mediaMode: "photo" | "video"): string {
  return mediaMode === "video" ? "Свободное видео" : "Свободное фото";
}
