import {
  getNormalizedOpenRouterApiKey,
  getOpenRouterRequestHeaders,
} from "@/lib/openrouter-headers";

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

function getMarketplaceSearchLinks(productName: string): Record<PrimaryMarketplace, string> {
  const q = encodeURIComponent(productName || "");
  return {
    Ozon: `https://www.ozon.ru/search/?text=${q}`,
    WB: `https://www.wildberries.ru/catalog/0/search.aspx?search=${q}`,
    "Yandex Market": `https://market.yandex.ru/search?text=${q}`,
  };
}

function getPriceJsonRepairModel(): string {
  const fromEnv = (process.env.OPENROUTER_PRICE_JSON_REPAIR_MODEL || "").trim();
  if (fromEnv) return fromEnv;
  const desc = (process.env.OPENROUTER_DESCRIPTION_MODEL || "").trim();
  if (desc) return desc;
  return "qwen/qwen-2.5-72b-instruct";
}

/** Убирает обёртки ```json ... ``` и лишний текст вокруг. */
function unwrapModelJsonPayload(raw: string): string {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  if (s.toLowerCase().startsWith("json")) s = s.slice(4).trim();
  return s;
}

/** Вырезает первый сбалансированный JSON-объект `{ ... }`. */
function extractBalancedJsonObject(s: string): string | null {
  const start = s.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  const quote = '"';
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === quote) inString = false;
      continue;
    }
    if (c === quote) {
      inString = true;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

function repairTrailingCommasInJson(s: string): string {
  return s.replace(/,\s*([}\]])/g, "$1");
}

function tryParseJsonObject(content: string): unknown | null {
  const unwrapped = unwrapModelJsonPayload(content);
  const attempts: string[] = [unwrapped];
  const balanced = extractBalancedJsonObject(unwrapped);
  if (balanced) attempts.push(balanced);
  for (const chunk of attempts) {
    const variants = [chunk, repairTrailingCommasInJson(chunk)];
    for (const v of variants) {
      try {
        return JSON.parse(v);
      } catch {
        /* next */
      }
    }
  }
  return null;
}

/**
 * Извлекает суммы в ₽ из «простыни» ответа Sonar (когда JSON не пришёл).
 */
function extractRubPricesFromText(text: string): number[] {
  const found = new Set<number>();
  const body = text.slice(0, 50_000);
  const rePrice =
    /(?:от\s*)?(\d[\d\s\u00A0]{1,12})\s*(?:₽|руб\.?|RUB|rub)/gi;
  let m: RegExpExecArray | null;
  while ((m = rePrice.exec(body)) !== null) {
    const n = parseInt(m[1].replace(/[\s\u00A0]/g, ""), 10);
    if (n >= 199 && n <= 2_000_000) found.add(n);
  }
  const reRange =
    /(\d[\d\s\u00A0]{1,12})\s*[-–—]\s*(\d[\d\s\u00A0]{1,12})\s*(?:₽|руб\.?)/gi;
  while ((m = reRange.exec(body)) !== null) {
    const a = parseInt(m[1].replace(/[\s\u00A0]/g, ""), 10);
    const b = parseInt(m[2].replace(/[\s\u00A0]/g, ""), 10);
    if (a >= 199 && a <= 2_000_000) found.add(a);
    if (b >= 199 && b <= 2_000_000) found.add(b);
  }
  return [...found].sort((a, b) => a - b);
}

function buildInferredPriceAnalysis(
  productName: string,
  samples: string,
  prices: number[]
): PriceAnalysis {
  const links = getMarketplaceSearchLinks(productName);
  const med = roundToStep(median(prices), 10);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const span = Math.max(roundToStep((maxP - minP) / 2, 10), 50);
  const ozon = roundToStep(Math.min(maxP, Math.max(minP, med + Math.round(span * 0.15))), 10);
  const wb = roundToStep(Math.min(maxP, Math.max(minP, med - Math.round(span * 0.2))), 10);
  const ym = roundToStep(Math.min(maxP, Math.max(minP, med + Math.round(span * 0.05))), 10);

  return {
    trends: [
      "Ответ поисковой модели пришёл без JSON; цены оценены по числам в рублях, найденным в тексте.",
      `Замеченный в тексте коридор: примерно ${roundToStep(minP, 10)}–${roundToStep(maxP, 10)} ₽.`,
    ],
    audience:
      "Проверьте сегмент своей карточки; ниже — ориентир по извлечённым из ответа суммам.",
    demandLevel: "Средний",
    recommendedPrice: med,
    marginLevel: "Средняя",
    nicheSummary:
      "**Автооценка.** Модель не вернула структурированный JSON, поэтому мы извлекли упоминания цен в ₽ из её текста и собрали ориентир. Для точной цены откройте карточки конкурентов по ссылкам.",
    priceExplanation: `Медиана найденных значений: **${med} ₽** (выборка: ${prices.slice(0, 12).join(", ")} ₽). Фрагмент ответа: ${samples.slice(0, 280)}`,
    competitors: [
      { platform: "Ozon", averagePrice: ozon, link: links.Ozon },
      { platform: "WB", averagePrice: wb, link: links.WB },
      { platform: "Yandex Market", averagePrice: ym, link: links["Yandex Market"] },
    ],
    verdict: `Ориентир **~${med} ₽** по извлечённым из ответа суммам. Сверьте с актуальными карточками на маркетплейсах и при необходимости перезапустите анализ.`,
    sources: [
      { platform: "Ozon", title: "Поиск Ozon", url: links.Ozon },
      { platform: "WB", title: "Поиск Wildberries", url: links.WB },
      { platform: "Yandex Market", title: "Поиск Яндекс Маркет", url: links["Yandex Market"] },
    ],
  };
}

