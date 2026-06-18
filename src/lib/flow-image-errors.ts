import {
  isInsufficientCreditsError,
  isWaveSpeedAuthError,
} from "@/lib/image-provider-keys";

export type FlowImageErrorCode =
  | "IMAGE_PROVIDER_AUTH"
  | "INSUFFICIENT_CREDITS"
  | "SERVICE_UNAVAILABLE"
  | "CONTENT_FILTER";

export function classifyFlowImageError(message: string): {
  code: FlowImageErrorCode;
  status: number;
  userMessage: string;
} {
  if (isWaveSpeedAuthError(message)) {
    return {
      code: "IMAGE_PROVIDER_AUTH",
      status: 401,
      userMessage:
        "Неверный ключ генерации изображений. Проверьте WAVESPEED_API_KEY или EVOLINK_API_KEY в .env.local (или в настройках сервера).",
    };
  }
  if (isInsufficientCreditsError(message)) {
    return {
      code: "INSUFFICIENT_CREDITS",
      status: 402,
      userMessage:
        "Недостаточно кредитов на счёте WaveSpeed/EvoLink. Пополните баланс в личном кабинете провайдера и повторите генерацию.",
    };
  }
  if (
    message.includes("fetch failed") ||
    message.includes("ECONNREFUSED") ||
    message.includes("ETIMEDOUT") ||
    message.toLowerCase().includes("timeout")
  ) {
    return {
      code: "SERVICE_UNAVAILABLE",
      status: 503,
      userMessage:
        "Сервис генерации временно недоступен. Проверьте интернет и повторите позже.",
    };
  }
  return {
    code: "SERVICE_UNAVAILABLE",
    status: 500,
    userMessage: message || "Не удалось сгенерировать изображение.",
  };
}
