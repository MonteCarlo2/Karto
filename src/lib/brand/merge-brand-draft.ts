/** Старые id после расширения списка тонов */
export const LEGACY_TONE_IDS: Record<string, string> = {
  poetic: "story",
  playful: "lifestyle",
  neutral: "marketplace",
};

/**
 * Восстанавливает черновик из localStorage/JSONB: поверхностьное слияние с шаблоном по умолчанию,
 * правки legacy tone id и типовых полей-массивов.
 */
export function mergePersistedIntoBrandDraft<D extends Record<string, unknown>>(
  emptyTemplate: D,
  parsed: unknown
): D {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ...emptyTemplate };
  }
  const raw = parsed as Record<string, unknown>;
  const empty = emptyTemplate as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...empty, ...raw };

  const nameAssist = merged.nameAssist;
  if (!nameAssist) {
    merged.nameAssist = "off";
  } else if (nameAssist !== "off" && nameAssist !== "need_name" && nameAssist !== "picked") {
    merged.nameAssist = "off";
  }

  const toneId = merged.toneId;
  if (typeof toneId === "string" && LEGACY_TONE_IDS[toneId]) {
    merged.toneId = LEGACY_TONE_IDS[toneId];
  }

  const emptyCv = empty.customVisualStyle;
  const cv = raw.customVisualStyle;
  if (cv && typeof cv === "object" && !Array.isArray(cv) && emptyCv && typeof emptyCv === "object" && !Array.isArray(emptyCv)) {
    merged.customVisualStyle = {
      ...(emptyCv as Record<string, unknown>),
      ...(cv as Record<string, unknown>),
    };
  }

  if (!Array.isArray(merged.customPaletteColors)) {
    merged.customPaletteColors = empty.customPaletteColors;
  }

  if (!Array.isArray(merged.logoGeneratedUrls)) {
    merged.logoGeneratedUrls = [];
  }

  const tl = merged.toneLength;
  if (tl !== "short" && tl !== "long") {
    merged.toneLength = "short";
  }

  return merged as D;
}
