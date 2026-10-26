/**
 * Объективные замеры текста карточки: длина, структура, регистр, повторы, запрещённое.
 * Считает программа; нейросеть получает их как факты и опирается на них при оценке. Всё детерминировано.
 *
 * Ориентиры площадок (используем как нормы, а не как выдумки):
 * - Wildberries: название до 60 знаков, описание от 1000 до 5000 знаков.
 * - Ozon: название до 200 знаков, описание до 6000.
 * Нижнюю границу «достаточно» берём 800 знаков, как в оценке контента раздела «Товары».
 */

export const WB_TITLE_MAX = 60;
export const DESCRIPTION_MIN_OK = 800;
export const DESCRIPTION_IDEAL_FROM = 1000;
export const DESCRIPTION_MAX = 5000;

export type TextMetrics = {
  titleLength: number;
  titleWords: number;
  titleOverWb: boolean;
  descriptionLength: number;
  /** Абзацев (блоков через пустую строку) и пунктов списка. */
  paragraphs: number;
  bullets: number;
  /** Доля заглавных букв среди букв описания, 0–1. */
  capsShare: number;
  /** Сплошные заглавные слова длиннее 11 знаков подряд. */
  shouting: boolean;
  /** Слова, встречающиеся слишком часто (признак переспама): слово и сколько раз. */
  overused: Array<{ word: string; count: number }>;
  uniqueWordShare: number;
  /** Нашли контакты, ссылки или цены, которые запрещены в описании. */
  forbidden: string[];
  emojiCount: number;
  /** Средняя длина предложения в словах. */
  avgSentenceWords: number;
  /** Слова названия, которые не встречаются в описании. */
  titleWordsMissingInDescription: string[];
};

const STOP = new Set(["и", "в", "на", "с", "для", "от", "по", "из", "к", "до", "без", "под", "при", "о", "а", "но", "или", "не", "за", "у", "как", "что", "это", "все", "вы", "ваш", "наш", "он", "она", "они", "его", "ее", "их", "то", "так", "же", "бы", "быть", "есть", "также", "можно", "очень"]);

const words = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/ё/g, "е")
    .match(/[a-zа-я0-9]+/g) ?? [];

/** Основа слова для сравнения с учётом окончаний: по первым 4–5 буквам. */
const stem = (word: string): string => word.slice(0, Math.max(3, Math.min(5, word.length - 1)));

