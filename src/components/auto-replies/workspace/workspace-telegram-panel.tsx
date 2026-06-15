"use client";

import Image from "next/image";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { CircleHelp, Loader2, Unplug } from "lucide-react";
import { autoRepliesAuthorizedFetch } from "@/lib/auto-replies/auto-replies-fetch";
import { WsGlassPanel, panel, wsSans } from "./settings-ui";

type TelegramStatus = {
  configured: boolean;
  linked: boolean;
  botUsername: string;
  username: string | null;
  firstName: string | null;
  linkedAt: string | null;
};

const TG_FETCH_MS = 20_000;
const TG_STATUS_RETRIES = 3;
const TG_BLUE = "#24A1DE";
const TG_BORDER = "rgba(36, 161, 222, 0.3)";

const HELP_TEXT =
  "Бот присылает в Telegram отзывы полуавтоматического режима, ожидающие подтверждения. Подтверждайте, редактируйте или перегенерируйте ответ в чате — всё синхронизируется с KARTO.";

function TelegramLogo() {
  return (
    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full">
      <Image
        src="/images/telegram-logo.png?v=2"
        alt="Telegram"
        width={40}
        height={40}
        className="block h-full w-full object-cover"
        unoptimized
        draggable={false}
      />
    </div>
  );
}

async function fetchTelegramStatus(): Promise<TelegramStatus> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < TG_STATUS_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
    try {
      const res = await autoRepliesAuthorizedFetch("/api/telegram/status", { timeoutMs: TG_FETCH_MS });
      const data = (await res.json()) as TelegramStatus & { error?: string };
      if (!res.ok) throw new Error(data.error || "Не удалось загрузить статус");
      return data;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error("Ошибка загрузки");
    }
  }

  throw lastError ?? new Error("Не удалось загрузить статус");
}

const HELP_POPOVER_W = 272;

function TelegramHelpButton() {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;

    const update = () => {
      const rect = btnRef.current!.getBoundingClientRect();
      const margin = 12;
      let left = rect.right - HELP_POPOVER_W;
      left = Math.max(margin, Math.min(left, window.innerWidth - HELP_POPOVER_W - margin));
      setPos({ top: rect.bottom + 8, left });
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || popoverRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const popover =
    open && typeof document !== "undefined"
      ? createPortal(
          <AnimatePresence>
            <motion.div
              ref={popoverRef}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.15 }}
              className="fixed z-[300] rounded-xl border px-3.5 py-3 shadow-[0_14px_36px_-12px_rgba(10,10,10,0.22)]"
              style={{
                top: pos.top,
                left: pos.left,
                width: HELP_POPOVER_W,
                borderColor: TG_BORDER,
                backgroundColor: "#fff",
              }}
            >
              <p className="text-[12px] leading-[1.55]" style={{ ...wsSans, color: panel.textMuted }}>
                {HELP_TEXT}
              </p>
            </motion.div>
          </AnimatePresence>,
          document.body
        )
      : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label="Что такое интеграция с Telegram"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition hover:bg-[rgba(36,161,222,0.12)]"
        style={{ color: TG_BLUE }}
      >
        <CircleHelp className="h-3.5 w-3.5" strokeWidth={2.2} />
      </button>
      {popover}
    </>
  );
}

function StatusDot({ active, loading }: { active: boolean; loading?: boolean }) {
  if (loading) {
    return <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" style={{ color: TG_BLUE }} strokeWidth={2.2} />;
  }
  return (
    <span
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      title={active ? "Подключено" : "Не подключено"}
      style={{
        backgroundColor: active ? "#34C759" : "#FF453A",
        boxShadow: active
          ? "0 0 0 3px rgba(52,199,89,0.22)"
          : "0 0 0 3px rgba(255,69,58,0.18)",
      }}
    />
  );
}

