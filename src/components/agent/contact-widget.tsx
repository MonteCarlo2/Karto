"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Check, ImagePlus, Loader2, Send, X } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase/client";
import { hub, hubSans } from "@/components/seller-hub/hub-ui";

type Status = "idle" | "sending" | "sent" | "error";
type Kind = "question" | "bug" | "idea";

const KINDS: Array<{ id: Kind; label: string; prefix: string; placeholder: string }> = [
  { id: "question", label: "Вопрос", prefix: "[Вопрос]", placeholder: "Что хотите узнать? Опишите по шагам, ответим на почту аккаунта." },
  { id: "bug", label: "Ошибка", prefix: "[Ошибка]", placeholder: "Что случилось и где? Что вы ожидали увидеть? Скриншот ускорит исправление." },
  { id: "idea", label: "Идея", prefix: "[Идея]", placeholder: "Что стоит добавить или улучшить? Зачем это вам?" },
];

const MAX_FILES = 4;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_TEXT = 2000;
const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "aiora.help@mail.ru";

type Shot = { id: string; file: File; url: string };

/**
 * «Написать нам»: окно с темой, полем для текста и скриншотами (выбор, перетаскивание, вставка Ctrl+V).
 * Без скриншотов обращение уходит в «вопросы» (ответ на почту), со скриншотами и ошибки с картинками в «отчёты о неполадках».
 */
