/**
 * Речь → текст через официальный OpenAI Audio API (Whisper / совместимые модели).
 *
 * В маршруте `/api/brand/transcribe` провайдер включается только при OPENAI_TRANSCRIBE_ENABLED=true,
 * чтобы OPENAI_API_KEY для других фич не подтягивал голос автоматически (удобство для РФ и политики ключей).
 *
 * Env:
 * - OPENAI_API_KEY
 * - OPENAI_TRANSCRIBE_ENABLED=true — явное включение этого провайдера для голоса
 * - OPENAI_TRANSCRIBE_MODEL — по умолчанию whisper-1
 * - OPENAI_TRANSCRIBE_LANGUAGE — например ru (опционально)
 */

function normalizeAudioMime(mime: string): string {
  const base = mime.trim().split(";")[0]?.trim().toLowerCase() || "audio/webm";
  if (base.startsWith("audio/webm")) return "audio/webm";
  if (base.startsWith("audio/mp4") || base === "audio/x-m4a") return "audio/mp4";
  if (base.startsWith("audio/mpeg") || base === "audio/mp3") return "audio/mpeg";
  if (base.startsWith("audio/wav") || base === "audio/x-wav") return "audio/wav";
  if (base.startsWith("audio/ogg")) return "audio/ogg";
  if (base.startsWith("audio/flac")) return "audio/flac";
  if (base.startsWith("audio/m4a")) return "audio/m4a";
  if (base.startsWith("audio/")) return base;
  return "audio/webm";
}

function extForMime(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("flac")) return "flac";
  return "webm";
}

export async function transcribeAudioOpenAI(
  buffer: Buffer,
  mimeType: string
): Promise<{ text: string } | { error: string }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return { error: "OPENAI_API_KEY не настроен" };
  }

  const safeMime = normalizeAudioMime(mimeType.startsWith("audio/") ? mimeType : "audio/webm");
  const ext = extForMime(safeMime);
  const filename = `karto-voice.${ext}`;
  const model = process.env.OPENAI_TRANSCRIBE_MODEL?.trim() || "whisper-1";

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)], { type: safeMime }), filename);
  form.append("model", model);

  const lang = process.env.OPENAI_TRANSCRIBE_LANGUAGE?.trim();
  if (lang) form.append("language", lang);

  const prompt = process.env.OPENAI_TRANSCRIBE_PROMPT?.trim();
  if (prompt) form.append("prompt", prompt);

  const timeoutMs = parseInt(process.env.OPENAI_TRANSCRIBE_TIMEOUT_MS ?? "120000", 10);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), Number.isFinite(timeoutMs) && timeoutMs >= 30_000 ? timeoutMs : 120_000);

  try {
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: ctrl.signal,
    });

    const raw = await res.text();
    if (!res.ok) {
      let detail = raw.slice(0, 500);
      try {
        const j = JSON.parse(raw) as { error?: { message?: string } };
        if (j?.error?.message) detail = j.error.message;
      } catch {
        /* keep slice */
      }
      return { error: `OpenAI STT (${res.status}): ${detail}` };
    }

    try {
      const j = JSON.parse(raw) as { text?: string };
      const text = typeof j.text === "string" ? j.text.trim() : "";
      if (text) return { text };
    } catch {
      /* plain text fallback */
    }

    const plain = raw.trim();
    if (plain) return { text: plain };

    return { error: "OpenAI вернул пустой транскрипт" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/abort/i.test(msg)) {
      return { error: "Таймаут запроса к OpenAI STT. Попробуйте короче фразу или увеличьте OPENAI_TRANSCRIBE_TIMEOUT_MS." };
    }
    return { error: `OpenAI STT: ${msg}` };
  } finally {
    clearTimeout(t);
  }
}
