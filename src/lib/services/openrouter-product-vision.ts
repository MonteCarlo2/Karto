import {
  getNormalizedOpenRouterApiKey,
  getOpenRouterRequestHeaders,
} from "@/lib/openrouter-headers";
import {
  resolveSuggestNamesModel,
  resolveVisionFallbackModel,
  resolveVisionPrimaryModel,
} from "@/lib/openrouter-studio-models";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const VISION_TIMEOUT_MS = 28_000;
const TEXT_TIMEOUT_MS = 20_000;

const PRODUCT_NAMES_SYSTEM =
  "Ты помощник для маркетплейсов. Твоя задача — смотреть на фото товара и давать ТОЛЬКО короткие названия товаров (5–7 вариантов), каждое с новой строки. НИКАКИХ предложений, описаний или объяснений. Только названия в формате: [Тип] [Материал/Цвет/Бренд]. Максимум 6 слов.";

const PRODUCT_NAMES_USER_PROMPT = `Посмотри на фото товара и напиши 5-7 коротких названий для маркетплейса (Ozon, Wildberries).

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
Блокнот с обложкой Joyful
Ведро пластиковое черное с ручкой

ЗАПРЕЩЕНО писать предложения типа:
- "Этот предмет - это..."
- "На фото изображен..."
- "Товар представляет собой..."
- "Кружка имеет черный цвет..."

Только названия!`;

type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } };

function extractMessageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) return String((part as { text?: string }).text ?? "");
        return "";
      })
      .join("");
  }
  return "";
}