/**
 * Вторая модель (без web): превращает сырой ответ Sonar в валидный JSON схемы анализа.
 */
async function repairPriceJsonWithOpenRouter(
  rawSonarText: string,
  productName: string
): Promise<unknown | null> {
  if (!getNormalizedOpenRouterApiKey()) return null;
  const model = getPriceJsonRepairModel();
  const system = `Ты преобразуешь текст в СТРОГИЙ JSON для анализа цен на маркетплейсах РФ.
Верни ТОЛЬКО один JSON-объект без markdown, без комментариев до или после.
Схема полей (имена на английском, значения на русском где уместно):
{
  "trends": ["строка", "..."],
  "audience": "строка",
  "demand_level": "Низкий" | "Средний" | "Высокий",
  "recommended_price": число в рублях,
  "margin_level": "Низкая" | "Средняя" | "Высокая",
  "niche_overview": "строка, можно **жирный** markdown",
  "price_explanation": "строка",
  "competitors": [
    {"platform": "WB", "average_price": число, "link": "https://..."},
    {"platform": "Ozon", "average_price": число, "link": "https://..."},
    {"platform": "Yandex Market", "average_price": число, "link": "https://..."}
  ],
  "verdict": "строка",
  "sources": [{"platform": "Ozon", "title": "...", "url": "https://..."}]
}
Если в тексте нет точных цен — оцени реалистичные средние цены по Ozon, WB и Яндекс Маркет для этого товара в России (не нули, если можно обосновать порядок величины).
Всегда заполни все три платформы в competitors.`;

  const user = `Товар: "${productName}"

Ниже сырой ответ другой модели (возможно с отказом или без JSON). Извлеки или оцени данные и верни ТОЛЬКО JSON по схеме.

---
${rawSonarText.slice(0, 14_000)}
---`;

  const baseBody = {
    model,
    temperature: 0.15,
    max_tokens: 2500,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };

  try {
    let response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: getOpenRouterRequestHeaders("KARTO - Price JSON Repair"),
      body: JSON.stringify({ ...baseBody, response_format: { type: "json_object" } }),
    });
    if (!response.ok) {
      response = await fetch(OPENROUTER_API_URL, {
        method: "POST",
        headers: getOpenRouterRequestHeaders("KARTO - Price JSON Repair"),
        body: JSON.stringify(baseBody),
      });
    }
    if (!response.ok) return null;
    const data = await response.json();
    let content: string | undefined = data?.choices?.[0]?.message?.content;
    if (Array.isArray(content)) {
      content = content
        .map((p: { text?: string }) => (typeof p?.text === "string" ? p.text : ""))
        .join("");
    }
    if (typeof content !== "string" || !content.trim()) return null;
    return tryParseJsonObject(content);
  } catch {
    return null;
  }
}

function buildFallbackPriceAnalysis(productName: string, reason: string): PriceAnalysis {
  const links = getMarketplaceSearchLinks(productName);
  return {
    trends: [
      "Автоматический fallback: модель не вернула валидный JSON анализа.",
      "Откройте ссылки на маркетплейсы и уточните диапазон цен вручную.",
    ],
    audience: "Недостаточно структурированных данных от источника анализа.",
    demandLevel: "Средний",
    recommendedPrice: 0,
    marginLevel: "Средняя",
    nicheSummary:
      "Модель анализа цен вернула неструктурированный ответ. Показаны безопасные ссылки для ручной проверки рыночной цены.",
    priceExplanation: reason.slice(0, 500),
    competitors: [
      { platform: "Ozon", averagePrice: 0, link: links.Ozon },
      { platform: "WB", averagePrice: 0, link: links.WB },
      { platform: "Yandex Market", averagePrice: 0, link: links["Yandex Market"] },
    ],
    verdict:
      "Автоанализ временно недоступен в полном формате JSON. Используйте ссылки маркетплейсов для проверки и повторите анализ позже.",
    sources: [
      { platform: "Ozon", title: "Поиск Ozon", url: links.Ozon },
      { platform: "WB", title: "Поиск Wildberries", url: links.WB },
      { platform: "Yandex Market", title: "Поиск Яндекс Маркет", url: links["Yandex Market"] },
    ],
  };
}

