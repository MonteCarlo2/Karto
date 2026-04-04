"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase/client";
import { ArrowLeft, ImagePlus, Send, Trash2, Upload } from "lucide-react";

const MAX_IMAGES = 12;

export default function AdminNotificationsPage() {
  const [gateLoading, setGateLoading] = useState(true);
  const [loginRequired, setLoginRequired] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [gateNotice, setGateNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [broadcast, setBroadcast] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const imageUrlsRef = useRef<string[]>([]);
  const formCardRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    imageUrlsRef.current = imageUrls;
  }, [imageUrls]);

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

  const uploadFile = useCallback(async (file: File) => {
    setResult(null);
    if (imageUrlsRef.current.length >= MAX_IMAGES) {
      setResult(`Не больше ${MAX_IMAGES} изображений`);
      return;
    }

    const supabase = createBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setResult("Нет сессии");
      return;
    }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/notification-image", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: fd,
      });
      const json = (await res.json()) as { url?: string; error?: string; details?: string };
      if (!res.ok) {
        setResult(json.error || json.details || `Ошибка ${res.status}`);
        return;
      }
      if (!json.url?.startsWith("http")) {
        setResult("Сервер не вернул URL");
        return;
      }
      setImageUrls((prev) => {
        if (prev.length >= MAX_IMAGES) {
          setResult(`Не больше ${MAX_IMAGES} изображений`);
          return prev;
        }
        return [...prev, json.url!];
      });
    } catch (e) {
      setResult(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setUploading(false);
    }
  }, []);

  useEffect(() => {
    const el = formCardRef.current;
    if (!allowed || !el) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.kind === "file" && it.type.startsWith("image/")) {
          e.preventDefault();
          const f = it.getAsFile();
          if (f) void uploadFile(f);
          break;
        }
      }
    };
    el.addEventListener("paste", onPaste);
    return () => el.removeEventListener("paste", onPaste);
  }, [allowed, uploadFile]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    for (const f of files) {
      if (imageUrlsRef.current.length >= MAX_IMAGES) break;
      void uploadFile(f);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      if (imageUrlsRef.current.length >= MAX_IMAGES) break;
      void uploadFile(files[i]);
    }
    e.target.value = "";
  };

  const removeImage = (idx: number) => {
    setImageUrls((prev) => prev.filter((_, i) => i !== idx));
  };

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
        setImageUrls([]);
      }
    } catch (e) {
      setResult(e instanceof Error ? e.message : "Ошибка сети");
    } finally {
      setLoading(false);
    }
  }, [broadcast, userEmail, title, body, linkUrl, imageUrls]);

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
          ). У пользователей панель открывается по колокольчику в шапке.
        </p>

        <div
          ref={formCardRef}
          tabIndex={0}
          className="space-y-4 bg-white rounded-2xl border border-[#e5e7eb] p-6 shadow-sm outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-[#2E5A43]/40"
        >
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
              rows={14}
              className="w-full rounded-lg border border-[#e5e7eb] px-3 py-3 text-base leading-relaxed resize-y min-h-[320px]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#6b7280] mb-2">
              Изображения к письму
            </label>
            <p className="text-xs text-[#6b7280] mb-2">
              Перетащите файлы сюда, нажмите «Выбрать файлы» или вставьте картинку из буфера (Ctrl+V), когда курсор в этой карточке формы.
            </p>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={onDrop}
              className="rounded-xl border-2 border-dashed border-[#2E5A43]/35 bg-[#f0f4f1]/80 px-4 py-6 text-center transition-colors hover:border-[#2E5A43]/55 hover:bg-[#e8f0eb]/90"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                multiple
                className="hidden"
                onChange={onFileChange}
              />
              <div className="flex flex-col items-center gap-2">
                <ImagePlus className="w-8 h-8 text-[#2E5A43]/70" />
                <button
                  type="button"
                  disabled={uploading || imageUrls.length >= MAX_IMAGES}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#1F4E3D] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                >
                  <Upload className="w-4 h-4" />
                  {uploading ? "Загрузка…" : "Выбрать с компьютера"}
                </button>
                <span className="text-[11px] text-[#9ca3af]">
                  PNG, JPEG, WebP, GIF · до 4 МБ каждый · максимум {MAX_IMAGES} шт.
                </span>
              </div>
            </div>

            {imageUrls.length > 0 && (
              <ul className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {imageUrls.map((url, idx) => (
                  <li
                    key={`${url}-${idx}`}
                    className="relative group rounded-lg border border-[#e5e7eb] overflow-hidden bg-[#f9fafb] aspect-square"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(idx)}
                      className="absolute top-1 right-1 rounded-full bg-black/60 p-1.5 text-white opacity-90 hover:bg-red-600 transition-colors"
                      aria-label="Удалить"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
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
