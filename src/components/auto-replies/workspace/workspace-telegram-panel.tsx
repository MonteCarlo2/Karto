"use client";

import Image from "next/image";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { CircleHelp, Loader2, Unplug } from "lucide-react";
import { autoRepliesAuthorizedFetch } from "@/lib/auto-replies/auto-replies-fetch";
import type { AutoRepliesMarketplaceId, AutoRepliesUsageId } from "@/lib/auto-replies/types";
import { WsGlassPanel, panel, wsSans } from "./settings-ui";

type TelegramStatus = {
  configured: boolean;
  linked: boolean;
  accountLinked?: boolean;
  botUsername: string;
  username: string | null;
  firstName: string | null;
  linkedAt: string | null;
};

type TelegramContext = {
  shopId: string;
  marketplaceId: AutoRepliesMarketplaceId;
};

function statusUrl(ctx: TelegramContext) {
  const params = new URLSearchParams({
    shopId: ctx.shopId,
    marketplaceId: ctx.marketplaceId,
  });
  return `/api/telegram/status?${params.toString()}`;
}

async function fetchTelegramStatus(ctx: TelegramContext): Promise<TelegramStatus> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < TG_STATUS_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
    try {
      const res = await autoRepliesAuthorizedFetch(statusUrl(ctx), { timeoutMs: TG_FETCH_MS });
      const data = (await res.json()) as TelegramStatus & { error?: string };
      if (!res.ok) throw new Error(data.error || "Не удалось загрузить статус");
      return data;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error("Ошибка загрузки");
    }
  }

  throw lastError ?? new Error("Не удалось загрузить статус");
}

const TG_FETCH_MS = 20_000;
const TG_UNLINK_MS = 12_000;
const TG_LINK_MS = 15_000;
const TG_STATUS_RETRIES = 3;
const TG_CONNECT_POLL_MS = 2_000;
const TG_CONNECT_POLL_MAX = 30_000;
const TG_BLUE = "#24A1DE";
const TG_BORDER = "rgba(36, 161, 222, 0.3)";

const HELP_TEXT =
  "Бот присылает в Telegram отзывы полуавтоматического режима, ожидающие подтверждения. Подтверждайте, редактируйте или перегенерируйте ответ в чате — всё синхронизируется с KARTO. Подключение и отключение — отдельно для каждой площадки.";

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

function disconnectedStatus(prev: TelegramStatus): TelegramStatus {
  return { ...prev, linked: false };
}

type WorkspaceTelegramPanelProps = {
  shopId: string;
  marketplaceId: AutoRepliesMarketplaceId;
  usage?: AutoRepliesUsageId;
};

