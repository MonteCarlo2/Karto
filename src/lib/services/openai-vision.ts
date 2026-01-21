import OpenAI from "openai";

const PROMPT = `Посмотри на фото товара и напиши 5-7 коротких названий для маркетплейса (Ozon, Wildberries).

КРИТИЧЕСКИ ВАЖНО:
- Только названия товаров, БЕЗ предложений
- Каждое название с новой строки
- БЕЗ нумерации, тире, буллетов
- Максимум 6 слов в названии
- Формат: [Тип товара] [Материал/Цвет/Бренд/Особенность]
- Русский язык

ПРИМЕРЫ ПРАВИЛЬНЫХ НАЗВАНИЙ:
Кружка керамическая с принтом Brawl Stars
Кувшин глиняный декоративный коричневый
Кубок для кофе стеклянный черный
Блокнот с обложкой Joyful

ЗАПРЕЩЕНО писать предложения типа:
- "Этот предмет - это..."
- "На фото изображен..."
- "Товар представляет собой..."
- "Кружка имеет черный цвет..."

Только названия!`;

/**
 * Получает 5–7 коротких названий товара по фото через GPT-4o.
 * Требует OPENAI_API_KEY в .env.local
 */
export async function getProductNamesFromImage(
  imageDataUrl: string
): Promise<string[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return [];

  const openai = new OpenAI({ apiKey });

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: PROMPT },
          {
            type: "image_url",
            image_url: { url: imageDataUrl },
          },
        ],
      },
    ],
    max_tokens: 400,
    temperature: 0.2,
  });

  const text = res.choices?.[0]?.message?.content?.trim();
  if (!text) return [];

  return parseStrictNames(text);
}

/** Жёсткий разбор: только строки, похожие на названия (не предложения). */
function parseStrictNames(text: string): string[] {
  const reject = (s: string) => {
    if (!s || s.length < 3 || s.length > 60) return true;
    
    // Предложения, а не названия (начинаются с типичных фраз)
    if (/^(Этот|Данный|Он|Она|Оно|На фото|На изображении|Кубок имеет|Продукт|Товар|Изображен|Показан|Виден|Это|Этот предмет|Данный товар)\s/i.test(s)) return true;
    
    // Предложения (содержат глаголы описания)
    if (/(представляет собой|является|имеет черный|имеет логотип|сделан из|предназначен|также имеет| и изображение| и логотип|украшена|украшен|стоит|которая|который|— это|это )/i.test(s)) return true;
    
    // Обрывки предложений
    if (/^[а-яА-ЯёЁ]+ [а-яА-ЯёЁ]+ — (это|это )/i.test(s)) return true;
    
    // Отсекаем если содержит "красивая", "красивый" в начале (часть предложения)
    if (/^(красивая|красивый|красивое)\s/i.test(s)) return true;
    
    return false;
  };

  return text
    .split(/\n+/)
    .map((l) => l.replace(/^[\d.\-•*)\]]+\s*/, "").trim())
    .filter((l) => l && !reject(l))
    .slice(0, 7);
}
