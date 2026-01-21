import { GoogleGenerativeAI } from "@google/generative-ai";

const PROMPT = `По изображению товара напиши от 5 до 7 коротких названий для маркетплейса (Ozon, Wildberries).
Формат: СТРОГО только названия, каждое с новой строки. Без нумерации, тире, буллетов.
Правила: макс. 6 слов в названии, тип товара + ключевые признаки (бренд, материал, цвет, назначение). Русский язык.
Пример формата:
Кружка керамическая с принтом Brawl Stars
Кубок для кофе стеклянный черный
Кружка игровая Brawl Stars`;

/**
 * Получает 5–7 коротких названий товара по фото через Google Gemini.
 * Требует GEMINI_API_KEY в .env.local
 * 
 * Получить ключ: https://aistudio.google.com/app/apikey
 */
export async function getProductNamesFromImageGemini(
  imageBase64: string,
  mimeType: string
): Promise<string[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return [];

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const imagePart = {
    inlineData: {
      data: imageBase64,
      mimeType,
    },
  };

  const result = await model.generateContent([PROMPT, imagePart]);
  const response = await result.response;
  const text = response.text().trim();
  if (!text) return [];

  return parseStrictNames(text);
}

/** Жёсткий разбор: только строки, похожие на названия (не предложения). */
function parseStrictNames(text: string): string[] {
  const reject = (s: string) => {
    if (!s || s.length < 3 || s.length > 55) return true;
    if (/^(Этот|Данный|Он|Она|Оно|На фото|Кубок имеет|Продукт|Товар —|Изображен|Показан|Виден)\s/i.test(s)) return true;
    if (/(представляет собой|является|имеет (черный|коричневый|высоту|логотип|цвет|два|высокую)|стоит на|украшена|украшен|сделан из|предназначен|также имеет| и изображение| и логотип| и украшена| цвет и| столе, который| примерно| которая| который|— это|— это )/i.test(s)) return true;
    if (/,$/.test(s) || /^и /i.test(s)) return true;
    return false;
  };

  return text
    .split(/\n+/)
    .map((l) => l.replace(/^[\d.\-•*)\]]+\s*/, "").trim())
    .filter((l) => l && !reject(l))
    .slice(0, 7);
}
