/**
 * Человекочитаемые сообщения об ошибках KIE / Gemini (фильтры контента, лимиты).
 */

export const KIE_CONTENT_FILTER_MESSAGE =
  "Не удалось создать изображение: запрос отклонён фильтром безопасности модели. Так бывает с узнаваемыми кадрами из фильмов и сериалов, известными брендами или темами, которые модель по правилам безопасности не может создать. Попробуйте другой референс или опишите желаемый стиль словами, без копирования конкретной сцены.";

/** Сообщения от KIE / Google при блокировке вывода */
export function isKieContentPolicyError(message: string): boolean {
  const s = message.toLowerCase();
  return (
    s.includes("prohibited use") ||
    s.includes("generative ai prohibited") ||
    s.includes("filtered out") ||
    s.includes("no images found in ai response") ||
    s.includes("content policy") ||
    s.includes("blocked by") ||
    s.includes("safety filter") ||
    s.includes("responsible ai") ||
    s.includes("policy violation") ||
    (s.includes("safety") && s.includes("block")) ||
    (s.includes("image") && s.includes("filtered") && s.includes("violated"))
  );
}

export class KieAiContentFilteredError extends Error {
  readonly code = "CONTENT_FILTER" as const;

  constructor() {
    super(KIE_CONTENT_FILTER_MESSAGE);
    this.name = "KieAiContentFilteredError";
  }
}

/**
 * Текст для JSON ответа API и тоста на фронте (без сырого английского от модели/API).
 */
export function kieErrorToClient(error: unknown): { message: string; code?: "CONTENT_FILTER" } {
  if (error instanceof KieAiContentFilteredError) {
    return { message: error.message, code: "CONTENT_FILTER" };
  }

  const raw = error instanceof Error ? error.message : String(error);
  if (isKieContentPolicyError(raw)) {
    return { message: KIE_CONTENT_FILTER_MESSAGE, code: "CONTENT_FILTER" };
  }

  let m = raw
    .replace(/^KIE AI ошибка:\s*/i, "")
    .replace(/^KIE AI генерация не удалась:\s*/i, "")
    .trim();

  const modelPrefix = /^Модель не смогла (?:сгенерировать изображение|отредактировать изображение)\.\s*Ошибка:\s*/i;
  if (modelPrefix.test(m)) {
    m = m.replace(modelPrefix, "").trim();
    if (isKieContentPolicyError(m)) {
      return { message: KIE_CONTENT_FILTER_MESSAGE, code: "CONTENT_FILTER" };
    }
  }

  if (m.length <= 220 && /[а-яё]/i.test(m)) {
    return { message: m };
  }

  if (m.length <= 80 && m.length > 0) {
    return { message: m };
  }

  return {
    message:
      "Не удалось сгенерировать изображение. Попробуйте позже, измените промпт или референс.",
  };
}
