import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanTranscript } from "@/lib/services/speech-transcribe";
import { handleVoiceMessage, type VoiceDeps } from "./voice";

const db = {
  from: () => {
    const b: Record<string, unknown> = {
      select: () => b,
      eq: () => b,
      maybeSingle: () => Promise.resolve({ data: { user_id: "u1", telegram_user_id: 42, chat_id: 777 }, error: null }),
    };
    return b;
  },
} as unknown as SupabaseClient;

function deps(over: Partial<VoiceDeps> = {}) {
  const sent: string[] = [];
  const asked: string[] = [];
  const d: VoiceDeps = { download: async () => Buffer.from("x"), transcribe: async () => ({ text: "  Сколько заказов сегодня?  " }), send: async (_c, html) => void sent.push(html), assistant: async (_l, text) => void asked.push(text), ...over };
  return { d, sent, asked };
}
const msg = (over: Record<string, unknown> = {}) => ({ message_id: 1, chat: { id: 777 }, from: { id: 42 }, voice: { file_id: "f", duration: 5 }, ...over });

describe("голосовые сообщения Telegram", () => {
  it("показывает услышанное и передаёт помощнику как текст", async () => {
    const { d, sent, asked } = deps();
    await handleVoiceMessage(db, msg(), d);
    assert.match(sent[0]!, /<i>«Сколько заказов сегодня\?»<\/i>/);
    assert.deepEqual(asked, ["Сколько заказов сегодня?"]);
  });

  it("экранирует услышанное, режет слишком длинное", async () => {
    const { d, sent } = deps({ transcribe: async () => ({ text: "<b>цена</b> & ведро" }) });
    await handleVoiceMessage(db, msg(), d);
    assert.match(sent[0]!, /&lt;b&gt;цена&lt;\/b&gt; &amp; ведро/);
  });

  it("слишком длинная запись, сбой скачивания и пустая речь отвечают понятно и не зовут помощника", async () => {
    for (const [message, over] of [
      [msg({ voice: { file_id: "f", duration: 500 } }), {}],
      [msg(), { download: async () => { throw new Error("сеть"); } }],
      [msg(), { transcribe: async () => ({ error: "Речь не найдена" }) }],
    ] as Array<[ReturnType<typeof msg>, Partial<VoiceDeps>]>) {
      const { d, sent, asked } = deps(over);
      await handleVoiceMessage(db, message, d);
      assert.equal(asked.length, 0);
      assert.match(sent[0]!, /🎤/);
      assert.ok(!/Error|сеть|Речь не найдена/.test(sent[0]!));
    }
  });

  it("чужой чат не обрабатывается", async () => {
    const { d, sent, asked } = deps();
    await handleVoiceMessage(db, msg({ chat: { id: 999 } }), d);
    assert.equal(sent.length + asked.length, 0);
  });

  it("очистка текста модели", () => {
    assert.equal(cleanTranscript("«Привет, мир»"), "Привет, мир");
    assert.equal(cleanTranscript("```\nТекст\n```"), "Текст");
    assert.equal(cleanTranscript("[нет речи]"), "");
    assert.equal(cleanTranscript("  "), "");
  });
});
