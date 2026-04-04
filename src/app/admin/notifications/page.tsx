"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase/client";
import { ArrowLeft, Send } from "lucide-react";

const CATEGORIES = [
  { value: "reply", label: "Ответ на обращение" },
  { value: "message", label: "Личное сообщение" },
  { value: "news", label: "Новость всем" },
  { value: "promo", label: "Акция / конкурс" },
];

export default function AdminNotificationsPage() {
  const [gateLoading, setGateLoading] = useState(true);
  const [loginRequired, setLoginRequired] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [gateNotice, setGateNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [broadcast, setBroadcast] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [imageUrlsRaw, setImageUrlsRaw] = useState("");
  const [category, setCategory] = useState("reply");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session?.access_token) {
        setLoginRequired(true);
        setGateLoading(false);
        return;
      }
      let res: Response;
      try {
        res = await fetch("/api/admin/user-stats?days=1", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
      } catch {
        if (cancelled) return;
        setGateNotice("Не удалось проверить доступ. Проверьте сеть.");
        setGateLoading(false);
        return;
      }
      if (cancelled) return;
      if (res.status === 200) {
        setAllowed(true);
      } else if (res.status === 403) {
        setForbidden(true);
      } else {
        let msg = `Сервис недоступен (${res.status}).`;
        try {
          const j = (await res.json()) as { error?: string };
          if (j?.error && typeof j.error === "string") msg = j.error;
        } catch {
          /* use default */
        }
        setGateNotice(msg);
      }
      setGateLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = useCallback(async () => {
    setResult(null);
    setLoading(true);
    try {
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setResult("Нет сессии");
        setLoading(false);
        return;
      }
      const imageUrls = imageUrlsRaw
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter((s) => s.startsWith("http"));

      const res = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          broadcast,
          userEmail: broadcast ? undefined : userEmail.trim() || undefined,
          title: title.trim(),
          body: body.trim(),
          linkUrl: linkUrl.trim() || undefined,
          imageUrls,
          category,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setResult(json.error || json.details || `Ошибка ${res.status}`);
        setLoading(false);
        return;
      }
      if (json.broadcast) {
        setResult(`Рассылка создана: ${json.recipients} получателей.`);
      } else {
        setResult(`Отправлено. id: ${json.id}`);
      }
      if (!broadcast) {
        setTitle("");
        setBody("");
        setLinkUrl("");
        setImageUrlsRaw("");
      }
    } catch (e) {
      setResult(e instanceof Error ? e.message : "Ошибка сети");
    } finally {
      setLoading(false);
    }
  }, [broadcast, userEmail, title, body, linkUrl, imageUrlsRaw, category]);

  if (gateLoading) {
    return (
      <div className="min-h-screen bg-[#f5f3ef] flex items-center justify-center text-[#6b7280] text-sm">
        Проверка доступа…
      </div>
    );
  }

  if (loginRequired) {
    return (
      <div className="min-h-screen bg-[#f5f3ef] flex flex-col items-center justify-center px-4">
        <p className="text-[#374151] mb-4">Войдите в аккаунт администратора.</p>
        <Link href="/login" className="text-[#1F4E3D] font-medium underline">
          Вход
        </Link>
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="min-h-screen bg-[#f5f3ef] flex flex-col items-center justify-center px-4">
        <p className="text-[#374151] mb-4 text-center max-w-md">
          Нет доступа. Ваш email должен быть в{" "}
          <code className="bg-white px-1 rounded text-sm">ADMIN_STATS_EMAILS</code>.
        </p>
        <Link href="/" className="text-[#1F4E3D] font-medium underline">
          На главную
        </Link>
      </div>
    );
  }

  if (!allowed && gateNotice) {
    return (
      <div className="min-h-screen bg-[#f5f3ef] flex flex-col items-center justify-center px-4">
        <p className="text-[#374151] mb-4 text-center max-w-lg whitespace-pre-wrap">{gateNotice}</p>
        <Link href="/" className="text-[#1F4E3D] font-medium underline">
          На главную
        </Link>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="min-h-screen bg-[#f5f3ef] flex items-center justify-center text-[#6b7280] text-sm">
        Нет доступа.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f3ef] text-[#111827]">
      <div className="max-w-xl mx-auto px-4 py-10">
        <div className="flex items-center gap-3 mb-8">
          <Link
            href="/admin/stats"
            className="inline-flex items-center gap-1 text-sm text-[#6b7280] hover:text-[#111827]"
          >
            <ArrowLeft className="w-4 h-4" />
            Статистика
          </Link>
        </div>
        <h1 className="text-2xl font-bold mb-2">Уведомления пользователям</h1>
        <p className="text-sm text-[#6b7280] mb-6">
          Те же права, что у страницы статистики (<code className="text-xs bg-white px-1 rounded">ADMIN_STATS_EMAILS</code>
          ). У пользователей уведомления открываются по иконке колокольчика в шапке.
        </p>

        <div className="space-y-4 bg-white rounded-2xl border border-[#e5e7eb] p-6 shadow-sm">
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={broadcast}
              onChange={(e) => setBroadcast(e.target.checked)}
              className="rounded border-gray-300"
            />
            Разослать всем зарегистрированным
          </label>

          {!broadcast && (
            <div>
              <label className="block text-xs font-medium text-[#6b7280] mb-1">Email пользователя</label>
              <input
                type="email"
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                placeholder="user@example.com"
                className="w-full rounded-lg border border-[#e5e7eb] px-3 py-2 text-sm"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#6b7280] mb-1">Тип</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-[#e5e7eb] px-3 py-2 text-sm"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#6b7280] mb-1">Заголовок</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-[#e5e7eb] px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#6b7280] mb-1">Текст</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              className="w-full rounded-lg border border-[#e5e7eb] px-3 py-2 text-sm resize-y min-h-[120px]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#6b7280] mb-1">
              Ссылки на картинки (по одной в строке или через запятую)
            </label>
            <textarea
              value={imageUrlsRaw}
              onChange={(e) => setImageUrlsRaw(e.target.value)}
              rows={3}
              placeholder="https://..."
              className="w-full rounded-lg border border-[#e5e7eb] px-3 py-2 text-sm font-mono text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#6b7280] mb-1">Ссылка «узнать больше» (необязательно)</label>
            <input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://..."
              className="w-full rounded-lg border border-[#e5e7eb] px-3 py-2 text-sm"
            />
          </div>

          <button
            type="button"
            disabled={loading || !title.trim() || !body.trim() || (!broadcast && !userEmail.trim())}
            onClick={() => void submit()}
            className="inline-flex items-center justify-center gap-2 w-full rounded-xl bg-[#1F4E3D] text-white py-3 text-sm font-medium disabled:opacity-40"
          >
            <Send className="w-4 h-4" />
            {loading ? "Отправка…" : broadcast ? "Разослать всем" : "Отправить пользователю"}
          </button>

          {result && (
            <p className="text-sm text-[#374151] whitespace-pre-wrap border-t border-[#f3f4f6] pt-4">{result}</p>
          )}
        </div>
      </div>
    </div>
  );
}
