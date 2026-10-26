export type HubCardSeed = {
  title: string;
  vendorCode: string;
  externalId: string;
  description: string;
  /** Чего не хватает тексту по оценке нейросети: подставляется в «SEO-описания» как пожелания. */
  missingKeywords?: string[];
  notes?: string[];
};

/** Пожелания для инструмента «SEO-описания» из данных карточки и оценки текста. */
export function seoDescriptionWishes(seed: HubCardSeed): string {
  const parts: string[] = [];
  if (seed.description.trim()) {
    parts.push(`Текущее описание карточки (улучшите его, сохранив верные факты):\n${seed.description.trim().slice(0, 1500)}`);
  }
  if (seed.missingKeywords && seed.missingKeywords.length > 0) {
    parts.push(`Добавьте естественно, без переспама ключевые слова: ${seed.missingKeywords.join(", ")}.`);
  }
  if (seed.notes && seed.notes.length > 0) {
    parts.push(`Исправьте: ${seed.notes.join("; ")}.`);
  }
  return parts.join("\n\n");
}

const KEY = "karto-hub-card-seed";

export function writeHubCardSeed(seed: HubCardSeed) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(KEY, JSON.stringify(seed));
}

export function readHubCardSeed(): HubCardSeed | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HubCardSeed;
    if (!parsed || typeof parsed.title !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Прочитать и сразу забыть: чтобы при следующем обычном заходе в инструмент поля не подставлялись заново. */
export function takeHubCardSeed(): HubCardSeed | null {
  const seed = readHubCardSeed();
  if (seed && typeof window !== "undefined") {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* хранилище недоступно: ничего страшного */
    }
  }
  return seed;
}
