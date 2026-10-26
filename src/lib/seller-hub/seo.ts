import type { SellerSearchText } from "@/lib/seller-hub/types";

/**
 * Поиск и SEO: что покупатели вводят в поиске WB, на какой позиции вы и чего не хватает карточке.
 * Только данные WB (отчёт «Поисковые запросы по вашим товарам») и текст вашей карточки.
 */

const STOP_WORDS = new Set(["и", "в", "на", "с", "для", "от", "по", "из", "к", "до", "без", "под", "над", "при", "о", "об", "а", "но", "или", "не", "за", "у"]);

/** Слова запроса или текста в сравнимом виде: нижний регистр, ё = е, без знаков, без служебных слов и однобуквенных. */
export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/g, " ")
    .split(" ")
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word));
}

/** Слово есть в тексте с учётом окончаний: сравниваем по основе (без последней буквы, не короче 3 и не длиннее 5 знаков). */
function stem(word: string): string {
  return word.slice(0, Math.max(3, Math.min(5, word.length - 1)));
}

export type SeoRow = SellerSearchText & {
  /** Слова запроса, которых нет ни в названии, ни в описании карточки. */
  missingWords: string[];
  /** top10 — вы на позициях 1–10; mid — 11–40; low — ниже или позиции нет. */
  positionClass: "top10" | "mid" | "low";
};

export type SeoAnalysis = {
  rows: SeoRow[];
  /** Слова, которых не хватает карточке, по убыванию суммарной частоты запросов, где они встречаются. */
  missingKeywords: Array<{ word: string; frequency: number }>;
  /** Запросы с высокой частотой, где вы не в топ-10: туда стоит двигаться. */
  growth: SeoRow[];
};

/**
 * Разбор запросов по товару. Порог «высокая частота» — медиана частот в этом списке (сравниваем запросы между собой,
 * а не с придуманной нормой).
 */
export function analyzeSearchTexts(texts: SellerSearchText[], card: { title: string; description: string | null }): SeoAnalysis {
  const cardStems = new Set(tokens(`${card.title} ${card.description ?? ""}`).map(stem));
  const frequencies = texts.map((t) => t.frequency).filter((f): f is number => f != null).sort((a, b) => a - b);
  const median = frequencies.length > 0 ? frequencies[Math.floor(frequencies.length / 2)]! : 0;

  const rows: SeoRow[] = texts.map((text) => {
    const missingWords = tokens(text.text).filter((word) => !cardStems.has(stem(word)));
    const position = text.avgPosition;
    const positionClass: SeoRow["positionClass"] =
      position != null && position > 0 && position <= 10 ? "top10" : position != null && position > 0 && position <= 40 ? "mid" : "low";
    return { ...text, missingWords: [...new Set(missingWords)], positionClass };
  });

  const missing = new Map<string, number>();
  for (const row of rows) {
    for (const word of row.missingWords) missing.set(word, (missing.get(word) ?? 0) + (row.frequency ?? 0));
  }
  const missingKeywords = [...missing.entries()]
    .map(([word, frequency]) => ({ word, frequency }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 15);

  const growth = rows
    .filter((row) => row.positionClass !== "top10" && (row.frequency ?? 0) >= median && (row.frequency ?? 0) > 0)
    .sort((a, b) => (b.frequency ?? 0) - (a.frequency ?? 0))
    .slice(0, 5);

  return { rows, missingKeywords, growth };
}
