import { resolveAutoReplyReviewModel, resolveAutoReplyWriterModel } from "@/lib/auto-replies/ai-models";
import { getNormalizedOpenRouterApiKey, getOpenRouterRequestHeaders } from "@/lib/openrouter-headers";
import { openRouterFetch } from "@/lib/openrouter-fetch";
import { descriptionForWb } from "./wb-description";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

export type CardSellabilityInput = {
  title: string;
  description: string;
  brand?: string | null;
  category?: string | null;
  photos: number;
  hasVideo: boolean;
  dimensions?: string | null;
};

async function complete(model: string, system: string, user: string, temperature: number): Promise<string> {
  const response = await openRouterFetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: getOpenRouterRequestHeaders("KARTO card sellability"),
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: 700,
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
  const content = data.choices?.[0]?.message?.content;
  const text = Array.isArray(content)
    ? content.map((part) => (typeof part?.text === "string" ? part.text : "")).join("")
    : typeof content === "string"
      ? content
      : "";
  return text.trim();
}

function factsBlock(input: CardSellabilityInput): string {
  const description = descriptionForWb(input.description).slice(0, 5000);
  return [
    `Название: ${input.title.trim() || "нет"}`,
    `Бренд: ${input.brand?.trim() || "нет в карточке"}`,
    `Категория: ${input.category?.trim() || "нет в карточке"}`,
    `Фото: ${input.photos}`,
    `Видео: ${input.hasVideo ? "есть" : "нет"}`,
    `Габариты: ${input.dimensions?.trim() || "нет в карточке"}`,
    "Описание:",
    description || "описания нет",
  ].join("\n");
}

/** Два прохода: первая модель читает карточку, вторая не выпускает текст, если в нём появились чужие цифры. */
export async function readCardSellability(input: CardSellabilityInput): Promise<string> {
  if (!getNormalizedOpenRouterApiKey()) {
    throw new Error("Ключ OpenRouter не настроен, разбор модели не из чего собрать.");
  }
  const facts = factsBlock(input);
  const draft = await complete(
    resolveAutoReplyWriterModel(),
    `Ты опытный продавец Wildberries и читаешь одну карточку. Оцени, помогает ли этот текст купить именно этот товар.
Пиши по-русски, 4–7 коротких предложений.
Не ставь оценку из 100 и не заменяй измеренный контент-скор.
Не выдумывай заказы, остаток, маржу, показы, CTR, выручку, чужие цены и срок поставки.
Если чего-то нет в фактах, так и скажи.
Не предлагай включить рекламу.`,
    facts,
    0.2,
  );
  if (!draft) throw new Error("Модель вернула пустой разбор.");

  const verdictRaw = await complete(
    resolveAutoReplyReviewModel(),
    `Проверь разбор карточки. Верни только JSON {"ok":true} или {"ok":false,"reason":"коротко почему"}.
ok=false, если в разборе есть число, которого нет в фактах, обещание выручки, чужая цена, срок поставки или призыв включить рекламу.
ok=true, если разбор опирается только на название, описание и переданные факты.`,
    `Факты:\n${facts}\n\nРазбор:\n${draft}`,
    0,
  );
  const jsonStart = verdictRaw.indexOf("{");
  const jsonEnd = verdictRaw.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < jsonStart) {
    throw new Error("Второй проход не подтвердил разбор. Текст не показал.");
  }
  let verdict: { ok?: boolean; reason?: string };
  try {
    verdict = JSON.parse(verdictRaw.slice(jsonStart, jsonEnd + 1)) as { ok?: boolean; reason?: string };
  } catch {
    throw new Error("Второй проход не подтвердил разбор. Текст не показал.");
  }
  if (verdict.ok !== true) {
    throw new Error(verdict.reason?.trim() || "Второй проход отклонил разбор: в нём есть то, чего нет в карточке.");
  }
  return draft;
}
