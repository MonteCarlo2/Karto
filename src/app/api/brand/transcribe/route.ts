import { NextRequest, NextResponse } from "next/server";
import {
  hasSaluteSpeechCredentials,
  transcribeAudioSalute,
} from "@/lib/services/salute-speech-transcribe";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BYTES = 4 * 1024 * 1024;

/** В интерфейс не попадают техподробности — только см. серверный лог. */
const CLIENT_VOICE_FALLBACK =
  "Извините, голос не распознан — временная ошибка. Попробуйте ещё раз или наберите текст вручную.";
const CLIENT_VOICE_TOO_LARGE =
  "Запись слишком большая для одной отправки. Остановите чуть раньше и попробуйте снова.";
const CLIENT_SESSION_REFRESH = "Обновите страницу или войдите снова, чтобы использовать голосовой ввод.";

function decodeJwtPayload(token: string): { exp?: number } | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const json = Buffer.from(padded, "base64").toString("utf8");
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as { exp?: number };
  } catch {
    return null;
  }
}

/**
 * Голос → текст только через SaluteSpeech (Сбер). KIE / Replicate / OpenAI здесь не используются.
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

    if (token) {
      const payload = decodeJwtPayload(token);
      if (!payload) {
        console.warn("[brand/transcribe] invalid JWT shape");
        return NextResponse.json({ error: CLIENT_SESSION_REFRESH }, { status: 401 });
      }
      if (typeof payload.exp === "number") {
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp <= now) {
          console.warn("[brand/transcribe] JWT expired");
          return NextResponse.json({ error: CLIENT_SESSION_REFRESH }, { status: 401 });
        }
      }
    }

    if (!hasSaluteSpeechCredentials()) {
      console.error("[brand/transcribe] SaluteSpeech credentials missing");
      return NextResponse.json(
        { error: CLIENT_VOICE_FALLBACK, saluteNotConfigured: true },
        { status: 503 }
      );
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      console.warn("[brand/transcribe] invalid multipart body");
      return NextResponse.json({ error: CLIENT_VOICE_FALLBACK }, { status: 400 });
    }

    const file = formData.get("audio");
    if (!(file instanceof Blob) || file.size === 0) {
      console.warn("[brand/transcribe] empty audio field");
      return NextResponse.json({ error: CLIENT_VOICE_FALLBACK }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      console.warn("[brand/transcribe] payload too large", file.size);
      return NextResponse.json({ error: CLIENT_VOICE_TOO_LARGE }, { status: 413 });
    }

    let mimeType = typeof file.type === "string" ? file.type.trim() : "";
    if (!mimeType.startsWith("audio/")) {
      const name = file instanceof File ? file.name.toLowerCase() : "";
      if (name.endsWith(".webm")) mimeType = "audio/webm";
      else if (name.endsWith(".mp4") || name.endsWith(".m4a")) mimeType = "audio/mp4";
      else mimeType = "audio/webm";
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    let result: { text: string } | { error: string };
    try {
      result = await transcribeAudioSalute(buffer, mimeType);
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      console.error("[brand/transcribe] transcribeAudioSalute threw:", raw);
      return NextResponse.json({ error: CLIENT_VOICE_FALLBACK }, { status: 502 });
    }

    if ("text" in result && result.text.trim()) {
      return NextResponse.json({ text: result.text });
    }

    const err = "error" in result ? result.error : "empty SaluteSpeech result";
    console.warn("[brand/transcribe] salute unsuccessful:", err);

    return NextResponse.json({ error: CLIENT_VOICE_FALLBACK }, { status: 502 });
  } catch (e) {
    console.error("[brand/transcribe] unhandled:", e);
    return NextResponse.json({ error: CLIENT_VOICE_FALLBACK }, { status: 500 });
  }
}
