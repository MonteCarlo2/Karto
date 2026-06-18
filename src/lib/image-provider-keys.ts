/** Ключи для генерации изображений (WaveSpeed + совместимость с EVOLINK_API_KEY). */

export function hasWaveSpeedApiKey(): boolean {
  return Boolean(process.env.WAVESPEED_API_KEY?.trim());
}

export function hasEvolinkApiKey(): boolean {
  return Boolean(process.env.EVOLINK_API_KEY?.trim());
}

export function isImageGenerationConfigured(): boolean {
  return hasWaveSpeedApiKey() || hasEvolinkApiKey();
}

export function isWaveSpeedAuthError(message: string): boolean {
  const s = message.toLowerCase();
  return (
    s.includes("401") ||
    s.includes("unauthorized") ||
    s.includes("invalid api key") ||
    s.includes("authentication_error")
  );
}

export function isInsufficientCreditsError(message: string): boolean {
  const s = message.toLowerCase();
  return (
    s.includes("402") ||
    s.includes("insufficient") ||
    s.includes("insufficient_quota") ||
    s.includes("недостаточно кредит")
  );
}

export function shouldFallbackWaveSpeedToEvolink(error: unknown): boolean {
  if (!hasEvolinkApiKey()) return false;
  const msg = error instanceof Error ? error.message : String(error);
  return isWaveSpeedAuthError(msg);
}
