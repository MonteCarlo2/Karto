/**
 * Модели OpenRouter для студии (распознавание, подсказки, концепции).
 * Переопределение через env на Timeweb — без правок кода.
 */

import { resolveOpenRouterTextPrimary } from "@/lib/openrouter-default-models";

/** Vision: названия товара по фото (основная — как GPT-4o-mini на Replicate). */
export function resolveVisionPrimaryModel(): string {
  return (process.env.OPENROUTER_VISION_PRIMARY_MODEL || "").trim() || "openai/gpt-4o-mini";
}

/** Vision: запасная модель (как Claude Sonnet на Replicate). */
export function resolveVisionFallbackModel(): string {
  const primary = resolveVisionPrimaryModel();
  const fb = (process.env.OPENROUTER_VISION_FALLBACK_MODEL || "").trim() || "anthropic/claude-sonnet-4";
  return fb === primary ? "openai/gpt-4o-mini" : fb;
}

/** Текст: подсказки названий, названия из описания. */
export function resolveSuggestNamesModel(): string {
  const fromEnv = (process.env.OPENROUTER_SUGGEST_NAMES_MODEL || "").trim();
  if (fromEnv) return fromEnv;
  return resolveVisionPrimaryModel();
}

/** Концепции карточек (Поток). */
export function resolveConceptModel(): string {
  const fromEnv = (process.env.OPENROUTER_CONCEPT_MODEL || "").trim();
  if (fromEnv) return fromEnv;
  return resolveOpenRouterTextPrimary();
}