export function ContactWidget({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
  /** Оставлено для совместимости со старым вызовом. */
  railWidth?: number;
}) {
  const [kind, setKind] = useState<Kind>("question");
  const [message, setMessage] = useState("");
  const [shots, setShots] = useState<Shot[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [note, setNote] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shotsRef = useRef<Shot[]>([]);
  shotsRef.current = shots;
  const busy = status === "sending";
  const current = KINDS.find((k) => k.id === kind)!;

  const reset = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
    shotsRef.current.forEach((s) => URL.revokeObjectURL(s.url));
    setShots([]);
    setMessage("");
    setKind("question");
    setStatus("idle");
    setNote(null);
  }, []);

  const close = useCallback(() => {
    if (busy) return;
    onClose();
    reset();
  }, [busy, onClose, reset]);

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      shotsRef.current.forEach((s) => URL.revokeObjectURL(s.url));
    },
    []
  );

  const addFiles = useCallback((list: FileList | File[]) => {
    const incoming = Array.from(list).filter((f) => f.type.startsWith("image/"));
    if (incoming.length === 0) return;
    setNote(null);
    setShots((prev) => {
      const next = [...prev];
      for (const file of incoming) {
        if (next.length >= MAX_FILES) {
          setNote(`Можно приложить до ${MAX_FILES} скриншотов.`);
          break;
        }
        if (file.size > MAX_FILE_BYTES) {
          setNote("Скриншот больше 5 МБ, он не добавлен.");
          continue;
        }
        next.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, file, url: URL.createObjectURL(file) });
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => textareaRef.current?.focus(), 200);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.some((f) => f.type.startsWith("image/"))) {
        e.preventDefault();
        addFiles(files);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("paste", onPaste);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("paste", onPaste);
    };
  }, [open, close, addFiles]);

  const submit = async () => {
    const text = message.trim();
    if (!text || busy) return;
    setStatus("sending");
    setNote(null);
    try {
      const supabase = createBrowserClient();
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      const user = session?.user;
      const body = `${current.prefix} ${text}`;

      if (shots.length === 0) {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
        const res = await fetch("/api/contact-question", {
          method: "POST",
          headers,
          body: JSON.stringify({ question: body }),
        });
        if (!res.ok) throw new Error("send failed");
      } else {
        const urls: string[] = [];
        let failed = 0;
        for (const shot of shots) {
          const ext = shot.file.type === "image/jpeg" ? "jpg" : "png";
          const name = `bug-reports/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
          const { error } = await supabase.storage.from("bug-reports").upload(name, shot.file, {
            contentType: shot.file.type || "image/png",
            upsert: false,
          });
          if (error) {
            failed += 1;
            continue;
          }
          const { data: pub } = supabase.storage.from("bug-reports").getPublicUrl(name);
          if (pub?.publicUrl) urls.push(pub.publicUrl);
        }
        const email = user?.email || "anonymous";
        const res = await fetch("/api/bug-reports/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description: body,
            image_urls: urls,
            user_email: email,
            user_name: user?.user_metadata?.name || email.split("@")[0] || "Пользователь",
          }),
        });
        if (!res.ok) throw new Error("send failed");
        if (failed > 0) setNote("Текст отправлен, но часть скриншотов не загрузилась.");
      }
      setStatus("sent");
      closeTimer.current = setTimeout(() => {
        onClose();
        reset();
      }, 2200);
    } catch {
      setStatus("error");
    }
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="contact"
          className="fixed inset-0 z-[80] flex items-end justify-center p-3 sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          style={hubSans}
        >
          <div className="absolute inset-0 bg-black/40" onClick={close} aria-hidden />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Написать нам"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              addFiles(e.dataTransfer.files);
            }}
            className="relative w-full max-w-[640px] overflow-hidden rounded-[14px] border border-black/[0.1] bg-white shadow-[0_20px_60px_rgba(0,0,0,0.25)]"
          >
            {status === "sent" ? (
              <div className="flex flex-col items-center gap-2 px-8 py-14 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#141413] text-white">
                  <Check className="h-7 w-7" strokeWidth={2.5} />
                </span>
                <p className="mt-1 text-[18px] font-semibold" style={{ color: hub.text }}>
                  Сообщение отправлено
                </p>
                <p className="text-[14px]" style={{ color: hub.textMuted }}>
                  {note ?? "Ответим на почту аккаунта."}
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-5">
                  <div>
                    <h3 className="text-[17px] font-semibold" style={{ color: hub.text }}>
                      Написать нам
                    </h3>
                    <p className="mt-0.5 text-[14px]" style={{ color: hub.textMuted }}>
                      Поможем разобраться или передадим идею команде.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={close}
                    aria-label="Закрыть"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full outline-none transition-colors hover:bg-black/[0.06]"
                    style={{ color: hub.textMuted }}
                  >
                    <X className="h-[18px] w-[18px]" strokeWidth={1.75} />
                  </button>
                </div>

                <div className="px-6 pb-5">
                  <div role="tablist" aria-label="Тема обращения" className="mb-3 mt-2 flex gap-1.5">
                    {KINDS.map((k) => (
                      <button
                        key={k.id}
                        type="button"
                        role="tab"
                        aria-selected={kind === k.id}
                        onClick={() => setKind(k.id)}
                        className={`h-9 rounded-full border px-4 text-[14px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-black/30 ${
                          kind === k.id
                            ? "border-[#141413] bg-[#141413] text-white"
                            : "border-black/[0.14] text-[var(--hub-text-muted)] hover:bg-black/[0.05]"
                        }`}
                      >
                        {k.label}
                      </button>
                    ))}
                  </div>

                  <div
                    className={`rounded-[12px] border transition-colors focus-within:border-black/50 ${
                      dragOver ? "border-black/60 bg-black/[0.03]" : "border-black/[0.14]"
                    }`}
                    style={{ backgroundColor: "#fff" }}
                  >
                    <textarea
                      ref={textareaRef}
                      value={message}
                      onChange={(e) => setMessage(e.target.value.slice(0, MAX_TEXT))}
                      onKeyDown={(e) => {
                        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") void submit();
                      }}
                      disabled={busy}
                      rows={10}
                      placeholder={current.placeholder}
                      className="block w-full resize-none bg-transparent px-4 pb-2 pt-3.5 text-[15px] leading-[1.5] outline-none placeholder:text-[var(--hub-text-subtle)]"
                      style={{ color: hub.text }}
                    />

                    {shots.length > 0 ? (
                      <ul className="flex flex-wrap gap-2 px-3 pb-3">
                        {shots.map((s) => (
                          <li key={s.id} className="relative h-16 w-16 overflow-hidden rounded-[10px] border border-[var(--hub-border)]">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={s.url} alt="Скриншот" className="h-full w-full object-cover" />
                            <button
                              type="button"
                              aria-label="Убрать скриншот"
                              disabled={busy}
                              onClick={() => {
                                URL.revokeObjectURL(s.url);
                                setShots((prev) => prev.filter((x) => x.id !== s.id));
                              }}
                              className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white outline-none hover:bg-black/80"
                            >
                              <X className="h-3 w-3" strokeWidth={2.25} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    <div className="flex items-center justify-between gap-3 border-t px-3 py-2" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
                      <div className="flex min-w-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => fileRef.current?.click()}
                          disabled={busy || shots.length >= MAX_FILES}
                          className="inline-flex h-9 items-center gap-2 rounded-[10px] px-3 text-[14px] font-medium outline-none transition-colors hover:bg-[var(--hub-text)]/[0.05] disabled:opacity-45"
                          style={{ color: hub.textMuted }}
                        >
                          <ImagePlus className="h-[18px] w-[18px]" strokeWidth={1.5} />
                          Скриншот
                        </button>
                        <span className="hidden truncate text-[12px] sm:inline" style={{ color: hub.textSubtle }}>
                          или перетащите, или Ctrl+V
                        </span>
                      </div>
                      <span className="shrink-0 text-[12px] tabular-nums" style={{ color: hub.textSubtle }}>
                        {message.length}/{MAX_TEXT}
                      </span>
                    </div>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      multiple
                      hidden
                      onChange={(e) => {
                        if (e.target.files) addFiles(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </div>

                  {note && status !== "error" ? (
                    <p className="mt-2 text-[13px]" style={{ color: hub.warn }}>
                      {note}
                    </p>
                  ) : null}
                  {status === "error" ? (
                    <p className="mt-2 flex items-start gap-2 text-[13px]" role="alert" style={{ color: hub.danger }}>
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
                      <span>
                        Не получилось отправить. Текст сохранён, повторите или напишите на{" "}
                        <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium underline">
                          {CONTACT_EMAIL}
                        </a>
                        .
                      </span>
                    </p>
                  ) : null}

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <span className="text-[12px]" style={{ color: hub.textSubtle }}>
                      Ctrl + Enter, чтобы отправить
                    </span>
                    <button
                      type="button"
                      onClick={() => void submit()}
                      disabled={busy || !message.trim()}
                      className="inline-flex h-11 items-center gap-2 rounded-[12px] px-6 text-[15px] font-semibold outline-none transition-[filter,opacity] hover:brightness-95 focus-visible:shadow-[0_0_0_3px_var(--hub-lime-ring)] disabled:opacity-45"
                      style={{ backgroundColor: hub.lime, color: hub.onLime }}
                    >
                      {busy ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Send className="h-[18px] w-[18px]" strokeWidth={1.75} />}
                      {busy ? "Отправляю" : status === "error" ? "Повторить" : "Отправить"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
