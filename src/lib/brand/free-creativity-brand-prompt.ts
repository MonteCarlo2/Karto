import { resolveEffectiveBrandPaletteColors } from "@/lib/brand/brand-preset-palettes";
import { BRAND_VISUAL_STYLE_OPTIONS } from "@/lib/brand/brand-visual-style-presets";

export type FreeCreativityBrandToggleKey = "name" | "niche" | "description" | "colors" | "style";

export const FREE_BRAND_TOGGLE_DEFAULTS: Record<FreeCreativityBrandToggleKey, boolean> = {
  name: true,
  niche: true,
  description: true,
  colors: true,
  style: true,
};

/** Пять переключателей для свободного творчества (без тона и логотипа). */
export const FREE_BRAND_CONTEXT_ROWS: Array<{ key: FreeCreativityBrandToggleKey; label: string }> = [
  { key: "name", label: "Название" },
  { key: "niche", label: "Ниша" },
  { key: "description", label: "Описание" },
  { key: "colors", label: "Цвета" },
  { key: "style", label: "Стиль" },
];

function clampStr(s: string, max: number): string {
  const t = s.trim();
  if (!t) return "";
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

/** То же описание, что стремится показать профиль: форматированное, иначе сырое. */
export function getBrandDescriptionForFreePrompt(draft: Record<string, unknown>): string {
  const formatted =
    typeof draft.formatted_description === "string" ? draft.formatted_description.trim() : "";
  if (formatted.length > 0) return formatted;
  const raw = typeof draft.description === "string" ? draft.description.trim() : "";
  return raw;
}

export function getVisualStyleSummaryFromBrandDraft(draft: Record<string, unknown>): string {
  const styleId = typeof draft.styleId === "string" ? draft.styleId : "";
  if (styleId === "custom-style") {
    const c = draft.customVisualStyle;
    if (c && typeof c === "object" && !Array.isArray(c)) {
      const o = c as Record<string, unknown>;
      const mood = typeof o.mood === "string" ? o.mood : "";
      const composition = typeof o.composition === "string" ? o.composition : "";
      const scene = typeof o.scene === "string" ? o.scene : "";
      const typography = typeof o.typography === "string" ? o.typography : "";
      const textDensity = typeof o.textDensity === "string" ? o.textDensity : "";
      return `Кастомный стиль: настроение «${mood}», композиция «${composition}», сцена «${scene}», типографика «${typography}», плотность текста «${textDensity}».`;
    }
    return "";
  }
  const s = BRAND_VISUAL_STYLE_OPTIONS.find((x) => x.id === styleId);
  if (!s) return "";
  return `${s.title}. ${s.subtitle}. Настроение: ${s.mood}. Композиция: ${s.composition}, сцена: ${s.scene}, типографика: ${s.typography}.`;
}

/**
 * Префикс к пользовательскому промпту: только включённые переключатели и только при masterEnabled.
 * В конец добавляются жёсткие правила: не тиражировать служебный текст/hex на кадр, язык надписей = язык бренда, если пользователь ниже явно не просит иначе.
 */
export function buildFreeCreativityBrandPromptPrefix(
  draft: Record<string, unknown>,
  toggles: Record<FreeCreativityBrandToggleKey, boolean>,
  masterEnabled: boolean
): string {
  if (!masterEnabled) return "";

  const name = toggles.name && typeof draft.name === "string" ? draft.name.trim() : "";
  const niche = toggles.niche && typeof draft.niche === "string" ? draft.niche.trim() : "";
  const description = toggles.description ? getBrandDescriptionForFreePrompt(draft) : "";

  let colorsLine = "";
  if (toggles.colors) {
    const cols = resolveEffectiveBrandPaletteColors(draft.paletteId, draft.customPaletteColors);
    const hex = cols.filter(Boolean).slice(0, 8).join(", ");
    if (hex) {
      // Название пресета палитры намеренно не передаём — модель копировала его на кадр.
      colorsLine = `Ориентир по оттенкам бренда (только для вашей цветокоррекции и композиции, не выводить на изображение): ${hex}.`;
    }
  }

  let styleLine = "";
  if (toggles.style) {
    const vs = getVisualStyleSummaryFromBrandDraft(draft);
    if (vs) styleLine = `Визуальный стиль: ${clampStr(vs, 800)}`;
  }

  const lines: string[] = [
    "[Контекст бренда для генерации]",
    name ? `Название: ${clampStr(name, 120)}` : "",
    niche ? `Ниша: ${clampStr(niche, 200)}` : "",
    description ? `Описание бренда: ${clampStr(description, 1200)}` : "",
    colorsLine,
    styleLine,
  ].filter(Boolean);

  if (lines.length <= 1) return "";

  const rulesBlock = [
    "Обязательные правила по языку и любому видимому тексту на изображении/кадре:",
    "— Не воспроизводите на кадре служебные фразы из этого блока, подписи полей («Название:», «Ниша:» и т.п.), строку «[Контекст бренда для генерации]», внутренние названия пресетов стиля/палитры, списки кодов вида #RRGGBB как читаемый текст, технические пометки.",
    "— Коды цветов выше использовать только чтобы подобрать гамму; не писать их буквами и цифрами на объектах, фоне, плашках или «логотипе».",
    "— Если название, ниша и описание бренда выше на русском, все осмысленные надписи на результате (название бренда, слоганы, заголовки, текст на упаковке) делайте на русском и для названия копируйте точную форму из строки «Название» без перевода и без латинизации, пока пользователь в своём запросе ниже явно не просит другой язык или латиницу.",
    "— Не переводите брендовый текст на английский «для стиля», если этого нет в запросе пользователя ниже.",
  ].join("\n");

  return `${lines.join("\n")}\n\n${rulesBlock}\n\n---\n\n`;
}

export function mergeFreeCreativityPrompt(userPrompt: string, brandPrefix: string): string {
  const u = userPrompt.trim();
  if (!brandPrefix.trim()) return u;
  return `${brandPrefix}${u}`;
}