export function measureText(input: { title: string; description: string | null | undefined }): TextMetrics {
  const title = input.title.trim();
  const description = (input.description ?? "").trim();
  const titleWords = words(title);
  const descWords = words(description);

  const paragraphs = description ? description.split(/\n\s*\n/).filter((p) => p.trim()).length : 0;
  const bullets = (description.match(/(^|\n)\s*(?:[•\-–*]|\d+[.)])\s+\S/g) ?? []).length;

  const letters = description.match(/[А-ЯЁA-Zа-яёa-z]/g) ?? [];
  const upper = letters.filter((c) => c === c.toUpperCase() && c !== c.toLowerCase()).length;
  const capsShare = letters.length > 0 ? upper / letters.length : 0;
  const shouting = letters.length >= 20 && (capsShare > 0.3 || /[А-ЯЁA-Z]{12,}/.test(description));

  const counts = new Map<string, number>();
  for (const w of descWords) {
    if (w.length < 4 || STOP.has(w)) continue;
    counts.set(stem(w), (counts.get(stem(w)) ?? 0) + 1);
  }
  const shown = new Map<string, string>();
  for (const w of descWords) if (!shown.has(stem(w))) shown.set(stem(w), w);
  // Слово повторяется слишком часто, если на него приходится больше 4% текста и не меньше шести раз.
  const overused = [...counts.entries()]
    .filter(([, count]) => count >= 6 && count / Math.max(descWords.length, 1) > 0.04)
    .map(([s, count]) => ({ word: shown.get(s) ?? s, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const forbidden: string[] = [];
  if (/(?:\+7|8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/.test(description) || /(?:\+7|8)[\s(-]*\d{3}/.test(title)) forbidden.push("номер телефона");
  if (/https?:\/\/|www\.|\b[a-z0-9-]+\.(?:ru|com|net|shop|store)\b/i.test(`${title} ${description}`)) forbidden.push("ссылка или адрес сайта");
  if (/@[a-z0-9_]{3,}|\b(?:telegram|whatsapp|viber|вотсап|ватсап|телеграм)\b/i.test(`${title} ${description}`)) forbidden.push("мессенджер или соцсеть");
  if (/\d+\s*(?:₽|руб|р\.)|\bскидк[аиу]\s*\d+|\b\d+\s*%\s*скидк/i.test(`${title} ${description}`)) forbidden.push("цена или скидка");

  const emojiCount = (`${title} ${description}`.match(/\p{Extended_Pictographic}/gu) ?? []).length;
  const sentences = description.split(/[.!?]+\s|\n+/).map((s) => words(s).length).filter((n) => n > 0);
  const avgSentenceWords = sentences.length > 0 ? sentences.reduce((a, b) => a + b, 0) / sentences.length : 0;

  const descStems = new Set(descWords.map(stem));
  const titleMissing = titleWords.filter((w) => w.length >= 4 && !STOP.has(w) && !descStems.has(stem(w)));

  return {
    titleLength: title.length,
    titleWords: titleWords.length,
    titleOverWb: title.length > WB_TITLE_MAX,
    descriptionLength: description.length,
    paragraphs,
    bullets,
    capsShare: Math.round(capsShare * 1000) / 1000,
    shouting,
    overused,
    uniqueWordShare: descWords.length > 0 ? Math.round((new Set(descWords).size / descWords.length) * 1000) / 1000 : 0,
    forbidden,
    emojiCount,
    avgSentenceWords: Math.round(avgSentenceWords * 10) / 10,
    titleWordsMissingInDescription: [...new Set(titleMissing)].slice(0, 6),
  };
}

/** Замеры в виде текста для нейросети. */
export function textMetricsForPrompt(m: TextMetrics): string {
  const lines = [
    `Название: ${m.titleLength} знаков, ${m.titleWords} слов${m.titleOverWb ? ` (длиннее ${WB_TITLE_MAX} знаков, допустимых на Wildberries)` : ""}.`,
    `Описание: ${m.descriptionLength} знаков (норма WB 1000–5000; ниже ${DESCRIPTION_MIN_OK} мало, выше ${DESCRIPTION_MAX} нельзя).`,
    `Структура: абзацев ${m.paragraphs}, пунктов списка ${m.bullets}, средняя длина предложения ${m.avgSentenceWords} слов.`,
    `Регистр: заглавных букв ${Math.round(m.capsShare * 100)}%${m.shouting ? ", есть сплошные заглавные (крик)" : ""}.`,
    `Разнообразие слов: ${Math.round(m.uniqueWordShare * 100)}% уникальных.`,
    m.overused.length > 0 ? `Слишком часто повторяются: ${m.overused.map((o) => `«${o.word}» ×${o.count}`).join(", ")}.` : "Слишком частых повторов слов нет.",
    m.forbidden.length > 0 ? `Найдено запрещённое: ${m.forbidden.join(", ")}.` : "Запрещённого (контакты, ссылки, цены) не найдено.",
    m.emojiCount > 0 ? `Эмодзи: ${m.emojiCount}.` : null,
    m.titleWordsMissingInDescription.length > 0 ? `Слова из названия, которых нет в описании: ${m.titleWordsMissingInDescription.join(", ")}.` : null,
  ].filter(Boolean);
  return `Объективные замеры программы (им нужно доверять больше, чем впечатлению):\n${lines.join("\n")}`;
}
