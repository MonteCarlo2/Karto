import { getNormalizedOpenRouterApiKey, getOpenRouterRequestHeaders } from "@/lib/openrouter-headers";
import { openRouterFetch } from "@/lib/openrouter-fetch";
import { isOpenRouterModelRoutingError } from "@/lib/openrouter-default-models";
import { createHash } from "node:crypto";
import { bufferFromDataUrl, measurePhoto } from "./card-vision-metrics";
import { VISION_SYSTEM_PROMPT } from "./card-vision-prompt";
import {
  applyMeasuredCaps,
  combineVision,
  metricsForPrompt,
  parseVisionJson,
  SECOND_OPINION_BELOW,
  weightedScore,
  type PhotoMetrics,
  VISION_PROTOCOL_VERSION,
  type VisionRaw,
  type VisionResult,
} from "./card-vision-score";

/** Оценка первых двух фото карточки через OpenRouter. Только чтение: ничего в WB не меняется. */

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const TIMEOUT_MS = 45_000;
const MAX_IMAGE_BYTES = 1_500_000;
const FALLBACK_MODEL = "openai/gpt-4o-mini";

export function resolveCardVisionModel(): string {
  return (process.env.OPENROUTER_CARD_VISION_MODEL || "").trim() || "google/gemini-2.5-flash";
}

export function resolveCardVisionSecondModel(first: string): string {
  const second = (process.env.OPENROUTER_CARD_VISION_SECOND_MODEL || "").trim() || FALLBACK_MODEL;
  return second === first ? "anthropic/claude-sonnet-4" : second;
}

export type VisionInput = {
  title: string;
  category?: string | null;
  brand?: string | null;
  imageUrls: string[];
};

const ALLOWED_HOST = /(^|\.)(wbbasket\.ru|wbstatic\.net|wbcontent\.net|wb\.ru)$/i;

/** Только публичные картинки Wildberries: защита от обращения сервера по произвольным адресам. */
export function isAllowedWbImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && ALLOWED_HOST.test(parsed.hostname);
  } catch {
    return false;
  }
}

function fullSize(url: string): string {
  return url
    .replace("/images/tm/", "/images/c516x688/")
    .replace("/images/c246x328/", "/images/c516x688/")
    .replace("/images/square/", "/images/c516x688/");
}

async function toDataUrl(url: string): Promise<string> {
  const response = await fetch(fullSize(url), { signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (!response.ok) throw new Error(`Фото не открылось (${response.status})`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error("Фото слишком большое для разбора");
  const type = response.headers.get("content-type")?.split(";")[0] || "image/webp";
  return `data:${type};base64,${buffer.toString("base64")}`;
}

/** low — дешевле; auto — модель видит мелкие детали и резкость. Выбор по результатам проверки на ухудшенных фото. */
function imageDetail(): "low" | "auto" {
  return process.env.OPENROUTER_CARD_VISION_DETAIL === "auto" ? "auto" : "low";
}

type Part ={ type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail: "low" | "auto" } };

/** Фактический расход OpenRouter на текущую оценку, $ (OpenRouter возвращает его в usage.cost). */
type Spend = { usd: number };

async function ask(model: string, parts: Part[], spend: Spend): Promise<string> {
  const response = await openRouterFetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: getOpenRouterRequestHeaders("KARTO card vision"),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      model,
      temperature: 0,
      seed: 7,
      max_tokens: 2200,
      usage: { include: true },
      messages: [
        { role: "system", content: VISION_SYSTEM_PROMPT },
        { role: "user", content: parts },
      ],
    }),
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    const error = new Error(`OpenRouter ${response.status}: ${errText.slice(0, 240)}`) as Error & { routing?: boolean };
    error.routing = isOpenRouterModelRoutingError(response.status, errText);
    throw error;
  }
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>; usage?: { cost?: number } };
  if (typeof data.usage?.cost === "number") spend.usd += data.usage.cost;
  const content = data.choices?.[0]?.message?.content;
  return (Array.isArray(content) ? content.map((p) => p?.text ?? "").join("") : (content ?? "")).trim();
}

/** Сетевые сбои (прокси, таймаут) превращаем в понятное сообщение: в них нет смысла повторять сразу. */
function friendlyNetworkError(e: unknown): Error {
  const text = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  if (/timeout|aborted|fetch failed|ECONN|ENOTFOUND|EAI_AGAIN|proxy/i.test(text) && !/OpenRouter \d{3}/.test(text)) {
    return new Error("OpenRouter не отвечает: проверьте прокси и интернет (OPENROUTER_PROXY) и ключ. Оценка не выполнена, деньги не списаны.");
  }
  return e instanceof Error ? e : new Error(text);
}

