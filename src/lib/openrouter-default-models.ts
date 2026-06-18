/**
 * Модели OpenRouter по умолчанию (если env не задан).
 * Qwen 2.5 72B на части провайдеров OpenRouter отдаёт 400 «does not support endpoint: completions».
 */

export const OPENROUTER_TEXT_PRIMARY_MODEL = "openai/gpt-4o-mini";
export const OPENROUTER_TEXT_FALLBACK_MODEL = "anthropic/claude-sonnet-4";
export const OPENROUTER_TEXT_SECOND_FALLBACK_MODEL = "google/gemini-2.5-flash-preview";

export function resolveOpenRouterTextPrimary(envValue?: string): string {
  const v = (envValue || process.env.OPENROUTER_DESCRIPTION_MODEL || "").trim();
  return v || OPENROUTER_TEXT_PRIMARY_MODEL;
}

export function resolveOpenRouterTextFallback(primary: string, envValue?: string): string {
  const raw = envValue ?? process.env.OPENROUTER_DESCRIPTION_FALLBACK_MODEL;
  if (raw !== undefined && raw.trim() === "") return OPENROUTER_TEXT_FALLBACK_MODEL;
  const fb = (raw || "").trim();
  if (fb && fb !== primary) return fb;
  if (primary !== OPENROUTER_TEXT_FALLBACK_MODEL) return OPENROUTER_TEXT_FALLBACK_MODEL;
  return OPENROUTER_TEXT_SECOND_FALLBACK_MODEL;
}

/** Цепочка моделей для retry при 400/403. */
export function buildOpenRouterModelChain(primary: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (m: string) => {
    const t = m.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };
  add(primary);
  add(resolveOpenRouterTextFallback(primary));
  add(OPENROUTER_TEXT_SECOND_FALLBACK_MODEL);
  return out;
}

export function isOpenRouterModelRoutingError(status: number, errorText: string): boolean {
  if (status === 403 && /Terms Of Service|violation/i.test(errorText)) return true;
  if (status === 400 && /does not support endpoint|INVALID_REQUEST_BODY|model.*not found|No endpoints found/i.test(errorText)) {
    return true;
  }
  return false;
}
