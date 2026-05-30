/**
 * Модели генерации ответов на отзывы (OpenRouter).
 * Пользователю настраивать не нужно — только OPENROUTER_API_KEY на сервере.
 * Переменные окружения ниже — опциональные override для деплоя, не для UI.
 */
export const AUTO_REPLY_WRITER_MODEL = "qwen/qwen-2.5-72b-instruct";
export const AUTO_REPLY_REVIEW_MODEL = "qwen/qwen-2.5-7b-instruct";

export function resolveAutoReplyWriterModel(): string {
  return (process.env.OPENROUTER_AUTO_REPLY_MODEL || "").trim() || AUTO_REPLY_WRITER_MODEL;
}

export function resolveAutoReplyReviewModel(): string {
  return (process.env.OPENROUTER_AUTO_REPLY_REVIEW_MODEL || "").trim() || AUTO_REPLY_REVIEW_MODEL;
}
