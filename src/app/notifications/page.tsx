"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase/client";
import { ArrowLeft, Bell, ExternalLink, CheckCheck } from "lucide-react";

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

const categoryLabel: Record<string, string> = {
  message: "Сообщение",
  reply: "Ответ команды",
  news: "Новости",
  promo: "Акции",
};

export default function NotificationsPage() {
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [items, setItems] = useState<Row[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setAuthed(false);
        setItems([]);
        setUnreadCount(0);
        setLoading(false);
        return;
      }
      setAuthed(true);
      const res = await fetch("/api/notifications", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Ошибка загрузки");
        setLoading(false);
        return;
      }
      setItems(json.notifications || []);
      setUnreadCount(json.unreadCount ?? 0);
    } catch {
      setError("Сеть недоступна");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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

  const toggleExpand = (n: Row) => {
    const open = expandedId === n.id;
    setExpandedId(open ? null : n.id);
    if (!open && !n.read_at) {
      void markRead(n.id);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f3ef] text-[#111827]">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white border border-[#e5e7eb] text-[#374151] hover:bg-[#f9fafb]"
              aria-label="На главную"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                <Bell className="w-7 h-7 text-[#1F4E3D]" />
                Сообщения
              </h1>
              <p className="text-sm text-[#6b7280] mt-0.5">
                Ответы на обращения, новости и акции от команды KARTO
              </p>
            </div>
          </div>
          {authed && unreadCount > 0 && (
            <button
              type="button"
              onClick={() => void markAllRead()}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[#1F4E3D] hover:underline shrink-0"
            >
              <CheckCheck className="w-4 h-4" />
              Прочитать все
            </button>
          )}
        </div>

        {loading && <p className="text-[#6b7280]">Загрузка…</p>}

        {!loading && !authed && (
          <div className="rounded-2xl bg-white border border-[#e5e7eb] p-8 text-center">
            <p className="text-[#374151]">Войдите в аккаунт, чтобы видеть сообщения.</p>
            <Link
              href="/login"
              className="inline-block mt-4 px-5 py-2.5 rounded-xl bg-[#1F4E3D] text-white text-sm font-medium"
            >
              Вход / Регистрация
            </Link>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 mb-4">
            {error}
          </div>
        )}

        {!loading && authed && items.length === 0 && !error && (
          <div className="rounded-2xl bg-white border border-[#e5e7eb] p-8 text-center text-[#6b7280]">
            <p>Пока нет сообщений.</p>
            <p className="text-sm mt-2">
              Когда команда ответит на ваш баг или идею, уведомление появится здесь.
            </p>
          </div>
        )}

        {authed && (
          <div className="space-y-3">
            {items.map((n) => {
              const open = expandedId === n.id;
              const unread = !n.read_at;
              return (
                <div
                  key={n.id}
                  className={`rounded-2xl border bg-white overflow-hidden transition-shadow ${
                    unread ? "border-[#1F4E3D]/40 shadow-md" : "border-[#e5e7eb]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleExpand(n)}
                    className="w-full text-left px-5 py-4 flex items-start justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {unread && (
                          <span className="w-2 h-2 rounded-full bg-[#1F4E3D] shrink-0 mt-1.5" />
                        )}
                        <span className="font-semibold text-[#111827]">{n.title}</span>
                        <span className="text-[11px] uppercase tracking-wide text-[#9ca3af] font-medium">
                          {categoryLabel[n.category] || n.category}
                        </span>
                      </div>
                      <p className="text-xs text-[#9ca3af] mt-1">
                        {new Date(n.created_at).toLocaleString("ru-RU")}
                      </p>
                    </div>
                    <span className="text-[#9ca3af] text-sm shrink-0">{open ? "▼" : "▶"}</span>
                  </button>
                  {open && (
                    <div className="px-5 pb-5 pt-0 border-t border-[#f3f4f6]">
                      <p className="text-sm text-[#374151] whitespace-pre-wrap leading-relaxed mt-4">
                        {n.body}
                      </p>
                      {n.image_urls?.length > 0 && (
                        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {n.image_urls.map((url, i) => (
                            <a
                              key={i}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block rounded-lg overflow-hidden border border-[#e5e7eb] bg-[#f9fafb]"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={url} alt="" className="w-full h-auto max-h-64 object-contain" />
                            </a>
                          ))}
                        </div>
                      )}
                      {n.link_url && (
                        <a
                          href={n.link_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 mt-4 text-sm font-medium text-[#1F4E3D] hover:underline"
                        >
                          <ExternalLink className="w-4 h-4" />
                          Открыть ссылку
                        </a>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
