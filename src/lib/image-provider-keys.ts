/** Ключи для генерации изображений (WaveSpeed + KIE + EVOLINK_API_KEY). */

export type FlowImageProvider = "kie" | "wavespeed" | "evolink";

export function hasWaveSpeedApiKey(): boolean {
  return Boolean(process.env.WAVESPEED_API_KEY?.trim());
}

export function hasEvolinkApiKey(): boolean {
  return Boolean(process.env.EVOLINK_API_KEY?.trim());
}

export function hasKieAiApiKey(): boolean {
  return Boolean(
    process.env.KIE_AI_API_KEY?.trim() || process.env.KIE_API_KEY?.trim()
  );
}

export function isImageGenerationConfigured(): boolean {
  return hasWaveSpeedApiKey() || hasEvolinkApiKey() || hasKieAiApiKey();
}

function flowPreferKie(): boolean {
  const v = process.env.FLOW_IMAGE_PREFER_KIE?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Провайдер для Потока (карточки, слайды). FLOW_IMAGE_PROVIDER=kie|wavespeed|evolink|auto */
export function getFlowImageProvider(): FlowImageProvider {
  const raw = (process.env.FLOW_IMAGE_PROVIDER?.trim().toLowerCase() || "auto") as
    | "kie"
    | "wavespeed"
    | "evolink"
    | "auto";

  if (raw === "kie") {
    if (hasKieAiApiKey()) return "kie";
    if (hasWaveSpeedApiKey()) return "wavespeed";
    return "evolink";
  }
  if (raw === "wavespeed") {
    if (hasWaveSpeedApiKey()) return "wavespeed";
    if (hasKieAiApiKey()) return "kie";
    return "evolink";
  }
  if (raw === "evolink") {
    if (hasEvolinkApiKey()) return "evolink";
    if (hasKieAiApiKey()) return "kie";
    return "wavespeed";
  }

  // auto: при FLOW_IMAGE_PREFER_KIE=1 — KIE (стабильнее edit, см. A/B с WaveSpeed)
  if (flowPreferKie() && hasKieAiApiKey()) return "kie";
  if (hasWaveSpeedApiKey()) return "wavespeed";
  if (hasKieAiApiKey()) return "kie";
  return "evolink";
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
