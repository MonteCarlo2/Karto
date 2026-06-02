"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AlertCircle, Calendar, CreditCard, Loader2, RefreshCw, Shield, Trash2 } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase/client";
import {
  formatAutoReplyPackLine,
  formatBillingDateLong,
  savedCardLabelFromFields,
} from "@/lib/auto-replies-billing-copy";
import type { SubscriptionState } from "@/lib/subscription";

type ConfirmKind = "enable" | "disable" | "removeCard" | null;

function periodAccessLine(periodEndLabel: string | null): string {
  if (periodEndLabel) {
    return `Пакет «Отзывы» останется до ${periodEndLabel} включительно. После этой даты подписка сама не продлится.`;
  }
  return "Уже оплаченный период не обнуляется — доступ сохраняется до его окончания.";
}

function BillingConfirmDialog({
  open,
  kind,
  cardLabel,
  periodEndLabel,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  kind: ConfirmKind;
  cardLabel: string | null;
  periodEndLabel: string | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (open) setStep(1);
  }, [open, kind]);

  if (!mounted || !open || !kind) return null;

  const twoStep = kind === "disable" || kind === "removeCard";
  const accessLine = periodAccessLine(periodEndLabel);

  let title = "";
  let body = "";
  let primaryLabel = "";
  let accentBorder = "border-t-[#2E5A43]";
  let primaryClass = "bg-[#1F4E3D] hover:bg-[#163d30] shadow-[#1F4E3D]/20";
  let Icon = Shield;

  if (kind === "disable") {
    Icon = RefreshCw;
    accentBorder = "border-t-amber-600";
    primaryClass = "bg-amber-800 hover:bg-amber-900 shadow-amber-900/20";
    if (step === 1) {
      title = "Отключить автопродление?";
      body = `Автопродление будет отключено — новых списаний не будет. ${accessLine}${
        cardLabel ? " Карта останется привязанной." : ""
      }`;
      primaryLabel = "Отключить";
    } else {
      title = "Подтвердите отключение";
      body = "Автопродление будет выключено. Включить снова можно в профиле в любой момент.";
      primaryLabel = "Подтвердить";
    }
  } else if (kind === "removeCard") {
    Icon = Trash2;
    accentBorder = "border-t-red-600";
    primaryClass = "bg-red-600 hover:bg-red-700 shadow-red-900/20";
    if (step === 1) {
      title = "Удалить сохранённую карту?";
      body = `Карта будет удалена из аккаунта, автопродление отключится. ${accessLine}`;
      primaryLabel = "Удалить карту";
    } else {
      title = "Подтвердите удаление";
      body = cardLabel
        ? `Карта ${cardLabel} будет отвязана. Автопродление выключится.`
        : "Сохранённая карта будет отвязана. Автопродление выключится.";
      primaryLabel = "Подтвердить";
    }
  } else {
    title = "Включить автопродление?";
    body = cardLabel
      ? `С карты ${cardLabel} раз в 30 дней будет списываться оплата за пакет. ${accessLine}`
      : "Нужна привязанная карта. Оформите пакет «Отзывы» с автопродлением на главной.";
    primaryLabel = "Включить";
  }

  const handlePrimary = () => {
    if (twoStep && step === 1) {
      setStep(2);
      return;
    }
    onConfirm();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`w-full max-w-lg overflow-hidden rounded-2xl border border-[#2E5A43]/12 bg-white shadow-2xl shadow-black/15 border-t-4 ${accentBorder}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-gray-100 bg-[#F5F5F0]/80 px-6 py-5">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-[#2E5A43]/10">
              <Icon className="h-5 w-5 text-[#1F4E3D]" strokeWidth={2} />
            </span>
            <div className="min-w-0 flex-1">
              {twoStep ? (
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  Шаг {step} из 2
                </p>
              ) : null}
              <h3 className="text-xl font-bold leading-snug text-gray-900">{title}</h3>
            </div>
          </div>
        </div>

        <div className="px-6 py-5">
          <p className="text-[15px] leading-relaxed text-gray-600">{body}</p>

          {(cardLabel || periodEndLabel) && step === 1 ? (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              {cardLabel ? (
                <div className="flex flex-1 items-center gap-2.5 rounded-xl border border-[#2E5A43]/15 bg-[#2E5A43]/[0.06] px-4 py-3">
                  <CreditCard className="h-5 w-5 shrink-0 text-[#2E5A43]" />
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                      Карта
                    </p>
                    <p className="text-sm font-semibold text-gray-900">{cardLabel}</p>
                  </div>
                </div>
              ) : null}
              {periodEndLabel ? (
                <div className="flex flex-1 items-center gap-2.5 rounded-xl border border-[#84CC16]/30 bg-[#84CC16]/10 px-4 py-3">
                  <Calendar className="h-5 w-5 shrink-0 text-[#1F4E3D]" />
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                      Доступ до
                    </p>
                    <p className="text-sm font-semibold text-gray-900">{periodEndLabel}</p>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <p className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex gap-3 border-t border-gray-100 bg-gray-50/80 px-6 py-4">
          <button
            type="button"
            onClick={() => {
              if (busy) return;
              if (twoStep && step === 2) {
                setStep(1);
                return;
              }
              onClose();
            }}
            disabled={busy}
            className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-60"
          >
            {twoStep && step === 2 ? "Назад" : "Отмена"}
          </button>
          <button
            type="button"
            onClick={handlePrimary}
            disabled={busy || (kind === "enable" && !cardLabel)}
            className={`flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-md transition disabled:opacity-60 ${primaryClass}`}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function ProfileAutoReplyBillingPanel({
  subscription,
  onUpdated,
}: {
  subscription: SubscriptionState;
  onUpdated: () => void | Promise<void>;
}) {
  const balance = Math.max(0, subscription.autoReplyBalance ?? 0);
  const paidRemaining = Math.max(0, subscription.autoReplyPaidRemaining ?? 0);
  const autoRenew = Boolean(subscription.autoReplyAutoRenew);
  const hasSavedCard = Boolean(subscription.autoReplyHasSavedCard);
  const monthlyPrice = subscription.autoReplyMonthlyPriceRub ?? 0;
  const tariffIndex = subscription.autoReplyTariffIndex ?? 0;

  const cardLabel = savedCardLabelFromFields(
    subscription.autoReplyCardLast4,
    subscription.autoReplyCardBrand
  );
  const packLine = formatAutoReplyPackLine(tariffIndex);
  const periodEndLabel = formatBillingDateLong(subscription.autoReplyPeriodEnd);
  const nextChargeLabel = formatBillingDateLong(subscription.autoReplyNextRenewAt);

  const showPanel =
    balance > 0 ||
    subscription.autoReplyPackExpired ||
    hasSavedCard ||
    Boolean(subscription.autoReplyPeriodStart);

  const [confirmKind, setConfirmKind] = useState<ConfirmKind>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  if (!showPanel) return null;

  const openConfirm = (kind: ConfirmKind) => {
    if (kind === "disable" && !autoRenew) return;
    if (kind === "enable" && !hasSavedCard) return;
    if (kind === "removeCard" && !hasSavedCard) return;
    setConfirmKind(kind);
    setDialogError(null);
  };

  const applyAction = async () => {
    if (!confirmKind) return;
    setBusy(true);
    setDialogError(null);
    try {
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setDialogError("Войдите в аккаунт");
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
        setDialogError(typeof data.error === "string" ? data.error : "Не удалось выполнить действие");
        return;
      }
      setMessage(typeof data.message === "string" ? data.message : null);
      setConfirmKind(null);
      await onUpdated();
    } catch {
      setDialogError("Ошибка сети");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="mt-3 rounded-xl border border-[#2E5A43]/15 bg-white/70 px-4 py-4 shadow-sm ring-1 ring-[#2E5A43]/5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-base font-bold text-gray-900">
                Автопродление · <span className="text-[#2E5A43]">Отзывы</span>
              </h4>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  autoRenew
                    ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200/80"
                    : "bg-gray-100 text-gray-600 ring-1 ring-gray-200/80"
                }`}
              >
                {autoRenew ? "Включено" : "Выключено"}
              </span>
            </div>

            <p className="text-sm text-gray-600">{packLine}</p>

            <div className="flex flex-wrap gap-2">
              {autoRenew && monthlyPrice > 0 ? (
                <span className="rounded-lg bg-[#F5F5F0] px-3 py-1.5 text-xs font-medium text-gray-700">
                  {monthlyPrice.toLocaleString("ru-RU")} ₽ / 30 дней
                </span>
              ) : null}
              {autoRenew && nextChargeLabel ? (
                <span className="rounded-lg bg-[#F5F5F0] px-3 py-1.5 text-xs font-medium text-gray-700">
                  Списание {nextChargeLabel}
                </span>
              ) : null}
              {periodEndLabel ? (
                <span className="rounded-lg bg-[#F5F5F0] px-3 py-1.5 text-xs font-medium text-gray-700">
                  Период до {periodEndLabel}
                  {paidRemaining > 0 ? ` · ${paidRemaining} ответов` : ""}
                </span>
              ) : null}
            </div>

            {hasSavedCard && cardLabel ? (
              <div className="inline-flex items-center gap-2.5 rounded-xl border border-[#2E5A43]/12 bg-gradient-to-r from-[#2E5A43]/[0.07] to-transparent px-4 py-2.5">
                <CreditCard className="h-5 w-5 text-[#2E5A43]" />
                <div>
                  <p className="text-[11px] font-medium text-gray-500">Сохранённая карта</p>
                  <p className="text-sm font-semibold text-gray-900">{cardLabel}</p>
                </div>
              </div>
            ) : hasSavedCard ? (
              <p className="text-sm text-gray-500">Карта привязана к аккаунту</p>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-col gap-2.5 sm:min-w-[168px]">
            {autoRenew ? (
              <button
                type="button"
                onClick={() => openConfirm("disable")}
                disabled={busy}
                className="rounded-xl border border-amber-300/80 bg-amber-50 px-5 py-2.5 text-sm font-semibold text-amber-950 shadow-sm transition hover:bg-amber-100 disabled:opacity-50"
              >
                Отключить автопродление
              </button>
            ) : hasSavedCard ? (
              <button
                type="button"
                onClick={() => openConfirm("enable")}
                disabled={busy}
                className="rounded-xl bg-[#1F4E3D] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#1F4E3D]/20 transition hover:bg-[#163d30] disabled:opacity-50"
              >
                Включить автопродление
              </button>
            ) : (
              <Link
                href="/#pricing"
                className="rounded-xl border border-[#2E5A43]/25 bg-[#2E5A43]/[0.07] px-5 py-2.5 text-center text-sm font-semibold text-[#1F4E3D] transition hover:bg-[#2E5A43]/10"
              >
                Оформить с картой
              </Link>
            )}
            {hasSavedCard ? (
              <button
                type="button"
                onClick={() => openConfirm("removeCard")}
                disabled={busy}
                className="rounded-xl border border-red-200 bg-white px-5 py-2.5 text-sm font-semibold text-red-800 shadow-sm transition hover:bg-red-50 disabled:opacity-50"
              >
                Удалить карту
              </button>
            ) : null}
          </div>
        </div>

        <p className="mt-4 border-t border-[#2E5A43]/10 pt-3 text-xs text-gray-500">
          Управление картой и автопродлением — в любой момент.{" "}
          <Link href="/payments-policy" className="font-semibold text-[#2E5A43] underline underline-offset-2">
            Политика платежей
          </Link>
        </p>

        {message ? (
          <p className="mt-3 rounded-lg border border-emerald-200/80 bg-emerald-50/90 px-3 py-2 text-sm font-medium text-emerald-900">
            {message}
          </p>
        ) : null}
      </div>

      <BillingConfirmDialog
        open={confirmKind !== null}
        kind={confirmKind}
        cardLabel={cardLabel}
        periodEndLabel={periodEndLabel}
        busy={busy}
        error={dialogError}
        onClose={() => {
          if (!busy) setConfirmKind(null);
        }}
        onConfirm={() => void applyAction()}
      />
    </>
  );
}
