import {
  getNormalizedOpenRouterApiKey,
  getOpenRouterRequestHeaders,
} from "@/lib/openrouter-headers";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

function getBrandNameModel(): string {
  const fromEnv = (process.env.OPENROUTER_BRAND_NAME_MODEL || "").trim();
  if (fromEnv) return fromEnv;
  return (process.env.OPENROUTER_DESCRIPTION_MODEL || "").trim() || "qwen/qwen-2.5-72b-instruct";
}

function arraysFromParsed(parsed: Record<string, unknown>): { ru: string[]; en: string[] } {
  const ruRaw = parsed.ru ?? parsed.RU;
  const enRaw = parsed.en ?? parsed.EN;
  const ru = Array.isArray(ruRaw)
    ? ruRaw.map((x) => String(x).trim()).filter(Boolean)
    : [];
  const en = Array.isArray(enRaw)
    ? enRaw.map((x) => String(x).trim()).filter(Boolean)
    : [];
  return { ru, en };
}

/** Достаём JSON из ответа модели (часто оборачивают в ```json … ```). */
function candidatesForJsonParse(raw: string): string[] {
  const s = raw.trim();
  const out: string[] = [];
  if (s) out.push(s);

  const fence =
    s.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim() ?? "";
  if (fence && !out.includes(fence)) out.push(fence);

  const braceStart = s.indexOf("{");
  const braceEnd = s.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd > braceStart) {
    const slice = s.slice(braceStart, braceEnd + 1);
    if (!out.includes(slice)) out.push(slice);
  }
  return out;
}

function parseNameLists(raw: string): { ru: string[]; en: string[] } {
  let best: { ru: string[]; en: string[] } = { ru: [], en: [] };
  let bestScore = -1;
  for (const chunk of candidatesForJsonParse(raw)) {
    try {
      const parsed = JSON.parse(chunk) as Record<string, unknown>;
      const { ru, en } = arraysFromParsed(parsed);
      const score = Math.min(ru.length, en.length);
      if (score > bestScore) {
        bestScore = score;
        best = { ru, en };
      }
      if (ru.length >= 10 && en.length >= 10) return { ru, en };
    } catch {
      /* next chunk */
    }
  }
  return best;
}