async function opinion(model: string, parts: Part[], spend: Spend): Promise<{ model: string; raw: VisionRaw }> {
  let used = model;
  let text: string;
  try {
    text = await ask(model, parts, spend);
  } catch (e) {
    if ((e as { routing?: boolean }).routing && model !== FALLBACK_MODEL) {
      used = FALLBACK_MODEL;
      text = await ask(FALLBACK_MODEL, parts, spend);
    } else {
      throw friendlyNetworkError(e);
    }
  }
  let raw = parseVisionJson(text);
  if (!raw) {
    // Один повтор: модели иногда отвечают текстом вокруг JSON или обрывают ответ.
    raw = parseVisionJson(await ask(used, parts, spend));
  }
  if (!raw) throw new Error("Модель вернула ответ, который не удалось разобрать");
  return { model: used, raw };
}

export async function evaluateCardPhotos(input: VisionInput): Promise<VisionResult> {
  if (!getNormalizedOpenRouterApiKey()) throw new Error("Ключ OpenRouter не настроен.");
  const urls = input.imageUrls.slice(0, 2);
  if (urls.length === 0) throw new Error("У карточки нет фото для оценки");
  const images = await Promise.all(urls.map(toDataUrl));
  return evaluateImages(input, images);
}

/** Оценка по уже загруженным картинкам (data URL). Отдельно, чтобы проверять конвейер на синтетических примерах. */
export async function evaluateImages(input: Omit<VisionInput, "imageUrls">, images: string[]): Promise<VisionResult> {
  const metrics: Array<PhotoMetrics | null> = await Promise.all(images.map((img) => measurePhoto(bufferFromDataUrl(img)).catch(() => null)));
  const parts: Part[] = [
    {
      type: "text",
      text: [
        `Товар: ${input.title.trim() || "название не указано"}`,
        input.category ? `Категория в карточке: ${input.category.trim()}` : null,
        input.brand ? `Бренд: ${input.brand.trim()}` : null,
        metricsForPrompt(metrics),
        `Ниже ${images.length === 2 ? "два фото: первое — обложка, второе — вторая картинка карточки" : "одно фото: обложка карточки"}.`,
      ]
        .filter(Boolean)
        .join("\n"),
    },
    ...images.map((url): Part => ({ type: "image_url", image_url: { url, detail: imageDetail() } })),
  ];

  const spend: Spend = { usd: 0 };
  const first = await opinion(resolveCardVisionModel(), parts, spend);
  first.raw = applyMeasuredCaps(first.raw, metrics);
  const opinions = [first];
  // По умолчанию оценивает одна модель по подробному протоколу. Вторая независимая оценка включается только явно
  // (OPENROUTER_CARD_VISION_VERIFY=1) и только для низких итогов.
  if (process.env.OPENROUTER_CARD_VISION_VERIFY === "1" && weightedScore(first.raw.criteria) < SECOND_OPINION_BELOW) {
    try {
      const second = await opinion(resolveCardVisionSecondModel(first.model), parts, spend);
      second.raw = applyMeasuredCaps(second.raw, metrics);
      opinions.push(second);
    } catch {
      // Вторая проверка не удалась: оставляем первую, но не выдаём её за подтверждённую (doubleChecked=false).
    }
  }
  const result = combineVision(opinions);
  if (!result) throw new Error("Оценка не собралась");
  return { ...result, metrics, protocol: VISION_PROTOCOL_VERSION, costUsd: Math.round(spend.usd * 1e6) / 1e6, contentHash: hashImages(images) };
}

/** Отпечаток содержимого фото и версии протокола: меняется, если заменили картинку или правила оценки. */
export function hashImages(images: string[]): string {
  return createHash("sha1").update(VISION_PROTOCOL_VERSION).update(images.join("|")).digest("hex").slice(0, 16);
}

/** Оценка с проверкой: если фото и протокол не менялись с прошлой оценки, платный вызов не делаем. */
export async function evaluateCardPhotosCached(
  input: VisionInput,
  previous: VisionResult | null,
  force = false,
): Promise<{ result: VisionResult; reused: boolean }> {
  if (!getNormalizedOpenRouterApiKey()) throw new Error("Ключ OpenRouter не настроен.");
  const urls = input.imageUrls.slice(0, 2);
  if (urls.length === 0) throw new Error("У карточки нет фото для оценки");
  const images = await Promise.all(urls.map(toDataUrl));
  if (!force && previous?.contentHash && previous.contentHash === hashImages(images)) return { result: previous, reused: true };
  return { result: await evaluateImages(input, images), reused: false };
}
