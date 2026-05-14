export type BrandPresetPalette = {
  id: string;
  title: string;
  subtitle: string;
  colors: string[];
};

/** Пресеты палитр онбординга бренда — один источник для мастера и профиля. */
export const BRAND_PRESET_PALETTES: BrandPresetPalette[] = [
  {
    id: "sage",
    title: "Sage",
    subtitle: "natural premium",
    colors: ["#172217", "#2E5A43", "#BFD6A8", "#F5F2EA"],
  },
  {
    id: "warm",
    title: "Warm",
    subtitle: "soft commerce",
    colors: ["#2C2118", "#C78346", "#F1D4AC", "#FFF8EF"],
  },
  {
    id: "mono",
    title: "Mono",
    subtitle: "clean contrast",
    colors: ["#050505", "#343434", "#D8D8D8", "#FAFAFA"],
  },
  {
    id: "berry",
    title: "Berry",
    subtitle: "beauty accent",
    colors: ["#431327", "#B83262", "#F49AB8", "#FFF1F6"],
  },
  { id: "citrus", title: "Citrus", subtitle: "fresh shelf", colors: ["#12140B", "#B9FF4B", "#F5D04C", "#FFF8D9"] },
  { id: "ink", title: "Ink", subtitle: "editorial", colors: ["#001858", "#172C66", "#F582AE", "#FEF6E4"] },
  { id: "coral", title: "Coral", subtitle: "warm beauty", colors: ["#2A1A1F", "#FF8E3C", "#D9376E", "#FFF1E6"] },
  { id: "ice", title: "Ice", subtitle: "tech clean", colors: ["#0F172A", "#38BDF8", "#A7F3D0", "#F8FAFC"] },
  { id: "lavender", title: "Lavender", subtitle: "soft luxe", colors: ["#231942", "#5E548E", "#E0B1CB", "#F8EDF4"] },
  { id: "sunset", title: "Sunset", subtitle: "bold warm", colors: ["#1F1300", "#FF7A00", "#FFC857", "#FFF3D6"] },
  { id: "mint", title: "Mint", subtitle: "clean care", colors: ["#12372A", "#2DD4BF", "#CFFAFE", "#F0FDFA"] },
  { id: "denim", title: "Denim", subtitle: "trust retail", colors: ["#081A33", "#1D4ED8", "#93C5FD", "#EFF6FF"] },
  { id: "sand", title: "Sand", subtitle: "home calm", colors: ["#2B2118", "#A47551", "#E7D3B0", "#FBF4E8"] },
  { id: "lime-black", title: "Lime", subtitle: "karto energy", colors: ["#070907", "#2E5A43", "#B9FF4B", "#F3F1EA"] },
  { id: "plum", title: "Plum", subtitle: "deep premium", colors: ["#1A1027", "#6D28D9", "#C4B5FD", "#F5F3FF"] },
  { id: "tomato", title: "Tomato", subtitle: "market pop", colors: ["#260B08", "#EF4444", "#FDBA74", "#FFF7ED"] },
  { id: "olive", title: "Olive", subtitle: "natural store", colors: ["#1C2117", "#687A31", "#D9E7A2", "#FAF7E8"] },
  { id: "sky", title: "Sky", subtitle: "light service", colors: ["#102A43", "#0EA5E9", "#BAE6FD", "#F0F9FF"] },
  { id: "candy", title: "Candy", subtitle: "playful", colors: ["#2D0A31", "#D946EF", "#F0ABFC", "#FDF4FF"] },
  { id: "graphite", title: "Graphite", subtitle: "strict", colors: ["#111827", "#374151", "#D1D5DB", "#F9FAFB"] },
  { id: "honey", title: "Honey", subtitle: "warm food", colors: ["#281605", "#F59E0B", "#FDE68A", "#FFFBEB"] },
  { id: "peach", title: "Peach", subtitle: "soft family", colors: ["#32140F", "#FB7185", "#FDBA74", "#FFF1E7"] },
  { id: "royal", title: "Royal", subtitle: "status", colors: ["#0B1026", "#4338CA", "#FACC15", "#EEF2FF"] },
  { id: "paper", title: "Paper", subtitle: "quiet minimal", colors: ["#1F2937", "#6B7280", "#E5E7EB", "#FFFBF0"] },
];

function normalizeHexColors(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
    .map((c) => c.trim());
}

/**
 * Цвета палитры так же, как в мастере: для пресета — цвета пресета, для «Своя» — customPaletteColors.
 */
export function resolveEffectiveBrandPaletteColors(
  paletteId: unknown,
  customPaletteColors: unknown
): string[] {
  const custom = normalizeHexColors(customPaletteColors);
  const id = typeof paletteId === "string" ? paletteId.trim() : "";

  if (id === "custom") {
    return custom.length > 0 ? custom : ["#070907", "#2E5A43", "#B9FF4B", "#F3F1EA"];
  }

  const preset = BRAND_PRESET_PALETTES.find((p) => p.id === id);
  if (preset) return [...preset.colors];

  if (custom.length > 0) return custom;

  return [...BRAND_PRESET_PALETTES[15].colors];
}