function uniqueShort(list: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of list) {
    const t = s.replace(/\s+/g, " ").trim();
    if (t.length < 2 || t.length > 48) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Генерация названий магазина/бренда для маркетплейса.
 * niche + description обязательны; hints — необязательные пожелания продавца к этой генерации.
 */
export async function generateBrandNameOptions(
  niche: string,
  description: string,
  hints?: string
): Promise<{ ru: string[]; en: string[] }> {
  const key = getNormalizedOpenRouterApiKey();
  if (!key) throw new Error("OPENROUTER_API_KEY не настроен");

  const model = getBrandNameModel();
  const nicheTrim = niche.trim();
  const descriptionTrim = description.trim();
  const hintsTrim = (hints ?? "").trim();

  const hintsBlock =
    hintsTrim.length > 0
      ? `

Дополнительные пожелания продавца к этой генерации (учитывай их приоритетно и буквально там, где это возможно):
${hintsTrim}

Если продавец просит только русские названия — массив "ru" как обычно из сильных русских имён; массив "en" заполни латиницей как транслитерацию, международное написание или латинский «ярлык полки» в том же духе, без обязательного перевода строка-к-строке с ru[i]. Если просит упомянуть конкретное слово/фамилию — вплети аккуратно там, где уместно. Если противоречит нише — скорее ниша и описание, но всё равно отрази пожелание где возможно.`
      : "";

  const system = `Ты senior naming lead для магазинов и брендов на маркетплейсе. Ниши любые. Цель — чтобы продавец с высокой вероятностью захотел выбрать одно из имён: это должно звучать как реальная торговая марка с полки или вывески, за которую платили нейминг, а не как случайная генерация.

Высокая планка (держи её для КАЖДОГО из 20 строк):
- Имя можно представить на табличке премиальной торговой точки или карточке сильного DTC-бренда — без стыда за «дешёвый текст».
- Сильная звукопись: ритм, ударение, характер слога; произносится без скрипа; не выглядит как черновик или автоподбор из словаря.
- Непрозрачное / условное имя без очевидного значения для покупателя — нормально и часто желательно: смысл может быть вторичен, первичны узнаваемость и «дорогое» звучание (как у многих сильных розничных и продуктовых марок). Главное — не случайный набор букв и не безвкусица.
- Связь с брифом: либо из фактов описания (прямо или тонко), либо нейтрально уместно для регистра ниши (масса / премиум / медицинский / семейный и т.д.) — но всегда осознанный выбор марки, не декоративный шум.

Экономика набора из 10 на язык:
- Большинство позиций — смелые фирменные формы: короткое ударное имя, удачный неологизм, слитное «фамильное» звучание, редкое но живое слово, абстрактная марка.
- Меньшинство может быть проще и «говорящее», но только если оно всё равно звучит как марка, а не как описание товара.
- ru и en — две независимые линии в одном регистре ниши; не построчный перевод.

Перед тем как вывести JSON, мысленно отбрось самые слабые варианты и замени их более сильными, пока набор из 10 не выглядит цельным шорт-листом агентства (без «одного тупого среди девяти хороших»).

Тест отсева слабых имён — если срабатывает, переделай имя:
- Звучит как общеизвестное слово без брендовой подачи или как заголовок каталога.
- Слишком «учебное», плоское, без характера.
- Очевидный автоперевод или параллельная пара с другим языком в том же наборе.

Избегай примитива:
- Голые клише-этикетки: Шарм, Стиль, Мода, Люкс, Гламур, Красота, Элегант и аналоги как основное имя без изюминки.
- Лозунг «прилагательное + общее существительное» вместо названия марки.
- Супер/Топ/Бест; склейки ради *Shop/*Buy/*Market как единственная идея.
- Пустые CamelCase-склейки LuxeSkin / PureCode / WhisperFlora, если бриф явно не просит такой стиль.
- Копирование, передразнивание и узнаваемое созвучие с известными торговыми марками.

ОБЯЗАТЕЛЬНЫЙ формат ответа — один JSON-объект, без текста до или после, без markdown:
{"ru":["…","…",…],"en":["…","…",…]}

Жёстко:
- Ровно 10 строк в "ru" и 10 в "en".
- Только названия, без пояснений и нумерации внутри строк.
- Без ООО/ИП, эмодзи, URL.
- ru — кириллица, обычно кратко (часто 1 слово или слитное имя; 2 слова — только если звучит как единый бренд).
- en — латиница, тоже кратко; вымышленные формы приветствуются; не ленивый перевод русской строки.`;

  const userBase = `Бриф продавца:

Ниша: ${nicheTrim}

Описание:
${descriptionTrim}

Сгенерируй ровно по 10 имён в "ru" и по 10 в "en". Цель — максимальная вероятность, что продавец выберет имя и повесит его на магазин: профессиональный нейминг, запоминаемое звучание, в том числе смелые небуквальные и непрозрачные марки там, где это уместно по регистру ниши. Не смешивай в десятке «гений и слабаков» — каждое имя должно тянуть на финальный шорт-лист.${hintsBlock}`;

  const userRepair = `${userBase}

ВАЖНО (повтор запроса): предыдущий ответ не удалось разобрать или в массивах было меньше 10 элементов. Ответь ЗАНОВО одним JSON-объектом {"ru":[10 строк],"en":[10 строк]} — только JSON, без markdown и без текста снаружи. Пересобери набор: только имена уровня реальной торговой марки; убери топорные и замени на более сильные по звуку и характеру; ru и en — разные формы, не перевод строка-к-строке.`;



  const maxAttempts = 3;
  let lastText = "";

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const temperature = attempt === 0 ? 0.82 : 0.72;
    const user = attempt === 0 ? userBase : userRepair;

    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: getOpenRouterRequestHeaders("Karto brand names"),
      body: JSON.stringify({
        model,
        temperature,
        max_tokens: 3200,
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
    const text = typeof content === "string" ? content : "";
    lastText = text;

    let { ru, en } = parseNameLists(text);
    ru = uniqueShort(ru, 10);
    en = uniqueShort(en, 10);

    const ruLooksRu = (s: string) => /[\u0400-\u04FF]/.test(s);
    const enLooksLatin = (s: string) => !/[\u0400-\u04FF]/.test(s);

    const strict =
      ru.length >= 10 &&
      en.length >= 10 &&
      ru.every(ruLooksRu) &&
      en.every(enLooksLatin);

    if (strict) return { ru, en };

    /** Достаточно вариантов для экрана выбора; скрипт может слегка поехать у модели */
    if (ru.length >= 8 && en.length >= 8) return { ru, en };
    if (ru.length >= 7 && en.length >= 7 && attempt >= 1) return { ru, en };
  }

  let { ru: ruFinal, en: enFinal } = parseNameLists(lastText);
  ruFinal = uniqueShort(ruFinal, 10);
  enFinal = uniqueShort(enFinal, 10);
  if (ruFinal.length >= 4 && enFinal.length >= 4) {
    return { ru: ruFinal, en: enFinal };
  }

  throw new Error("Модель вернула слишком мало вариантов названия");
}
