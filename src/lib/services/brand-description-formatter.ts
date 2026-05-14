import {
  getNormalizedOpenRouterApiKey,
  getOpenRouterRequestHeaders,
} from "@/lib/openrouter-headers";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

function getBrandDescriptionFormatterModel(): string {
  const fromEnv = (process.env.OPENROUTER_BRAND_NAME_MODEL || "").trim();
  if (fromEnv) return fromEnv;
  return (process.env.OPENROUTER_DESCRIPTION_MODEL || "").trim() || "qwen/qwen-2.5-72b-instruct";
}

export async function formatBrandDescription(
  name: string,
  niche: string,
  rawDescription: string
): Promise<string> {
  const key = getNormalizedOpenRouterApiKey();
  if (!key) throw new Error("OPENROUTER_API_KEY не настроен");

  const model = getBrandDescriptionFormatterModel();
  
  const system = `Ты — профессиональный копирайтер и бренд-стратег. Твоя задача — превратить сумбурное, разговорное описание бренда от пользователя в профессиональное, красивое и официальное описание.

Правила:
- Длина: от 4 до 8 предложений. Не делай текст слишком длинным.
- Тон: профессиональный, уверенный, привлекательный, но без лишнего пафоса.
- Форматирование: сплошной текст или максимум 2 абзаца. Никаких списков, звездочек, маркдауна или заголовков.
- Убери весь разговорный мусор ("ну у нас значит", "короче", "типа того").
- Сохрани все ключевые факты и преимущества, которые назвал пользователь.
- Текст должен звучать как описание "О компании" на хорошем сайте.`;

  const user = `Название бренда: ${name || "Не указано"}
Ниша: ${niche || "Не указана"}

Сырое описание от пользователя:
"""
${rawDescription}
"""

Пожалуйста, перепиши это описание, сделав его профессиональным и красивым. Верни ТОЛЬКО готовый текст, без каких-либо вводных слов или кавычек.`;

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: getOpenRouterRequestHeaders("Karto brand description formatter"),
    body: JSON.stringify({
      model,
      temperature: 0.7,
      max_tokens: 1000,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`OpenRouter ${response.status}: ${errText.slice(0, 240)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
  };
  let content = data?.choices?.[0]?.message?.content;
  if (Array.isArray(content)) {
    content = content.map((p) => (typeof p?.text === "string" ? p.text : "")).join("");
  }
  
  const text = typeof content === "string" ? content.trim() : "";
  
  if (!text) {
    throw new Error("Пустой ответ от модели");
  }
  
  // Убираем возможные кавычки в начале и конце
  return text.replace(/^["']|["']$/g, "").trim();
}
