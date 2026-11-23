import { spawn } from "child_process";
import { getNormalizedOpenRouterApiKey, getOpenRouterRequestHeaders } from "@/lib/openrouter-headers";
import { openRouterFetch } from "@/lib/openrouter-fetch";
import { getFfmpegExecutable, hasSaluteSpeechCredentials, transcribeAudioSalute } from "./salute-speech-transcribe";

/**
 * Голос → текст для сайта и Telegram. Основной путь: быстрая недорогая модель с аудиовходом через OpenRouter (тот же ключ, что у агента, отдельного аккаунта не нужно,
 * копейки за запись). Запасной путь: SaluteSpeech (Сбер), если он настроен и оплачен. Любой сбой превращается в понятную фразу.
 */

export const SPEECH_MODEL_DEFAULT = "google/gemini-3.5-flash-lite";
const speechModel = () => (process.env.SPEECH_TRANSCRIBE_MODEL || "").trim() || SPEECH_MODEL_DEFAULT;

export const NO_SPEECH = "Речь в записи не найдена";

const PROMPT =
  "Это голосовое сообщение владельца магазина на Wildberries, обычно на русском (если на другом языке, пиши на нём). Расшифруй речь дословно и верни только текст сказанного: с заглавной буквы и знаками препинания, без пояснений, без кавычек и без пометок о звуках. Названия товаров, числа и термины (ДРР, FBS, WB, ставка, кампания) записывай как их принято писать. Если в записи нет речи, верни ровно: [нет речи]";

/** Любой формат браузера или Telegram (webm, ogg, mp4, opus) в WAV 16 кГц моно: его принимают все аудио-модели. */
export function toWav16k(buffer: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let ffmpeg: string;
    try {
      ffmpeg = getFfmpegExecutable();
    } catch (e) {
      reject(e);
      return;
    }
    const child = spawn(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-vn", "-ac", "1", "-ar", "16000", "-f", "wav", "pipe:1"], { stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = [];
    let err = "";
    child.stdout.on("data", (c: Buffer) => out.push(c));
    child.stderr.on("data", (c: Buffer) => (err += c.toString("utf8")));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 && out.length > 0 ? resolve(Buffer.concat(out)) : reject(new Error(`ffmpeg ${code}: ${err.slice(0, 200)}`))));
    child.stdin.on("error", () => undefined);
    child.stdin.end(buffer);
  });
}

/** Текст из ответа модели без служебных обёрток. Пустая строка: речи нет. */
export function cleanTranscript(raw: string): string {
  const text = String(raw ?? "")
    .replace(/^```[a-z]*\n?|```$/gi, "")
    .replace(/^["«“]+|["»”]+$/g, "")
    .trim();
  if (!text || /^\[?\s*нет речи\s*\]?\.?$/i.test(text)) return "";
  return text;
}

async function transcribeWithModel(buffer: Buffer, mimeType: string): Promise<{ text: string } | { error: string }> {
  if (!getNormalizedOpenRouterApiKey()) return { error: "Ключ OpenRouter не настроен" };
  const isWav = buffer.length > 4 && buffer.subarray(0, 4).toString("ascii") === "RIFF";
  const wav = isWav && buffer.length < 2_000_000 ? buffer : await toWav16k(buffer);
  const response = await openRouterFetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: getOpenRouterRequestHeaders("KARTO voice"),
    signal: AbortSignal.timeout(40_000),
    body: JSON.stringify({
      model: speechModel(),
      temperature: 0,
      max_tokens: 1500,
      messages: [{ role: "user", content: [{ type: "text", text: PROMPT }, { type: "input_audio", input_audio: { data: wav.toString("base64"), format: "wav" } }] }],
    }),
  });
  if (!response.ok) return { error: `Модель распознавания ответила ${response.status}: ${(await response.text().catch(() => "")).slice(0, 200)}` };
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }> };
  const content = data.choices?.[0]?.message?.content;
  const raw = Array.isArray(content) ? content.map((p) => p?.text ?? "").join("") : (content ?? "");
  const text = cleanTranscript(raw);
  return text ? { text } : { error: NO_SPEECH };
}

/** Распознаёт речь. Сначала модель с аудиовходом, затем SaluteSpeech. */
export async function transcribeSpeech(buffer: Buffer, mimeType: string): Promise<{ text: string } | { error: string }> {
  const errors: string[] = [];
  try {
    const r = await transcribeWithModel(buffer, mimeType);
    if ("text" in r) return r;
    // Модель ответила, что речи нет: это не сбой, второй сервис не спрашиваем.
    if (r.error === NO_SPEECH) return r;
    errors.push(r.error);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }
  if (hasSaluteSpeechCredentials()) {
    try {
      const r = await transcribeAudioSalute(buffer, mimeType);
      if ("text" in r && r.text.trim()) return { text: r.text.trim() };
      errors.push("error" in r ? r.error : "пусто");
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  return { error: errors.join(" | ").slice(0, 400) };
}

export const canTranscribe = () => Boolean(getNormalizedOpenRouterApiKey()) || hasSaluteSpeechCredentials();