async function callOpenRouter(params: {
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string | ChatContentPart[] }>;
  temperature: number;
  maxTokens: number;
  title: string;
  timeoutMs?: number;
}): Promise<string> {
  const key = getNormalizedOpenRouterApiKey();
  if (!key) throw new Error("OPENROUTER_API_KEY не настроен");

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: getOpenRouterRequestHeaders(params.title),
    signal: AbortSignal.timeout(params.timeoutMs ?? VISION_TIMEOUT_MS),
    body: JSON.stringify({
      model: params.model,
      messages: params.messages,
      temperature: params.temperature,
      max_tokens: params.maxTokens,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`OpenRouter ${response.status}: ${errText.slice(0, 300)}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: unknown } }[];
  };

  return extractMessageText(data?.choices?.[0]?.message?.content).trim();
}

/** Жёсткий парсер названий — тот же критерий, что на Replicate. */
export function parseProductNamesFromText(text: string): string[] {
  const reject = (s: string) => {
    if (!s || s.length < 3 || s.length > 60) return true;
    if (/^(Этот|Данный|Он|Она|Оно|На фото|На изображении|Кубок имеет|Продукт|Товар|Изображен|Показан|Виден|Это|Этот предмет|Данный товар)\s/i.test(s)) {
      return true;
    }
    if (
      /(представляет собой|является|имеет черный|имеет логотип|сделан из|предназначен|также имеет| и изображение| и логотип|украшена|украшен|стоит|которая|который|— это|это )/i.test(s)
    ) {
      return true;
    }
    if (/^[а-яА-ЯёЁ]+ [а-яА-ЯёЁ]+ — (это|это )/i.test(s)) return true;
    if (/^(красивая|красивый|красивое)\s/i.test(s)) return true;
    if (/,$/.test(s) || /^и /i.test(s)) return true;
    return false;
  };

  return text
    .split(/\n+/)
    .map((line) => line.replace(/^[\d.\-•*)\]\s]+/, "").trim())
    .filter((line) => line && !reject(line))
    .slice(0, 7);
}

async function getProductNamesFromVisionModel(imageUrl: string, model: string): Promise<string[]> {
  console.log(`🔄 Распознаём товар через ${model} (OpenRouter)...`);

  const isClaude = model.includes("claude") || model.includes("anthropic");

  const messages: Array<{ role: "system" | "user"; content: string | ChatContentPart[] }> = isClaude
    ? [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageUrl, detail: "auto" } },
            { type: "text", text: `${PRODUCT_NAMES_SYSTEM}\n\n${PRODUCT_NAMES_USER_PROMPT}` },
          ],
        },
      ]
    : [
        { role: "system", content: PRODUCT_NAMES_SYSTEM },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageUrl, detail: "auto" } },
            { type: "text", text: PRODUCT_NAMES_USER_PROMPT },
          ],
        },
      ];

  const fullText = await callOpenRouter({
    model,
    messages,
    temperature: 0.2,
    maxTokens: 300,
    title: "KARTO - Product Recognition",
  });

  const names = parseProductNamesFromText(fullText);
  if (names.length === 0) {
    console.warn(`⚠️ ${model}: пустой или нераспознанный ответ`);
  }
  return names;
}

/** Основной vision: GPT-4o-mini (аналог Replicate). */
export async function getProductNamesFromOpenRouterVision(imageUrl: string): Promise<string[]> {
  return getProductNamesFromVisionModel(imageUrl, resolveVisionPrimaryModel());
}

/** Запасной vision: Claude Sonnet (аналог Replicate). */
export async function getProductNamesFromOpenRouterVisionFallback(imageUrl: string): Promise<string[]> {
  return getProductNamesFromVisionModel(imageUrl, resolveVisionFallbackModel());
}

/** Цепочка: primary → fallback. */
export async function getProductNamesWithVisionFallback(imageUrl: string): Promise<string[]> {
  try {
    const primary = await getProductNamesFromOpenRouterVision(imageUrl);
    if (primary.length > 0) return primary;
  } catch (e) {
    console.warn("[openrouter-vision] primary failed:", e instanceof Error ? e.message : e);
  }

  try {
    const fallback = await getProductNamesFromOpenRouterVisionFallback(imageUrl);
    if (fallback.length > 0) return fallback;
  } catch (e) {
    console.warn("[openrouter-vision] fallback failed:", e instanceof Error ? e.message : e);
  }

  return [];
}

/** Описание товара по фото (резерв после vision-названий). */
export async function describeProductFromImageOpenRouter(imageUrl: string): Promise<string> {
  const model = resolveVisionPrimaryModel();
  const text = await callOpenRouter({
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: imageUrl, detail: "auto" } },
          {
            type: "text",
            text: "Опиши товар на фото подробно: что это, материал, цвет, особенности. Ответ на русском, 2–4 предложения.",
          },
        ],
      },
    ],
    temperature: 0.3,
    maxTokens: 400,
    title: "KARTO - Product Describe",
  });
  return text;
}

/** Названия по текстовому описанию (резерв). */
export async function generateProductNamesFromDescriptionOpenRouter(description: string): Promise<string[]> {
  if (!description || description.length < 10) return [];

  const prompt = `Задача: по описанию товара напиши от 5 до 7 коротких названий для Ozon или Wildberries.

ПРАВИЛА:
- СТРОГО только названия, каждое с новой строки
- Без нумерации, тире, буллетов, точек
- Максимум 6 слов в каждом названии
- Формат: тип товара + ключевые признаки (материал, цвет, бренд, назначение)
- Русский язык
- НЕ пиши предложения типа "Ваза имеет...", "Она стоит...", "Этот предмет..."

Описание товара: ${description.slice(0, 500)}

Названия (только названия, по одному на строку):`;

  const fullText = await callOpenRouter({
    model: resolveSuggestNamesModel(),
    messages: [
      {
        role: "system",
        content:
          "Ты помощник для генерации коротких названий товаров для маркетплейсов. Отвечай только названиями, без предложений.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.15,
    maxTokens: 400,
    title: "KARTO - Names From Description",
    timeoutMs: TEXT_TIMEOUT_MS,
  });

  return parseProductNamesFromText(fullText);
}

/** Подсказки при вводе названия (до 4 слов префикса). */
export async function suggestProductNameCompletionsOpenRouter(prefix: string): Promise<string[]> {
  const prompt = `Пользователь начал вводить название товара для маркетплейса: "${prefix}"

Твоя задача: дополнить это начало до полного названия товара, добавив наиболее популярные и релевантные характеристики.

ВАЖНО:
- Название должно начинаться с "${prefix}" и быть его логическим продолжением
- Добавь 1-3 слова: назначение, материал, цвет, размер, тип, бренд или другую важную характеристику
- Максимум 6 слов в итоговом названии
- Названия должны быть реальными и популярными на маркетплейсах (Ozon, Wildberries)
- Только названия товаров, БЕЗ предложений и описаний
- Русский язык
- Каждое название с новой строки, без нумерации, тире, точек

Сгенерируй 4 варианта дополнения для "${prefix}" (только названия, по одному на строку):`;

  const fullText = await callOpenRouter({
    model: resolveSuggestNamesModel(),
    messages: [
      {
        role: "system",
        content: "Ты помощник для маркетплейсов. Отвечай только названиями товаров.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
    maxTokens: 150,
    title: "KARTO - Name Suggestions",
    timeoutMs: TEXT_TIMEOUT_MS,
  });

  return fullText
    .split(/\n+/)
    .map((line) => line.replace(/^[\d.\-•*)\]\s]+/, "").trim())
    .filter((line) => {
      if (!line || line.length < prefix.length + 3) return false;
      if (line.length > 60) return false;
      if (!line.toLowerCase().startsWith(prefix.toLowerCase())) return false;
      if (/(имеет|стоит|является|представляет собой)/i.test(line)) return false;
      return true;
    })
    .slice(0, 4);
}

/** Сравнение названия товара с распознанными на фото. */
export function productNamesMatch(productName: string, recognizedNames: string[]): boolean {
  const normalize = (str: string) => str.toLowerCase().replace(/[^\w\s]/g, "").trim();
  const normalizedProductName = normalize(productName);

  return recognizedNames.some((recognized) => {
    const normalizedRecognized = normalize(recognized);
    const productWords = normalizedProductName.split(/\s+/).filter((w) => w.length > 2);
    const recognizedWords = normalizedRecognized.split(/\s+/).filter((w) => w.length > 2);
    const commonWords = productWords.filter((w) => recognizedWords.includes(w));

    return (
      commonWords.length >= 2 ||
      normalizedProductName.includes(normalizedRecognized.substring(0, 10)) ||
      normalizedRecognized.includes(normalizedProductName.substring(0, 10))
    );
  });
}

export function isOpenRouterConfigured(): boolean {
  return Boolean(getNormalizedOpenRouterApiKey());
}
