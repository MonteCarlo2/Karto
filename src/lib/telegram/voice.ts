import type { SupabaseClient } from "@supabase/supabase-js";
import { telegramDownloadFile } from "./bot-api";
import { escapeHtml, italic } from "./format";
import { sendHtmlSafe } from "./send-safe";
import { fetchTelegramLinkByTelegramUserId } from "./telegram-db";
import { handleAssistantMessage, type LinkedChat } from "./assistant";
import { NO_SPEECH, transcribeSpeech } from "@/lib/services/speech-transcribe";
import { assistantAllowed } from "./access";

/**
 * Голосовые сообщения в Telegram: распознаём речь и обрабатываем как обычное сообщение. Человек видит, что именно мы услышали,
 * чтобы поправить, если распознали не так. Только для привязанного личного чата.
 */

export const MAX_VOICE_SECONDS = 120;

export type VoiceMessage = { message_id: number; chat: { id: number }; from?: { id: number }; voice?: { file_id: string; duration?: number }; audio?: { file_id: string; duration?: number } };

export type VoiceDeps = {
  download: (fileId: string) => Promise<Buffer>;
  transcribe: (buffer: Buffer, mime: string) => Promise<{ text: string } | { error: string }>;
  send: (chatId: number, html: string) => Promise<unknown>;
  assistant: (link: LinkedChat, text: string) => Promise<void>;
};

const realDeps = (supabase: SupabaseClient): VoiceDeps => ({
  download: telegramDownloadFile,
  transcribe: transcribeSpeech,
  send: (chatId, html) => sendHtmlSafe({ chatId, html }),
  assistant: (link, text) => handleAssistantMessage(supabase, link, text),
});

export async function handleVoiceMessage(supabase: SupabaseClient, message: VoiceMessage, deps: VoiceDeps = realDeps(supabase)): Promise<void> {
  const from = message.from;
  const media = message.voice ?? message.audio;
  if (!from || !media) return;
  const linked = await fetchTelegramLinkByTelegramUserId(supabase, from.id);
  if (!linked || linked.chat_id !== message.chat.id) return;
  if (!assistantAllowed(linked.user_id)) return;
  const chatId = message.chat.id;

  if ((media.duration ?? 0) > MAX_VOICE_SECONDS) {
    await deps.send(chatId, `🎤 <b>Запись слишком длинная</b>\n\n${escapeHtml(`Максимум ${MAX_VOICE_SECONDS / 60} минуты. Запишите покороче или напишите текстом.`)}`);
    return;
  }
  let result: { text: string } | { error: string };
  try {
    const audio = await deps.download(media.file_id);
    result = await deps.transcribe(audio, "audio/ogg");
  } catch (e) {
    console.error("[telegram] голосовое не загрузилось:", e instanceof Error ? e.message : String(e));
    result = { error: "download" };
  }
  if (!("text" in result) || !result.text.trim()) {
    const noSpeech = "error" in result && result.error === NO_SPEECH;
    await deps.send(chatId, noSpeech ? `🎤 <b>Не расслышал</b>\n\n${escapeHtml("В записи тихо или нет речи. Скажите громче и ближе к микрофону.")}` : `🎤 <b>Не получилось разобрать голосовое</b>\n\n${escapeHtml("Сбой распознавания. Отправьте его ещё раз или напишите текстом.")}`);
    return;
  }
  const text = result.text.trim().slice(0, 1000);
  await deps.send(chatId, `🎤 ${italic(`«${text}»`)}`);
  await deps.assistant({ user_id: linked.user_id, chat_id: linked.chat_id, telegram_user_id: linked.telegram_user_id }, text);
}
