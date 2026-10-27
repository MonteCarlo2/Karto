"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { closeSellerHubAiChat, listSellerHubAiChats, loadSellerHubAiChat, waitSellerHubAiChatReply, sendSellerHubAiChat, type AiChat } from "@/lib/seller-hub/client-api";
import { HubAiFindings } from "./hub-ai-findings";
import { HubBadge, HubButton, HubPanel, hub } from "./hub-ui";

/**
 * «Поставить задачу ИИ»: владелец пишет, чего хочет, своими словами. ИИ при необходимости задаёт уточняющие вопросы (до двух раундов), затем составляет планы
 * по подходящим товарам: шаги по дням, контрольные точки, критерии успеха. Планы показываются карточками, их можно принять: дальше программа ведёт план по дням
 * и показывает «было → стало». Деньги не трогаются: цены меняет только кнопка «Выполнить» в этом же разделе.
 */

const STORAGE_KEY = "karto-hub-ai-chat-id";
const EXAMPLES = ["Увеличить продажи, не меняя карточки", "Освободить деньги из залежавшегося товара без убытка", "Разобраться, почему падают заказы", "Поднять маржу, не потеряв заказы"];

const readStoredId = () => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};
const writeStoredId = (id: string | null) => {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* хранилище недоступно: диалог просто не запомнится */
  }
};

export function HubAiChat({ titleByNm, cardByNm }: { titleByNm?: Map<string, string>; cardByNm?: Map<string, { title: string; vendorCode: string; description: string }> }) {
  const [chat, setChat] = useState<AiChat | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const endRef = useRef<HTMLDivElement | null>(null);

  const restore = useCallback(async () => {
    const id = readStoredId();
    if (!id) return;
    const res = await loadSellerHubAiChat(id);
    if (res.ok && res.chat && res.chat.state !== "closed") {
      setChat(res.chat);
      setOpen(true);
    } else writeStoredId(null);
  }, []);

  useEffect(() => {
    void restore();
    // список прошлых диалогов нужен только для будущей истории; сейчас достаточно текущего
    void listSellerHubAiChats();
  }, [restore]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [chat?.messages.length, busy]);

  async function send(message: string) {
    const msg = message.trim();
    if (!msg || busy) return;
    setBusy(true);
    setError(null);
    // Сообщение показывается сразу, пока ИИ думает.
    setChat((prev) => (prev ? { ...prev, messages: [...prev.messages, { role: "user", text: msg, at: new Date().toISOString() }] } : { id: "", title: msg.slice(0, 80), state: "asking", rounds: 0, messages: [{ role: "user", text: msg, at: new Date().toISOString() }], updatedAt: "" }));
    setText("");
    const startedAt = Date.now();
    let res = await sendSellerHubAiChat(chat?.id || null, msg);
    if (!res.ok || !res.chat) {
      // Долгий запрос могла оборвать сеть или шлюз, а сервер дорабатывает план: ждём ответ ИИ в диалоге.
      const recovered = await waitSellerHubAiChatReply(chat?.id || null, startedAt);
      if (recovered) res = { ok: true, chat: recovered };
    }
    setBusy(false);
    if (!res.ok || !res.chat) {
      setError(res.error ?? "Не удалось отправить задачу");
      return;
    }
    setChat(res.chat);
    writeStoredId(res.chat.id);
    setReloadKey((k) => k + 1);
  }

  async function startNew() {
    if (chat?.id) await closeSellerHubAiChat(chat.id);
    writeStoredId(null);
    setChat(null);
    setText("");
    setError(null);
  }

  return (
    <HubPanel className="px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <HubBadge tone="accent">ИИ</HubBadge>
          <p className="text-[14px] font-semibold" style={{ color: hub.text }}>Поставить задачу ИИ-менеджеру</p>
        </div>
        {!open && !chat ? (
          <HubButton variant="primary" onClick={() => setOpen(true)}>Написать задачу</HubButton>
        ) : (
          <HubButton variant="secondary" onClick={() => void startNew()} disabled={busy}>Новая задача</HubButton>
        )}
      </div>
      {!open && !chat ? (
        <p className="mt-1 text-[13px] leading-5" style={{ color: hub.textMuted }}>
          Напишите своими словами, чего хотите (например, «увеличить продажи, не меняя карточки»). ИИ уточнит, что нужно, составит план по товарам и покажет, как поймём, что он помог.
        </p>
      ) : (
        <div className="mt-2">
          {chat && chat.messages.length > 0 ? (
            <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {chat.messages.map((m, i) => (
                <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                  <div className="max-w-[92%] rounded-lg px-3 py-2 text-[13px] leading-5" style={{ background: m.role === "user" ? hub.greenSoft : hub.borderSoft, color: hub.text }}>
                    <p className="whitespace-pre-wrap">{m.text}</p>
                    {m.questions && m.questions.length > 0 ? (
                      <ol className="mt-1 list-decimal space-y-0.5 pl-5">
                        {m.questions.map((q, n) => (
                          <li key={n}>{q}</li>
                        ))}
                      </ol>
                    ) : null}
                  </div>
                </div>
              ))}
              {busy ? <p className="text-[12px]" style={{ color: hub.textMuted }}>ИИ думает над задачей, это может занять до минуты…</p> : null}
              <div ref={endRef} />
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" className="rounded-full border px-3 py-1 text-[12px]" style={{ borderColor: hub.borderSoft, color: hub.text }} onClick={() => setText(ex)}>
                  {ex}
                </button>
              ))}
            </div>
          )}
          {error ? <p className="mt-2 text-[12px]" style={{ color: hub.danger }}>{error}</p> : null}
          <div className="mt-2 flex items-end gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(text);
                }
              }}
              rows={2}
              placeholder={chat?.state === "asking" && chat.messages.length > 0 ? "Ответьте на вопросы или допишите условия…" : "Что вы хотите сделать? Например: увеличить продажи, не меняя карточки"}
              className="min-h-[44px] flex-1 resize-y rounded-lg border px-3 py-2 text-[13px] outline-none"
              style={{ borderColor: hub.borderSoft, color: hub.text, background: "transparent" }}
              disabled={busy}
            />
            <HubButton variant="primary" disabled={busy || !text.trim()} onClick={() => void send(text)}>
              Отправить
            </HubButton>
          </div>
          {chat?.id && chat.state === "planned" ? (
            <div className="mt-3">
              <HubAiFindings chatId={chat.id} titleByNm={titleByNm} cardByNm={cardByNm} reloadKey={reloadKey} />
            </div>
          ) : null}
        </div>
      )}
    </HubPanel>
  );
}
