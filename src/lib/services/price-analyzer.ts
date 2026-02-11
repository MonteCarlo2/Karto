const OPENROUTER_API_KEY =
  "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";
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

export interface PriceAnalysis {
  trends: string[];
  audience: string;
  demandLevel: "Низкий" | "Средний" | "Высокий";
  recommendedPrice: number;
  marginLevel: string;
  nicheSummary?: string;
  priceExplanation?: string;
  competitors: {
    platform: "WB" | "Ozon" | "Yandex Market";
    averagePrice: number;
    link?: string;
  }[];
  verdict: string;
  sources?: { platform?: string; title?: string; url: string }[];
}

export async function analyzePriceWithPerplexity(params: {
  productName?: string;
  photoUrl?: string | null;
}): Promise<PriceAnalysis> {
  const safeName = (params.productName || "").slice(0, 200);
  const safePhoto = params.photoUrl || undefined;

  if (!OPENROUTER_API_KEY) {
    throw new Error("Отсутствует ключ OPENROUTER_API_KEY");
  }

  const systemPrompt = `
Ты — профессиональный аналитик маркетплейсов в России.
Твоя задача — на основе АКТУАЛЬНЫХ данных из интернета проанализировать цены на похожие товары на Ozon, Wildberries и Яндекс.Маркет и выдать ПОДРОБНЫЙ СТРУКТУРИРОВАННЫЙ JSON.

ФОКУС:
- Категория: настольные / интерьерные ретро-телефоны под дерево или из дерева (как декор, не обязательно с рабочими функциями).
- Рынки: только российские маркетплейсы (Ozon, Wildberries, Яндекс.Маркет).

ТО, ЧТО ТЫ ДОЛЖЕН СДЕЛАТЬ:
1) Определи по фото и/или названию товар и его категорию.
2) Найди КАК МОЖНО БОЛЬШЕ релевантных аналогов на:
   - Ozon
   - Wildberries
   - Яндекс.Маркет
3) Посчитай примерный СРЕДНИЙ уровень цен по каждому маркетплейсу.
4) На основе качества/внешнего вида товара (по фото и/или названию) предложи РЕКОМЕНДУЕМУЮ цену в рублях.
5) Оцени маржинальность как строку: "Низкая", "Средняя" или "Высокая".
6) Подробно опиши тренды ниши, целевую аудиторию и уровень спроса.
7) Дай короткий ОБЗОР НИШИ (как ведут себя цены, какие есть сегменты, что происходит с категорией).
8) Подробно ОБЪЯСНИ, почему ты выбрал именно такую рекомендованную цену — с отсылкой к диапазонам цен конкурентов, позиционированию и качеству товара.

ФОРМАТ ОТВЕТА — ТОЛЬКО JSON, БЕЗ комментариев вокруг него.
ВНУТРИ СТРОК (niche_overview, price_explanation, verdict, audience) ИСПОЛЬЗУЙ ПРОСТОЙ MARKDOWN-ФОРМАТ:
- абзацы разделяй пустой строкой (двойной перенос строки);
- ключевые слова и важные фразы выделяй **жирным**;
- при необходимости используй *курсив*.
{
  "trends": ["строка1", "строка2", "строка3"],
  "audience": "краткое описание целевой аудитории",
  "demand_level": "Низкий|Средний|Высокий",
  "recommended_price": 6490,
  "margin_level": "Высокая",
  "niche_overview": "1–2 абзаца об общей ситуации в нише и ценовых сегментах",
  "price_explanation": "подробный разбор, почему выбрана такая цена и как она соотносится с рынком",
  "competitors": [
    { "platform": "WB", "average_price": 5100, "link": "https://..." },
    { "platform": "Ozon", "average_price": 5600, "link": "https://..." },
    { "platform": "Yandex Market", "average_price": 5450, "link": "https://..." }
  ],
  "verdict": "один абзац с объяснением цены",
  "sources": [
    { "platform": "Ozon", "title": "Название товара", "url": "https://..." }
  ]
}

ТРЕБОВАНИЯ:
- ИСПОЛЬЗУЙ МАКСИМАЛЬНО ВОЗМОЖНОЕ КОЛИЧЕСТВО РЕЛЕВАНТНЫХ ИСТОЧНИКОВ (товаров) на каждом маркетплейсе.
- В МАССИВЕ "sources" постарайся вернуть не менее 6–8 ссылок (если достаточно релевантных результатов).
- ВСЕ цены указывай в рублях, округлёнными до ближайших 10–100 ₽.
- Если по какому-то маркетплейсу мало данных, оцени среднюю цену приблизительно, но честно.
- Если ты не уверен, всё равно возвращай числовые оценки, но пиши осторожнее в verdict.
`;

  const userText = `
Проанализируй цены на похожие товары и верни только JSON по указанному формату.
Название товара от пользователя (если есть) считай ОСНОВНЫМ: "${safeName || "не указано"}".
НЕ придумывай новое название товара и НЕ меняй категорию — анализируй именно этот тип товара.
Используй фото товара как основной ориентир по внешнему виду и качеству.
`;

  const userContent: any[] = [
    { type: "text", text: userText.trim() },
  ];

  if (safePhoto) {
    userContent.push({
      type: "image_url",
      image_url: { url: safePhoto },
    });
  }

  const body = {
    model: "perplexity/sonar",
    messages: [
      { role: "system", content: systemPrompt.trim() },
      { role: "user", content: userContent },
    ],
  };

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://karto.app",
      "X-Title": "KARTO - Price Strategy",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const textError = await response.text().catch(() => "");
    throw new Error(
      `Ошибка OpenRouter (${response.status}): ${textError || response.statusText}`
    );
  }

  const data = await response.json();
  const content: string | undefined = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Пустой ответ от модели Perplexity Sonar");
  }

  let jsonContent = content.trim();
  if (jsonContent.startsWith("```")) {
    const lines = jsonContent.split("\n");
    jsonContent = lines.slice(1, -1).join("\n").trim();
  }
  if (jsonContent.startsWith("json")) {
    jsonContent = jsonContent.slice(4).trim();
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonContent);
  } catch (e) {
    throw new Error(
      "Не удалось распарсить JSON от Perplexity Sonar. Ответ: " +
        jsonContent.slice(0, 400)
    );
  }

  const trends: string[] = Array.isArray(parsed.trends)
    ? parsed.trends.map((t: any) => String(t)).slice(0, 6)
    : [];
  const audience: string = String(parsed.audience || "");
  const demandLevelRaw = String(parsed.demand_level || "Средний");
  const demandMap: Record<string, "Низкий" | "Средний" | "Высокий"> = {
    низкий: "Низкий",
    средний: "Средний",
    высокий: "Высокий",
  };
  const demandLevel =
    demandMap[demandLevelRaw.toLowerCase()] ?? ("Средний" as const);

  const recommendedPriceNum = Number(parsed.recommended_price) || 0;

  const competitorsRaw: any[] = Array.isArray(parsed.competitors)
    ? parsed.competitors
    : [];

  const competitors = competitorsRaw
    .map((c) => {
      const platformRaw = String(c.platform || "").toLowerCase();
      let platform: "WB" | "Ozon" | "Yandex Market" | null = null;
      if (platformRaw.includes("wb") || platformRaw.includes("wild")) {
        platform = "WB";
      } else if (platformRaw.includes("ozon")) {
        platform = "Ozon";
      } else if (
        platformRaw.includes("yandex") ||
        platformRaw.includes("яндекс")
      ) {
        platform = "Yandex Market";
      }
      if (!platform) return null;
      return {
        platform,
        averagePrice: Number(c.average_price) || 0,
        link: c.link || c.url,
      };
    })
    .filter(Boolean) as PriceAnalysis["competitors"];

  const sources: PriceAnalysis["sources"] = Array.isArray(parsed.sources)
    ? parsed.sources
        .map((s: any) => ({
          platform: s.platform,
          title: s.title,
          url: String(s.url || ""),
        }))
        .filter((s: any) => s.url)
    : [];

  const result: PriceAnalysis = {
    trends,
    audience,
    demandLevel,
    recommendedPrice: recommendedPriceNum,
    marginLevel: String(parsed.margin_level || "Средняя"),
    nicheSummary: parsed.niche_overview ? String(parsed.niche_overview) : undefined,
    priceExplanation: parsed.price_explanation
      ? String(parsed.price_explanation)
      : parsed.verdict
      ? String(parsed.verdict)
      : undefined,
    competitors,
    verdict: String(parsed.verdict || ""),
    sources,
  };

  return result;
}

