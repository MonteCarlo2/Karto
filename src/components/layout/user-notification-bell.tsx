"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { Bell, CheckCheck, ChevronDown, ExternalLink, MessageCircleReply, Send } from "lucide-react";
import { NotificationRichBody } from "@/components/layout/notification-rich-body";
import { AnimatePresence, motion } from "framer-motion";

const LIME = "#84CC16";
const GREEN = "#1F4E3D";

type Row = {
  id: string;
  title: string;
  body: string;
  image_urls: string[];
  link_url: string | null;
  category: string;
  created_at: string;
  read_at: string | null;
  replies_enabled?: boolean;
  user_reply_text?: string | null;
  user_replied_at?: string | null;
};

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function UserNotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Row[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({});
  const [replyOpenId, setReplyOpenId] = useState<string | null>(null);
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const fetchList = useCallback(async () => {
    try {
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/notifications", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;
      const j = await res.json();
      setItems(j.notifications || []);
      setUnreadCount(typeof j.unreadCount === "number" ? j.unreadCount : 0);
      setReplyError(null);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void fetchList();
    const id = setInterval(() => void fetchList(), 120_000);
    const onFocus = () => void fetchList();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchList]);

  useEffect(() => {
    if (!open) return;
    const fn = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setExpandedId(null);
      }
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [open]);

  const markRead = async (id: string) => {
    const supabase = createBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    await fetch("/api/notifications/mark-read", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id }),
    });
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));
  };

  const markAllRead = async () => {
    const supabase = createBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    await fetch("/api/notifications/mark-read", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ markAll: true }),
    });
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? now })));
    setUnreadCount(0);
  };

  const toggleItem = (n: Row) => {
    const next = expandedId === n.id ? null : n.id;
    setExpandedId(next);
    if (next && !n.read_at) void markRead(n.id);
    if (!next) {
      setReplyOpenId(null);
      setReplyError(null);
    }
  };

  const submitReply = async (n: Row) => {
    const text = (replyDraft[n.id] ?? "").trim();
    if (!text) {
      setReplyError("Напишите ответ");
      return;
    }
    setReplySubmitting(true);
    setReplyError(null);
    try {
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/notifications/reply", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: n.id, text }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setReplyError(typeof j.error === "string" ? j.error : "Не удалось отправить");
        return;
      }
      const at = typeof j.user_replied_at === "string" ? j.user_replied_at : new Date().toISOString();
      setItems((prev) =>
        prev.map((it) =>
          it.id === n.id ? { ...it, user_reply_text: text, user_replied_at: at } : it
        )
      );
      setReplyDraft((d) => {
        const next = { ...d };
        delete next[n.id];
        return next;
      });
      setReplyOpenId(null);
    } catch {
      setReplyError("Ошибка сети");
    } finally {
      setReplySubmitting(false);
    }
  };

  const hasUnread = unreadCount > 0;

  return (
    <div className="relative shrink-0" ref={wrapRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((o) => {
            if (o) {
              setExpandedId(null);
              return false;
            }
            setLoading(true);
            void fetchList().finally(() => setLoading(false));
            return true;
          });
        }}
        className={[
          "relative flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#2E5A43]/55 bg-white transition-all",
          "hover:bg-[#ECF7DB]/40 hover:shadow-[0_4px_12px_rgba(31,78,61,0.15)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#84CC16]/45 focus-visible:ring-offset-2",
          hasUnread ? "border-[#1F4E3D] shadow-[0_0_0_3px_rgba(132,204,22,0.2)]" : "",
        ].join(" ")}
        aria-label="Уведомления"
        aria-expanded={open}
      >
        <Bell className={`h-5 w-5 ${hasUnread ? "text-[#1F4E3D]" : "text-neutral-800"}`} />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#dc2626] px-1 text-[10px] font-semibold tabular-nums text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute right-0 top-full z-[60] mt-2 flex max-h-[min(78vh,560px)] w-[min(calc(100vw-1rem),24.5rem)] flex-col overflow-hidden rounded-2xl border border-[#2E5A43]/14 bg-white/92 shadow-[0_20px_64px_-16px_rgba(31,78,61,0.26),0_8px_22px_rgba(0,0,0,0.07)] backdrop-blur-xl supports-[backdrop-filter]:bg-white/[0.8]"
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(132,204,22,0.09),transparent_45%),radial-gradient(circle_at_bottom_left,rgba(31,78,61,0.07),transparent_48%)]" />
            <div className="h-[2px] w-full shrink-0 bg-[#84CC16]/60" aria-hidden />

            <div className="relative flex shrink-0 items-center justify-between gap-3 border-b border-[#2E5A43]/10 bg-[#f8fbf8]/92 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#2E5A43]/15 bg-white/80">
                  <Bell className="h-3.5 w-3.5 text-[#1F4E3D]" />
                </span>
                <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-neutral-900">
                  Уведомления
                </h2>
              </div>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#84CC16]/45 bg-[#ECF7DB] px-3 py-1.5 text-[12px] font-semibold text-neutral-900 transition-all hover:bg-[#dff3c4] hover:shadow-[0_3px_10px_rgba(132,204,22,0.28)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#84CC16]/40"
                >
                  <CheckCheck className="h-3.5 w-3.5 text-[#1F4E3D]" strokeWidth={2.25} />
                  Прочитать всё
                </button>
              )}
            </div>

            <div className="relative min-h-0 flex-1 overflow-y-auto">
              {loading && items.length === 0 ? (
                <p className="p-8 text-center text-[15px] text-neutral-500">Загрузка…</p>
              ) : items.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-[#84CC16]/35 bg-[#ECF7DB]">
                    <Bell className="h-6 w-6 text-[#1F4E3D]/75" strokeWidth={1.5} />
                  </div>
                  <p className="text-[15px] font-semibold text-neutral-900">Пока пусто</p>
                  <p className="mx-auto mt-1.5 max-w-[240px] text-[13px] leading-relaxed text-neutral-600">
                    Сообщения от команды KARTO появятся здесь
                  </p>
                </div>
              ) : (
                <ul className="relative py-2">
                  {items.map((n) => {
                    const exp = expandedId === n.id;
                    const unread = !n.read_at;
                    const thumb = n.image_urls?.[0];
                    return (
                      <li key={n.id} className="list-none px-2 py-0.5">
                        <button
                          type="button"
                          onClick={() => toggleItem(n)}
                          className={[
                            "relative flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-all",
                            "hover:bg-[#f4faf6] hover:shadow-[0_6px_16px_-10px_rgba(31,78,61,0.35)]",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#84CC16]/35",
                            unread
                              ? "before:absolute before:left-1.5 before:top-2.5 before:bottom-2.5 before:w-px before:rounded-full before:bg-[#84CC16]/30"
                              : "",
                            exp ? "bg-white/70" : "",
                          ].join(" ")}
                        >
                          <div className="flex w-4 shrink-0 items-start justify-center pt-2" aria-hidden>
                            <span
                              className={[
                                "block rounded-full transition-all",
                                unread
                                  ? "h-2.5 w-2.5 ring-2 ring-[#ECF7DB] shadow-[0_0_0_3px_rgba(132,204,22,0.14)]"
                                  : "h-2 w-2 bg-[#2E5A43]/18",
                              ].join(" ")}
                              style={unread ? { backgroundColor: LIME } : undefined}
                            />
                          </div>
                          {thumb ? (
                            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-black/[0.04] ring-1 ring-black/[0.06]">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={thumb}
                                alt=""
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            </div>
                          ) : null}
                          <div className="min-w-0 flex-1 pt-0.5">
                            <p className="text-[15px] font-semibold leading-snug tracking-[-0.01em] text-neutral-900 line-clamp-2">
                              {n.title}
                            </p>
                            <div className="mt-1 flex items-center gap-2">
                              {unread && (
                                <span className="inline-flex h-4 items-center rounded-full bg-[#ECF7DB] px-1.5 text-[10px] font-semibold text-[#1F4E3D]">
                                  NEW
                                </span>
                              )}
                              <p className="text-[13px] tabular-nums text-neutral-500">
                                {formatWhen(n.created_at)}
                              </p>
                            </div>
                          </div>
                          <ChevronDown
                            className={`mt-1 h-[18px] w-[18px] shrink-0 text-neutral-400 transition-transform duration-300 ease-out ${
                              exp ? "rotate-180 text-[#1F4E3D]" : ""
                            }`}
                            strokeWidth={2}
                          />
                        </button>

                        <div
                          className={`grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                            exp ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                          }`}
                        >
                          <div className="min-h-0 overflow-hidden">
                            <div className="ml-6 rounded-xl border border-[#2E5A43]/10 bg-[#f9fdf9]/95 px-4 pb-4 pt-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                              <NotificationRichBody body={n.body} />

                              {n.image_urls && n.image_urls.length > 0 && (
                                <div className="mt-4 space-y-3">
                                  {n.image_urls.slice(0, 8).map((url, i) => (
                                    <a
                                      key={i}
                                      href={url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="block overflow-hidden rounded-xl bg-black/[0.03] ring-1 ring-black/[0.06]"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={url}
                                        alt=""
                                        className="max-h-64 w-full object-contain"
                                        loading="lazy"
                                      />
                                    </a>
                                  ))}
                                </div>
                              )}

                              {n.link_url && (
                                <a
                                  href={n.link_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-[#2E5A43]/20 bg-[#ECF7DB] py-2.5 text-[13px] font-semibold text-neutral-900 transition-colors hover:bg-[#dff3c4]"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <ExternalLink className="h-3.5 w-3.5 text-[#1F4E3D]" strokeWidth={2} />
                                  Узнать больше
                                </a>
                              )}

                              {n.replies_enabled && (
                                <div
                                  className="mt-4 border-t border-[#2E5A43]/10 pt-4"
                                  onClick={(e) => e.stopPropagation()}
                                  onMouseDown={(e) => e.stopPropagation()}
                                >
                                  {n.user_reply_text ? (
                                    <div className="rounded-xl border border-[#84CC16]/35 bg-[#f7fdf0] px-3 py-2.5">
                                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#4d7c0f]">
                                        Ваш ответ отправлен
                                      </p>
                                      <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-neutral-800">
                                        {n.user_reply_text}
                                      </p>
                                    </div>
                                  ) : (
                                    <>
                                      {replyOpenId !== n.id ? (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setReplyOpenId(n.id);
                                            setReplyError(null);
                                          }}
                                          className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#2E5A43]/22 bg-white py-2.5 text-[13px] font-semibold text-neutral-900 shadow-sm transition-colors hover:bg-[#f4faf6]"
                                        >
                                          <MessageCircleReply className="h-4 w-4 text-[#1F4E3D]" strokeWidth={2} />
                                          Ответить команде
                                        </button>
                                      ) : (
                                        <div className="space-y-2">
                                          <label className="block text-[11px] font-semibold text-[#4d7c0f]">
                                            Ваш ответ (видит только команда KARTO)
                                          </label>
                                          <textarea
                                            value={replyDraft[n.id] ?? ""}
                                            onChange={(e) =>
                                              setReplyDraft((d) => ({ ...d, [n.id]: e.target.value }))
                                            }
                                            rows={5}
                                            maxLength={8000}
                                            placeholder="Что нравится, что улучшить, чего не хватает…"
                                            className="w-full resize-y rounded-xl border border-[#2E5A43]/18 bg-white px-3 py-2.5 text-[14px] leading-relaxed text-neutral-900 shadow-inner outline-none ring-[#84CC16]/0 transition-shadow focus:border-[#84CC16]/55 focus:ring-2 focus:ring-[#84CC16]/25"
                                          />
                                          <div className="flex flex-wrap items-center gap-2">
                                            <button
                                              type="button"
                                              disabled={replySubmitting}
                                              onClick={() => void submitReply(n)}
                                              className="inline-flex flex-1 min-w-[8rem] items-center justify-center gap-2 rounded-xl bg-[#1F4E3D] py-2.5 text-[13px] font-semibold text-white transition-opacity disabled:opacity-50"
                                            >
                                              <Send className="h-3.5 w-3.5" strokeWidth={2} />
                                              {replySubmitting ? "Отправка…" : "Отправить"}
                                            </button>
                                            <button
                                              type="button"
                                              disabled={replySubmitting}
                                              onClick={() => {
                                                setReplyOpenId(null);
                                                setReplyError(null);
                                              }}
                                              className="rounded-xl border border-neutral-200 px-3 py-2.5 text-[13px] font-medium text-neutral-600 hover:bg-neutral-50"
                                            >
                                              Отмена
                                            </button>
                                          </div>
                                          {replyError && (
                                            <p className="text-[12px] font-medium text-red-600">{replyError}</p>
                                          )}
                                        </div>
                                      )}
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
