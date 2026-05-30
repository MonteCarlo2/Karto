"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase/client";
import { formatSubscriptionPeriodRu } from "@/lib/subscription";
import type { SubscriptionState } from "@/lib/subscription";

function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  busy,
  destructive,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  busy: boolean;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[240] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl border border-[#2E5A43]/12 bg-white p-6 shadow-2xl"
      >
        <h4 className="text-lg font-semibold text-gray-900">{title}</h4>
        <p className="mt-3 text-sm leading-relaxed text-gray-600">{body}</p>
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 disabled:opacity-60"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 ${
              destructive ? "bg-red-700 hover:bg-red-800" : "bg-[#1F4E3D] hover:bg-[#163d30]"
            }`}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

type ConfirmKind = "enable" | "disable" | "removeCard" | null;

function formatRenewDate(iso?: string): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(ms));
}

export function ProfileAutoReplyBillingPanel({
  subscription,
  onUpdated,
}: {
  subscription: SubscriptionState;
  onUpdated: () => void | Promise<void>;
}) {
  const balance = Math.max(0, subscription.autoReplyBalance ?? 0);
  const period = formatSubscriptionPeriodRu(
    subscription.autoReplyPeriodStart,
    subscription.autoReplyPeriodEnd
  );
  const autoRenew = Boolean(subscription.autoReplyAutoRenew);
  const hasSavedCard = Boolean(subscription.autoReplyHasSavedCard);
  const monthlyPrice = subscription.autoReplyMonthlyPriceRub ?? 0;
  const nextRenewLabel = formatRenewDate(subscription.autoReplyNextRenewAt);
  const showPanel =
    balance > 0 ||
    subscription.autoReplyPackExpired ||
    hasSavedCard ||
    Boolean(subscription.autoReplyPeriodStart);

  const [confirmKind, setConfirmKind] = useState<ConfirmKind>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!showPanel) return null;

  const openConfirm = (kind: ConfirmKind) => {
    if (kind === "disable" && !autoRenew) return;
    if (kind === "enable" && !hasSavedCard) return;
    if (kind === "removeCard" && !hasSavedCard) return;
    setConfirmKind(kind);
    setError(null);
  };

  const applyAction = async () => {
    if (!confirmKind) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError("Войдите в аккаунт");
        return;
      }

      const isRemove = confirmKind === "removeCard";
      const res = await fetch(
        isRemove ? "/api/auto-replies/billing/saved-card" : "/api/auto-replies/billing/auto-renew",
        {
          method: isRemove ? "DELETE" : "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          ...(isRemove ? {} : { body: JSON.stringify({ autoRenew: confirmKind === "enable" }) }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!data.success) {
        setError(typeof data.error === "string" ? data.error : "Не удалось сохранить");
        return;
      }
      setMessage(typeof data.message === "string" ? data.message : null);
      setConfirmKind(null);
      await onUpdated();
    } catch {
      setError("Ошибка сети");
    } finally {
      setBusy(false);
    }
  };

  const enableConfirmBody = hasSavedCard
    ? `С сохранённой карты будет списываться ${monthlyPrice.toLocaleString("ru-RU")} ₽ раз в 30 дней за выбранный пакет ответов. Текущий оплаченный период не прерывается.${nextRenewLabel ? ` Следующее списание — ${nextRenewLabel}.` : ""}`
    : "Для автопродления нужна сохранённая карта. Оформите пакет «Отзывы» с включённым автопродлением в разделе «Цена».";

  const disableConfirmBody = period
    ? `Автопродление будет отключено. Текущий пакет останется активным до конца оплаченного периода (${period.split(" — ")[1] ?? period}). Следующее списание выполнено не будет. Карта останется сохранённой — автопродление можно включить снова.`
    : "Следующее списание выполнено не будет. Сохранённая карта останется привязанной.";

  const removeCardBody = period
    ? `Карта будет удалена из KARTO, автопродление отключится. Текущий пакет действует до конца оплаченного периода (${period.split(" — ")[1] ?? period}). Для автопродления в будущем потребуется новая оплата с сохранением карты.`
    : "Карта будет удалена из KARTO, автопродление отключится. Для автопродления потребуется новая оплата с сохранением карты.";

  return (
    <>
      <div className="rounded-lg bg-white/50 px-3 py-2.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-gray-800">
              Автопродление · <span className="font-semibold">Отзывы</span>
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              {autoRenew ? (
                <>
                  <span className="font-medium text-[#2E5A43]">Включено</span>
                  {hasSavedCard && monthlyPrice > 0
                    ? ` · ${monthlyPrice.toLocaleString("ru-RU")} ₽ / 30 дней`
                    : null}
                  {nextRenewLabel ? ` · следующее списание ${nextRenewLabel}` : null}
                </>
              ) : (
                "Выключено"
              )}
            </p>
            {hasSavedCard ? (
              <p className="mt-1 text-xs text-gray-500">Сохранённая карта привязана к аккаунту</p>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            {autoRenew ? (
              <button
                type="button"
                onClick={() => openConfirm("disable")}
                disabled={busy}
                className="rounded-full border border-amber-200 bg-amber-50 px-4 py-1.5 text-xs font-semibold text-amber-950 transition hover:bg-amber-100 disabled:opacity-50"
              >
                Выключить
              </button>
            ) : hasSavedCard ? (
              <button
                type="button"
                onClick={() => openConfirm("enable")}
                disabled={busy}
                className="rounded-full bg-[#1F4E3D] px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-[#163d30] disabled:opacity-50"
              >
                Включить
              </button>
            ) : (
              <Link
                href="/#pricing"
                className="rounded-full border border-[#2E5A43]/25 bg-[#2E5A43]/[0.07] px-4 py-1.5 text-xs font-semibold text-[#1F4E3D] transition hover:bg-[#2E5A43]/10"
              >
                Оформить с картой
              </Link>
            )}
            {hasSavedCard ? (
              <button
                type="button"
                onClick={() => openConfirm("removeCard")}
                disabled={busy}
                className="rounded-full border border-red-200 bg-red-50 px-4 py-1.5 text-xs font-semibold text-red-900 transition hover:bg-red-100 disabled:opacity-50"
              >
                Удалить карту
              </button>
            ) : null}
          </div>
        </div>

        <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
          Управление автопродлением и картой — в любой момент. Подробнее в{" "}
          <Link href="/payments-policy" className="font-medium text-[#2E5A43] underline underline-offset-2">
            Политике платежей
          </Link>
          .
        </p>

        {message ? <p className="mt-2 text-xs font-medium text-[#2E5A43]">{message}</p> : null}
        {error ? <p className="mt-2 text-xs font-medium text-red-600">{error}</p> : null}
      </div>

      <ConfirmDialog
        open={confirmKind === "enable"}
        title="Включить автопродление?"
        body={enableConfirmBody}
        confirmLabel="Включить"
        busy={busy}
        onCancel={() => {
          if (!busy) setConfirmKind(null);
        }}
        onConfirm={() => void applyAction()}
      />

      <ConfirmDialog
        open={confirmKind === "disable"}
        title="Отключить автопродление?"
        body={disableConfirmBody}
        confirmLabel="Отключить"
        busy={busy}
        onCancel={() => {
          if (!busy) setConfirmKind(null);
        }}
        onConfirm={() => void applyAction()}
      />

      <ConfirmDialog
        open={confirmKind === "removeCard"}
        title="Удалить сохранённую карту?"
        body={removeCardBody}
        confirmLabel="Удалить карту"
        busy={busy}
        destructive
        onCancel={() => {
          if (!busy) setConfirmKind(null);
        }}
        onConfirm={() => void applyAction()}
      />
    </>
  );
}
