"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { Bell, ExternalLink } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

type Row = {
  id: string;
  title: string;
  body: string;
  image_urls: string[];
  link_url: string | null;
  category: string;
  created_at: string;
  read_at: string | null;
};

const categoryShort: Record<string, string> = {
  reply: "Ответ",
  message: "Сообщение",
  news: "Новость",
  promo: "Акция",
};

export function UserNotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Row[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
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
  };

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
        className="relative flex items-center justify-center w-10 h-10 rounded-full border-2 border-[#2E5A43]/60 hover:bg-[#2E5A43]/10 transition-colors"
        aria-label="Сообщения"
        aria-expanded={open}
      >
        <Bell className="w-5 h-5 text-foreground" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-[#b91c1c] text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute right-0 top-full mt-2 z-[60] w-[min(calc(100vw-1.5rem),22rem)] rounded-2xl border border-gray-200 bg-white shadow-xl overflow-hidden flex flex-col max-h-[min(70vh,440px)]"
          >
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2 bg-[#fafafa]">
              <span className="text-sm font-semibold text-gray-900">Сообщения</span>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  className="text-xs font-medium text-[#1F4E3D] hover:underline"
                >
                  Прочитать все
                </button>
              )}
            </div>

            <div className="overflow-y-auto flex-1 min-h-0">
              {loading && items.length === 0 ? (
                <p className="p-4 text-sm text-gray-500">Загрузка…</p>
              ) : items.length === 0 ? (
                <p className="p-4 text-sm text-gray-500">Пока нет сообщений от команды.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {items.map((n) => {
                    const exp = expandedId === n.id;
                    const unread = !n.read_at;
                    return (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => toggleItem(n)}
                          className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${
                            unread ? "bg-emerald-50/40" : ""
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            {unread && (
                              <span className="w-2 h-2 rounded-full bg-[#1F4E3D] shrink-0 mt-1.5" />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-900 line-clamp-2">{n.title}</p>
                              <p className="text-[10px] uppercase tracking-wide text-gray-400 mt-0.5">
                                {categoryShort[n.category] || n.category} ·{" "}
                                {new Date(n.created_at).toLocaleString("ru-RU", {
                                  day: "numeric",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </p>
                            </div>
                            <span className="text-gray-400 text-xs shrink-0">{exp ? "▼" : "▶"}</span>
                          </div>
                        </button>
                        {exp && (
                          <div className="px-4 pb-4 pt-0 bg-white border-t border-gray-50">
                            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed pt-3">
                              {n.body}
                            </p>
                            {n.image_urls?.length > 0 && (
                              <div className="mt-2 flex flex-col gap-2">
                                {n.image_urls.slice(0, 4).map((url, i) => (
                                  <a
                                    key={i}
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block rounded-lg overflow-hidden border border-gray-200"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={url}
                                      alt=""
                                      className="w-full h-auto max-h-40 object-contain bg-gray-50"
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
                                className="inline-flex items-center gap-1 mt-3 text-xs font-medium text-[#1F4E3D] hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                Ссылка
                              </a>
                            )}
                          </div>
                        )}
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
