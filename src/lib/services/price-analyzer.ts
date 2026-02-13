const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
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

const PRIMARY_MARKETPLACES = ["Ozon", "WB", "Yandex Market"] as const;
type PrimaryMarketplace = (typeof PRIMARY_MARKETPLACES)[number];

function normalizePlatform(raw: string): PrimaryMarketplace | "MegaMarket" | null {
  const value = raw.toLowerCase();
  if (value.includes("ozon")) return "Ozon";
  if (value.includes("wb") || value.includes("wild")) return "WB";
  if (value.includes("yandex") || value.includes("яндекс")) return "Yandex Market";
  if (
    value.includes("mega") ||
    value.includes("мега") ||
    value.includes("sber") ||
    value.includes("сбер")
  ) {
    return "MegaMarket";
  }
  return null;
}

function roundToStep(value: number, step = 10): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value / step) * step);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
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
Твоя задача — на основе АКТУАЛЬНЫХ данных из интернета проанализировать цены на похожие товары и выдать ПОДРОБНЫЙ СТРУКТУРИРОВАННЫЙ JSON.

ГЛАВНЫЙ ФОКУС МАРКЕТПЛЕЙСОВ:
- Ozon
- Wildberries
- Яндекс Маркет
- (опционально) Мегамаркет как дополнительный источник

КЛЮЧЕВАЯ ЦЕЛЬ:
- анализировать ТОЛЬКО максимально похожие товары по названию и фото;
- получить реальный рыночный диапазон и дать правдоподобную рекомендованную цену;
- не завышать цену без объективных оснований.

ТО, ЧТО ТЫ ДОЛЖЕН СДЕЛАТЬ:
1) Определи по фото и/или названию товар и его категорию.
2) Найди КАК МОЖНО БОЛЬШЕ релевантных аналогов на:
   - Ozon
   - Wildberries
   - Яндекс.Маркет
   - (опционально) Мегамаркет
3) Посчитай реалистичный СРЕДНИЙ уровень цен по каждому из 3 основных маркетплейсов.
4) Выведи РЕКОМЕНДУЕМУЮ цену в рублях на базе центровки по рынку (без искусственного завышения).
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
- ОБЯЗАТЕЛЬНО верни ссылки на Ozon, WB и Яндекс Маркет.
- В "sources" верни минимум 2 ссылки на каждый из Ozon/WB/Яндекс Маркет (если есть в выдаче).
- ВСЕ цены указывай в рублях, округлёнными до ближайших 10–100 ₽.
- Если по какому-то маркетплейсу мало данных, оцени среднюю цену приблизительно, но честно и отметь это.
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

  const competitorsNormalized = competitorsRaw
    .map((c) => {
      const platform = normalizePlatform(String(c.platform || ""));
      if (!platform || platform === "MegaMarket") return null;
      return {
        platform,
        averagePrice: Number(c.average_price) || 0,
        link: c.link || c.url,
      };
    })
    .filter(Boolean) as PriceAnalysis["competitors"];

  const sourcesRaw: PriceAnalysis["sources"] = Array.isArray(parsed.sources)
    ? parsed.sources
        .map((s: any) => ({
          platform: s.platform,
          title: s.title,
          url: String(s.url || ""),
        }))
        .filter((s: any) => s.url)
    : [];

  const allowedDomains = [
    "ozon.ru",
    "wildberries.ru",
    "market.yandex.ru",
    "megamarket.ru",
    "sbermegamarket.ru",
  ];
  const sources = (sourcesRaw ?? []).filter((s) =>
    allowedDomains.some((domain) => String(s.url).toLowerCase().includes(domain))
  );

  const linksByPlatform: Record<PrimaryMarketplace, string[]> = {
    Ozon: [],
    WB: [],
    "Yandex Market": [],
  };
  for (const src of sources) {
    const p = normalizePlatform(String(src.platform || src.url || ""));
    if (p && p !== "MegaMarket") linksByPlatform[p].push(src.url);
  }

  // Гарантируем присутствие трех основных платформ в competitors
  const competitorMap = new Map<PrimaryMarketplace, { platform: PrimaryMarketplace; averagePrice: number; link?: string }>();
  for (const c of competitorsNormalized) {
    competitorMap.set(c.platform, {
      platform: c.platform,
      averagePrice: Math.max(0, Number(c.averagePrice) || 0),
      link: c.link || linksByPlatform[c.platform][0],
    });
  }

  for (const platform of PRIMARY_MARKETPLACES) {
    if (!competitorMap.has(platform)) {
      const q = encodeURIComponent(safeName || "");
      const fallbackLink =
        platform === "Ozon"
          ? `https://www.ozon.ru/search/?text=${q}`
          : platform === "WB"
          ? `https://www.wildberries.ru/catalog/0/search.aspx?search=${q}`
          : `https://market.yandex.ru/search?text=${q}`;
      competitorMap.set(platform, {
        platform,
        averagePrice: 0,
        link: linksByPlatform[platform][0] || fallbackLink,
      });
    }
  }

  const competitors = PRIMARY_MARKETPLACES.map((platform) => competitorMap.get(platform)!).filter(Boolean);
  for (const competitor of competitors) {
    if (!competitor.link) {
      const q = encodeURIComponent(safeName || "");
      competitor.link =
        competitor.platform === "Ozon"
          ? `https://www.ozon.ru/search/?text=${q}`
          : competitor.platform === "WB"
          ? `https://www.wildberries.ru/catalog/0/search.aspx?search=${q}`
          : `https://market.yandex.ru/search?text=${q}`;
    }
  }

  // Более правдоподобная цена: центровка по рынку + мягкий clamp
  const positivePrices = competitors.map((c) => c.averagePrice).filter((p) => p > 0);
  let finalRecommended = recommendedPriceNum;
  if (positivePrices.length >= 2) {
    const min = Math.min(...positivePrices);
    const max = Math.max(...positivePrices);
    const avg = positivePrices.reduce((a, b) => a + b, 0) / positivePrices.length;
    const med = median(positivePrices);
    const marketCentered = roundToStep(med * 0.7 + avg * 0.3, 10);

    if (finalRecommended <= 0) {
      finalRecommended = marketCentered;
    } else {
      // Если модель ушла слишком высоко/низко — возвращаем в реальный коридор.
      const lower = min * 0.9;
      const upper = max * 1.03;
      const blended = roundToStep(finalRecommended * 0.4 + marketCentered * 0.6, 10);
      finalRecommended = Math.min(upper, Math.max(lower, blended));
      finalRecommended = roundToStep(finalRecommended, 10);
    }
  } else if (positivePrices.length === 1) {
    finalRecommended = roundToStep(finalRecommended > 0 ? finalRecommended : positivePrices[0], 10);
  } else {
    finalRecommended = roundToStep(Math.max(0, finalRecommended), 10);
  }

  const result: PriceAnalysis = {
    trends,
    audience,
    demandLevel,
    recommendedPrice: finalRecommended,
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