export function WorkspaceTelegramPanel() {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const statusRef = useRef<TelegramStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  statusRef.current = status;

  const refreshSilent = useCallback(async () => {
    try {
      const data = await fetchTelegramStatus();
      setStatus(data);
      setError(null);
    } catch {
      /* сохраняем последний успешный статус */
    }
  }, []);

  const refresh = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await fetchTelegramStatus();
      setStatus(data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ошибка загрузки";
      if (statusRef.current === null) setError(msg);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void refresh({ silent: true });
    };
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const connect = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await autoRepliesAuthorizedFetch("/api/telegram/link-token", {
        method: "POST",
        timeoutMs: TG_FETCH_MS,
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || "Не удалось получить ссылку");
      window.open(data.url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => void refreshSilent(), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка подключения");
    } finally {
      setBusy(false);
    }
  }, [refreshSilent]);

  const unlink = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await autoRepliesAuthorizedFetch("/api/telegram/unlink", {
        method: "POST",
        timeoutMs: TG_FETCH_MS,
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Не удалось отключить");

      setStatus((prev) =>
        prev
          ? { ...prev, linked: false, username: null, firstName: null, linkedAt: null }
          : prev
      );
      void refreshSilent();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка отключения");
    } finally {
      setBusy(false);
    }
  }, [refreshSilent]);

  const configured = status?.configured ?? false;
  const linked = Boolean(status?.linked);
  const displayName = status?.username
    ? `@${status.username}`
    : status?.firstName?.trim() || null;
  const showActions = configured;
  const statusKnown = status !== null;

  return (
    <WsGlassPanel className="w-full !overflow-visible" borderColor={TG_BORDER}>
      <div
        className="px-4 py-3.5 sm:px-5"
        style={{
          background:
            "linear-gradient(135deg, rgba(36,161,222,0.09) 0%, rgba(243,241,234,0.42) 60%, rgba(36,161,222,0.05) 100%)",
        }}
      >
        <div className="flex items-start gap-3">
          <TelegramLogo />

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p
                className="shrink-0 text-[13px] font-bold uppercase leading-none tracking-[0.08em] whitespace-nowrap"
                style={{ ...wsSans, color: "#1788C7" }}
              >
                Интеграция с Телеграммом
              </p>
              <TelegramHelpButton />
              <StatusDot active={linked} loading={loading || (!statusKnown && Boolean(error))} />
            </div>

            {loading && !statusKnown ? (
              <p className="mt-1.5 text-[12px]" style={{ ...wsSans, color: panel.textSubtle }}>
                Загрузка…
              </p>
            ) : linked && displayName ? (
              <p
                className="mt-1.5 break-all text-[12px] font-medium leading-snug"
                style={{ ...wsSans, color: panel.textMuted }}
              >
                {displayName}
              </p>
            ) : statusKnown && !configured ? (
              <p className="mt-1.5 text-[12px]" style={{ ...wsSans, color: panel.textSubtle }}>
                Скоро будет доступно
              </p>
            ) : statusKnown ? (
              <p className="mt-1.5 text-[12px]" style={{ ...wsSans, color: panel.textMuted }}>
                Не подключено
              </p>
            ) : null}

            {error && !statusKnown ? (
              <div className="mt-1.5">
                <p className="text-[11px] leading-snug text-red-700" style={wsSans}>
                  {error}
                </p>
                <button
                  type="button"
                  className="mt-1 text-[11px] font-medium underline"
                  style={{ ...wsSans, color: TG_BLUE }}
                  onClick={() => void refresh()}
                >
                  Повторить
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {showActions ? (
        <div
          className="border-t px-4 py-2.5 sm:px-5"
          style={{ borderColor: "rgba(36, 161, 222, 0.12)" }}
        >
          {linked ? (
            <button
              type="button"
              disabled={busy || loading}
              onClick={() => void unlink()}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[rgba(36,161,222,0.18)] bg-white/70 px-3 py-1.5 text-[12px] font-medium text-[#5C6B78] transition hover:border-[rgba(36,161,222,0.32)] hover:bg-white disabled:opacity-50"
              style={wsSans}
            >
              <Unplug className="h-3 w-3 shrink-0 opacity-70" strokeWidth={2} />
              {busy ? "Отключаем…" : "Отключить"}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || loading}
              onClick={() => void connect()}
              className="flex w-full items-center justify-center rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white shadow-[0_6px_20px_-10px_rgba(36,161,222,0.55)] transition hover:brightness-[1.04] disabled:opacity-50"
              style={{ ...wsSans, backgroundColor: TG_BLUE }}
            >
              {busy ? "Открываем бота…" : "Подключить"}
            </button>
          )}
        </div>
      ) : null}
    </WsGlassPanel>
  );
}