function shapePriceAnalysisFromParsed(parsed: any, safeName: string): PriceAnalysis {
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

  const competitorMap = new Map<
    PrimaryMarketplace,
    { platform: PrimaryMarketplace; averagePrice: number; link?: string }
  >();
  for (const c of competitorsNormalized) {
    competitorMap.set(c.platform, {
      platform: c.platform,
      averagePrice: Math.max(0, Number(c.averagePrice) || 0),
      link: c.link || linksByPlatform[c.platform][0],
    });
  }

  for (const platform of PRIMARY_MARKETPLACES) {
    if (!competitorMap.has(platform)) {
      const fallbackLink = getMarketplaceSearchLinks(safeName)[platform];
      competitorMap.set(platform, {
        platform,
        averagePrice: 0,
        link: linksByPlatform[platform][0] || fallbackLink,
      });
    }
  }

  const competitors = PRIMARY_MARKETPLACES.map((platform) =>
    competitorMap.get(platform)!
  ).filter(Boolean);
  for (const competitor of competitors) {
    if (!competitor.link) {
      competitor.link = getMarketplaceSearchLinks(safeName)[competitor.platform];
    }
  }

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
      const lower = min * 0.9;
      const upper = max * 1.03;
      const blended = roundToStep(finalRecommended * 0.4 + marketCentered * 0.6, 10);
      finalRecommended = Math.min(upper, Math.max(lower, blended));
      finalRecommended = roundToStep(finalRecommended, 10);
    }
  } else if (positivePrices.length === 1) {
    finalRecommended = roundToStep(
      finalRecommended > 0 ? finalRecommended : positivePrices[0],
      10
    );
  } else {
    finalRecommended = roundToStep(Math.max(0, finalRecommended), 10);
  }

  return {
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
}

export async function analyzePriceWithPerplexity(params: {
  productName?: string;
  photoUrl?: string | null;
}): Promise<PriceAnalysis> {
  const safeName = (params.productName || "").slice(0, 200);
  const safePhoto = params.photoUrl || undefined;

  if (!getNormalizedOpenRouterApiKey()) {
    throw new Error("Отсутствует или пустой OPENROUTER_API_KEY");
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
КРИТИЧНО: первый символ ответа — «{», последний — «}». Не пиши перед JSON фразы вроде «Конечно», «Вот», извинений или пояснений. Не оборачивай JSON в markdown-блоки с тройными обратными кавычками.
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
Проанализируй цены на похожие товары. Ответ — ОДИН JSON-объект по схеме из системного сообщения, больше ничего.
Название товара от пользователя (если есть) считай ОСНОВНЫМ: "${safeName || "не указано"}".
НЕ придумывай новое название товара и НЕ меняй категорию — анализируй именно этот тип товара.
Используй фото товара как основной ориентир по внешнему виду и качеству.
Ищи реальные карточки товаров на Ozon, Wildberries и Яндекс Маркете с ценами в рублях; в поля average_price и recommended_price подставляй осмысленные числа, не нули, если в выдаче есть ориентиры.
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
    headers: getOpenRouterRequestHeaders("KARTO - Price Strategy"),
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

  let parsed: any = tryParseJsonObject(content);
  if (!parsed) {
    parsed = await repairPriceJsonWithOpenRouter(content, safeName);
  }
  if (!parsed) {
    const rubs = extractRubPricesFromText(content);
    if (rubs.length >= 1) {
      return buildInferredPriceAnalysis(safeName, content, rubs);
    }
    return buildFallbackPriceAnalysis(
      safeName,
      "Не удалось получить JSON от Perplexity Sonar и не найдено цен в тексте. Фрагмент: " +
        content.slice(0, 400)
    );
  }

  let result = shapePriceAnalysisFromParsed(parsed, safeName);
  const hasUsefulNumbers =
    result.recommendedPrice > 0 ||
    result.competitors.some((c) => c.averagePrice > 0);
  if (!hasUsefulNumbers) {
    const rubs = extractRubPricesFromText(content);
    if (rubs.length >= 1) {
      return buildInferredPriceAnalysis(safeName, content, rubs);
    }
    const retryParsed = await repairPriceJsonWithOpenRouter(
      `В JSON все средние цены и рекомендация оказались нулевыми. Нужны реалистичные числа в рублях по Ozon, Wildberries и Яндекс Маркет для РФ.\nТовар: «${safeName}».\n\nСырой ответ поисковой модели:\n${content.slice(0, 14000)}`,
      safeName
    );
    if (retryParsed) {
      result = shapePriceAnalysisFromParsed(retryParsed, safeName);
    }
  }

  if (
    result.recommendedPrice <= 0 &&
    !result.competitors.some((c) => c.averagePrice > 0)
  ) {
    return buildFallbackPriceAnalysis(
      safeName,
      "Не удалось получить ненулевые цены после восстановления JSON."
    );
  }

  return result;
}

