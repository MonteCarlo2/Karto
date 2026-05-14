export type BrandLogoPromptInput = {
  brandName: string;
  niche: string;
  description: string;
  paletteColors: string[];
  paletteTitle?: string;
  visualStyleSummary: string;
  toneTitle: string;
  /** Если true — не навязывать палитру онбординга; любая гармоничная палитра по задаче */
  paletteOptOut?: boolean;
};

function clampStr(s: string, max: number): string {
  const t = s.trim();
  if (!t) return "";
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function brandNameScriptInstruction(name: string): string {
  const t = name.trim();
  if (!t) return "";
  const hasCyrillic = /[\u0400-\u04FF]/.test(t);
  const hasLatin = /[A-Za-z]/.test(t);
  if (hasCyrillic && !hasLatin) {
    return `If the logo includes the brand name or any lettering, render it in Cyrillic exactly as given — do not transliterate to Latin or substitute English spellings.`;
  }
  if (hasLatin && !hasCyrillic) {
    return `If the logo includes the brand name or any lettering, use Latin characters exactly as given — do not transliterate to Cyrillic.`;
  }
  return `If the logo includes lettering, match the scripts exactly as in the brand name (Cyrillic and/or Latin only as provided).`;
}

/** Базовый промпт для генерации логотипа: контекст бренда + жёсткая композиция 1:1. */
export function buildBrandLogoBasePrompt(input: BrandLogoPromptInput): string {
  const colors = input.paletteColors.filter(Boolean).slice(0, 6).join(", ");
  const paletteLine = input.paletteTitle ? `Palette preset: ${clampStr(input.paletteTitle, 80)}.` : "";
  const paletteOptOut = Boolean(input.paletteOptOut);
  const colorInstruction = paletteOptOut
    ? `Colors: no fixed onboarding palette — choose any professional, harmonious palette that fits the niche and concept (avoid neon clutter).`
    : colors
      ? `Use these hex colors harmoniously (primary/accent): ${colors}`
      : "";
  const scriptLine = input.brandName ? brandNameScriptInstruction(input.brandName) : "";

  const contextLines = [
    input.brandName ? `Brand name (exact spelling if letters appear): "${clampStr(input.brandName, 80)}"` : "",
    scriptLine,
    input.niche ? `Market niche / category: ${clampStr(input.niche, 140)}` : "",
    input.description ? `Brand positioning & audience (Russian OK): ${clampStr(input.description, 950)}` : "",
    input.visualStyleSummary ? `Visual direction for the mark: ${clampStr(input.visualStyleSummary, 420)}` : "",
    input.toneTitle ? `Voice / tone if any micro-copy on the mark: ${clampStr(input.toneTitle, 140)}` : "",
    paletteLine,
    colorInstruction,
  ].filter(Boolean);
  const contextBlock = contextLines.length > 0 ? contextLines.join("\n") : "No fixed context provided. Follow only user request.";

  return `Professional scalable brand logo concept, square canvas 1:1 aspect ratio.

${contextBlock}

Creative direction:
- Build one clear idea-first concept (metaphor or symbol) tied to the niche and promise, not random generic clipart.
- Keep the concept simple enough to remember in 2 seconds and recognizable at favicon size.
- Prefer meaningful negative space, smart geometry, and disciplined proportions.

Composition rules:
- Single centered logo lockup; artwork should occupy most of the square canvas — minimal empty margin, no thick blank letterboxing or “photo frame” around the mark.
- Prefer soft/off-white or transparent backing only if it naturally matches the artwork edges — avoid a stark white halo bordering colored artwork.
- One finished concept per image; avoid moodboard look or multiple disconnected marks.
- No laptops, phones, browsers, stationery mockups, badges, or watermark text.
- No paragraphs/slogans. Only brand name lettering if needed.

Legal/style:
- Original artwork only — do not copy famous trademarks or recognizable marks.
- Vector-like crisp edges; balanced contrast; export-ready PNG graphic appearance at high resolution.
`;
}

export type LogoConceptVariant = "emblem" | "wordmark";

export function brandLogoVariantSuffix(variant: LogoConceptVariant): string {
  if (variant === "emblem") {
    return `\nConcept A emphasis: symbolic emblem with a strong idea and clean silhouette; optional compact name or monogram.`;
  }
  return `\nConcept B emphasis: refined wordmark/custom lettering with conceptual typographic idea; optional minimal icon only if it reinforces meaning.`;
}

/** Доп. вариант при повторной генерации пользователем */
export function brandLogoAlternateSuffix(): string {
  return `\nConcept emphasis: fresh alternate interpretation with a different visual idea (not just color swap). Keep it on-brand, meaningful, and cleaner than stock clipart.`;
}