export function WorkspaceTelegramPanel({
  shopId,
  marketplaceId,
  usage = "semi",
}: WorkspaceTelegramPanelProps) {
  const ctx = { shopId, marketplaceId };
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const statusRef = useRef<TelegramStatus | null>(null);
  const connectPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"connect" | "unlink" | null>(null);
  const [error, setError] = useState<string | null>(null);

  statusRef.current = status;

  const stopConnectPoll = useCallback(() => {
    if (connectPollRef.current) {
      clearInterval(connectPollRef.current);
      connectPollRef.current = null;
    }
  }, []);

  const refreshSilent = useCallback(async (): Promise<TelegramStatus | null> => {
    try {
      const data = await fetchTelegramStatus(ctx);
      setStatus(data);
      setError(null);
      return data;
    } catch {
      return null;
    }
  }, [shopId, marketplaceId]);

  const refresh = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await fetchTelegramStatus(ctx);
      setStatus(data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ошибка загрузки";
      if (statusRef.current === null) setError(msg);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [shopId, marketplaceId]);

  useEffect(() => {
    setStatus(null);
    void refresh();
    return () => stopConnectPoll();
  }, [refresh, stopConnectPoll, shopId, marketplaceId]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void refreshSilent();
    };
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [refreshSilent]);

  const startConnectPoll = useCallback(() => {
    stopConnectPoll();
    const started = Date.now();
    connectPollRef.current = setInterval(() => {
      if (Date.now() - started > TG_CONNECT_POLL_MAX) {
        stopConnectPoll();
        return;
      }
      void refreshSilent().then((data) => {
        if (data?.linked) stopConnectPoll();
      });
    }, TG_CONNECT_POLL_MS);
  }, [refreshSilent, stopConnectPoll]);

  const connect = useCallback(async () => {
    setBusy("connect");
    setError(null);
    try {
      const res = await autoRepliesAuthorizedFetch("/api/telegram/link-token", {
        method: "POST",
        body: JSON.stringify({ shopId, marketplaceId }),
        timeoutMs: TG_LINK_MS,
      });
      const data = (await res.json()) as {
        url?: string;
        alreadyLinked?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Не удалось подключить");

      if (data.alreadyLinked) {
        if (data.url) window.open(data.url, "_blank", "noopener,noreferrer");
        await refreshSilent();
        return;
      }

      if (!data.url) throw new Error("Не удалось получить ссылку на бота");
      window.open(data.url, "_blank", "noopener,noreferrer");
      startConnectPoll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка подключения");
    } finally {
      setBusy(null);
    }
  }, [shopId, marketplaceId, refreshSilent, startConnectPoll]);

  const unlink = useCallback(async () => {
    const prev = statusRef.current;
    if (!prev?.linked) return;

    setBusy("unlink");
    setError(null);
    setStatus(disconnectedStatus(prev));

    try {
      const res = await autoRepliesAuthorizedFetch("/api/telegram/unlink", {
        method: "POST",
        body: JSON.stringify({ shopId, marketplaceId }),
        timeoutMs: TG_UNLINK_MS,
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Не удалось отключить");
    } catch (e) {
      setStatus(prev);
      setError(e instanceof Error ? e.message : "Ошибка отключения");
    } finally {
      setBusy(null);
    }
  }, [shopId, marketplaceId]);

  const configured = status?.configured ?? false;
  const linked = Boolean(status?.linked);
  const accountLinked = Boolean(status?.accountLinked);
  const displayName = status?.username
    ? `@${status.username}`
    : status?.firstName?.trim() || null;
  const showConnect = !linked;
  const showUnlink = linked;
  const statusKnown = status !== null;
  const busyConnect = busy === "connect";
  const busyUnlink = busy === "unlink";

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
            ) : statusKnown && !linked && accountLinked && displayName ? (
              <p className="mt-1.5 text-[12px] leading-snug" style={{ ...wsSans, color: panel.textMuted }}>
                Не подключено для этой площадки · аккаунт {displayName}
              </p>
            ) : statusKnown ? (
              <p className="mt-1.5 text-[12px]" style={{ ...wsSans, color: panel.textMuted }}>
                Не подключено
              </p>
            ) : null}

            {!configured && statusKnown && !linked ? (
              <p className="mt-1 text-[11px] leading-snug" style={{ ...wsSans, color: panel.textSubtle }}>
                На сервере не задан TELEGRAM_BOT_TOKEN — подключение временно недоступно.
              </p>
            ) : null}

            {usage !== "semi" && statusKnown && configured ? (
              <p className="mt-1 text-[11px] leading-snug" style={{ ...wsSans, color: panel.textSubtle }}>
                Уведомления работают в полуавтоматическом режиме по звёздам.
              </p>
            ) : null}

            {error ? (
              <div className="mt-1.5">
                <p className="text-[11px] leading-snug text-red-700" style={wsSans}>
                  {error}
                </p>
                {!statusKnown ? (
                  <button
                    type="button"
                    className="mt-1 text-[11px] font-medium underline"
                    style={{ ...wsSans, color: TG_BLUE }}
                    onClick={() => void refresh()}
                  >
                    Повторить
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {showConnect || showUnlink ? (
        <div
          className="border-t px-4 py-2.5 sm:px-5"
          style={{ borderColor: "rgba(36, 161, 222, 0.12)" }}
        >
          {showUnlink ? (
            <button
              type="button"
              disabled={busyUnlink || loading}
              onClick={() => void unlink()}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[rgba(36,161,222,0.18)] bg-white/70 px-3 py-2 text-[12px] font-medium text-[#5C6B78] transition hover:border-[rgba(36,161,222,0.32)] hover:bg-white disabled:opacity-50"
              style={wsSans}
            >
              {busyUnlink ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.2} />
                  Отключаем…
                </>
              ) : (
                <>
                  <Unplug className="h-3.5 w-3.5 shrink-0 opacity-70" strokeWidth={2} />
                  Отключить
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              disabled={busyConnect || loading || !configured}
              onClick={() => void connect()}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold text-white shadow-[0_6px_20px_-10px_rgba(36,161,222,0.55)] transition hover:brightness-[1.04] disabled:opacity-50"
              style={{ ...wsSans, backgroundColor: TG_BLUE }}
            >
              {busyConnect ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.2} />
                  Открываем бота…
                </>
              ) : (
                "Подключить Telegram"
              )}
            </button>
          )}
        </div>
      ) : null}
    </WsGlassPanel>
  );
}
