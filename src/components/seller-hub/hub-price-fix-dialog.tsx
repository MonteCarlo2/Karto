"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, CircleCheck, RotateCcw, ShieldCheck, TriangleAlert, X } from "lucide-react";
import type { PriceFix } from "@/lib/seller-hub/task-engine/fix";
import { ArticleChip, HubButton, HubPhoto, RubleGlyph, formatRub, hub, hubNumeric, hubSans, hubSerif } from "./hub-ui";

export type PriceFixPrevious = { baseRub: number; discount: number; currentRub: number };
type Result = { ok: boolean; message: string };

/**
 * Окно подтверждения «Исправить цену»: что было, что станет, и что это можно вернуть.
 * Запись в WB идёт только по кнопке «Выполнить». После записи сразу доступна «Вернуть как было».
 */
export function HubPriceFixDialog({
  title,
  vendorCode,
  photoUrl,
  fix,
  previous,
  onApply,
  onUndo,
  onCheckPrice,
  onClose,
}: {
  title: string;
  vendorCode?: string | null;
  photoUrl?: string | null;
  fix: PriceFix;
  previous: PriceFixPrevious;
  onApply: () => Promise<Result>;
  onUndo: () => Promise<Result>;
  /** Перейти к цене этого товара и поправить вручную. */
  onCheckPrice?: () => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<"ask" | "done" | "undone">("ask");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    boxRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function run(action: () => Promise<Result>, next: "done" | "undone") {
    setBusy(true);
    setError(null);
    try {
      const res = await action();
      if (res.ok) {
        setNote(res.message);
        setPhase(next);
      } else {
        setError(res.message || "Не удалось отправить цену. Ничего не изменилось.");
      }
    } catch {
      setError("Не удалось отправить цену. Проверьте соединение: в WB ничего не менялось.");
    } finally {
      setBusy(false);
    }
  }

  const reverted = phase === "undone";
  const leftLabel = phase === "ask" ? "Сейчас" : "Было";
  const rightLabel = phase === "done" ? "Стало" : reverted ? "Вернули" : "Станет";
  const rightPrice = reverted ? previous.currentRub : fix.targetRub;
  const rightBase = reverted ? previous.baseRub : fix.baseRub;
  const pill = "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold";

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Закрыть окно"
        className="hub-fade-in absolute inset-0 bg-[rgba(1,20,8,0.5)] backdrop-blur-[2px]"
        onClick={() => (busy ? undefined : onClose())}
      />
      <div
        ref={boxRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="price-fix-title"
        className="hub-pop relative flex max-h-full w-full max-w-[680px] flex-col overflow-y-auto rounded-t-[28px] bg-white shadow-[0_40px_100px_-30px_rgba(1,20,8,0.55)] outline-none sm:rounded-[28px]"
      >
        <button
          type="button"
          aria-label="Закрыть"
          disabled={busy}
          onClick={onClose}
          className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full outline-none transition-colors hover:bg-[var(--hub-surface-muted)] focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_var(--hub-lime-ring)]"
          style={{ color: hub.textMuted }}
        >
          <X className="h-5 w-5" strokeWidth={1.75} />
        </button>

        <div className="flex items-start gap-5 px-8 pb-2 pr-16 pt-8">
          <HubPhoto src={photoUrl ?? undefined} className="h-[104px] w-[80px] shrink-0 rounded-[14px]" iconClassName="h-6 w-6" />
          <div className="min-w-0">
            {phase === "done" ? (
              <p className={pill} style={{ ...hubSans, backgroundColor: hub.limeSoft, color: hub.greenDark }}>
                <CircleCheck className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                Цена изменена в WB
              </p>
            ) : reverted ? (
              <p className={pill} style={{ ...hubSans, backgroundColor: hub.surfaceMuted, color: hub.textMuted }}>
                <RotateCcw className="h-4 w-4" strokeWidth={2} aria-hidden />
                Всё вернули как было
              </p>
            ) : (
              <p className={pill} style={{ ...hubSans, backgroundColor: hub.surfaceMuted, color: hub.textMuted }}>
                <RubleGlyph className="h-3.5 w-3.5" />
                Исправление цены
              </p>
            )}
            <h2
              id="price-fix-title"
              className="mt-2.5 line-clamp-3 text-[26px] font-bold leading-[1.15] tracking-[-0.02em] [overflow-wrap:anywhere]"
              style={{ ...hubSerif, color: hub.text }}
            >
              {title}
            </h2>
            {vendorCode ? (
              <p className="mt-1.5 text-[14px]" style={{ ...hubSans, color: hub.textSubtle }}>
                <ArticleChip value={vendorCode} prefix="Артикул " />
              </p>
            ) : null}
          </div>
        </div>

        <div className="px-8 pt-6">
          <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-3">
            <div className="rounded-[18px] px-5 py-4" style={{ backgroundColor: hub.surfaceMuted }}>
              <p className="text-[13px] font-semibold" style={{ ...hubSans, color: hub.textSubtle }}>{leftLabel}</p>
              <p className="mt-1.5 text-[30px] font-bold leading-none tracking-[-0.03em]" style={{ ...hubNumeric, color: hub.textMuted }}>
                {formatRub(previous.currentRub)}
              </p>
              <p className="mt-2 text-[13px]" style={{ ...hubSans, color: hub.textSubtle }}>цена для покупателя</p>
            </div>
            <div className="flex items-center" aria-hidden>
              <span className="flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: hub.lime, color: hub.onLime }}>
                <ArrowRight className="h-5 w-5" strokeWidth={2.25} />
              </span>
            </div>
            <div className="rounded-[18px] border-2 px-5 py-4" style={{ backgroundColor: hub.limeWash, borderColor: hub.limeEdge }}>
              <p className="text-[13px] font-semibold" style={{ ...hubSans, color: hub.greenDark }}>{rightLabel}</p>
              <p className="mt-1.5 text-[30px] font-bold leading-none tracking-[-0.03em]" style={{ ...hubNumeric, color: hub.text }}>
                {formatRub(rightPrice)}
              </p>
              <p className="mt-2 text-[13px]" style={{ ...hubSans, color: hub.textMuted }}>цена для покупателя</p>
            </div>
          </div>

          <dl className="mt-4 divide-y divide-[var(--hub-border-soft)] rounded-[16px] border px-5" style={{ borderColor: hub.borderCard }}>
            <div className="flex items-baseline justify-between gap-4 py-3">
              <dt className="text-[15px]" style={{ ...hubSans, color: hub.textMuted }}>Базовая цена в WB</dt>
              <dd className="text-[16px] font-semibold" style={{ ...hubNumeric, color: hub.text }}>
                {formatRub(previous.baseRub)} <span style={{ color: hub.textSubtle }}>→</span> {formatRub(rightBase)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 py-3" style={{ borderColor: hub.borderSoft }}>
              <dt className="text-[15px]" style={{ ...hubSans, color: hub.textMuted }}>Ваша скидка</dt>
              <dd className="text-[16px] font-semibold" style={{ ...hubNumeric, color: hub.text }}>
                {fix.discount}% <span className="text-[13px] font-medium" style={{ ...hubSans, color: hub.textSubtle }}>не меняется</span>
              </dd>
            </div>
          </dl>

          {phase === "ask" ? (
            <p className="mt-4 text-pretty text-[15px] leading-6" style={{ ...hubSans, color: hub.textMuted }}>
              <b style={{ color: hub.text }}>{formatRub(fix.targetRub)}</b> — безубыточная цена: на ней вы выходите в ноль. Ниже этой цены каждая продажа приносит убыток.
            </p>
          ) : null}
          {phase === "done" && note ? (
            <p className="mt-4 text-pretty text-[15px] leading-6" style={{ ...hubSans, color: hub.textMuted }}>
              {note}
            </p>
          ) : null}
        </div>

        <div className="px-8 pt-4">
          <p
            className="flex items-start gap-2.5 rounded-[14px] px-4 py-3.5 text-pretty text-[14px] leading-5"
            style={{ ...hubSans, backgroundColor: hub.canvas, color: hub.text, boxShadow: `inset 0 0 0 1px ${hub.borderSoft}` }}
          >
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={1.75} style={{ color: hub.limeRing }} aria-hidden />
            {phase === "done"
              ? `Передумали? Нажмите «Вернуть как было»: поставим прежнюю цену ${formatRub(previous.currentRub)}.`
              : reverted
                ? "Цена снова такая, как была до исправления."
                : "Это можно отменить. Сразу после выполнения здесь появится кнопка «Вернуть как было»."}
          </p>
          {error ? (
            <p className="mt-3 flex items-start gap-2 text-pretty text-[14px] leading-5" role="alert" style={{ ...hubSans, color: hub.danger }}>
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2.5 px-8 pb-8 pt-6 sm:flex-row sm:items-center">
          {phase === "ask" ? (
            <>
              {onCheckPrice ? (
                <HubButton className="w-full sm:w-auto" variant="secondary" disabled={busy} onClick={onCheckPrice}>
                  <RubleGlyph className="h-4 w-4" />
                  Посмотреть цену
                </HubButton>
              ) : null}
              <span className="hidden flex-1 sm:block" />
              <HubButton className="w-full sm:w-auto" variant="ghost" disabled={busy} onClick={onClose}>
                Не выполнять
              </HubButton>
              <HubButton className="w-full sm:w-auto sm:min-w-[170px]" loading={busy} onClick={() => void run(onApply, "done")}>
                Выполнить
              </HubButton>
            </>
          ) : phase === "done" ? (
            <>
              <HubButton className="w-full sm:w-auto" variant="secondary" loading={busy} onClick={() => void run(onUndo, "undone")}>
                <RotateCcw className="h-4 w-4" strokeWidth={1.75} />
                Вернуть как было
              </HubButton>
              <span className="hidden flex-1 sm:block" />
              <HubButton className="w-full sm:w-auto sm:min-w-[170px]" onClick={onClose}>
                Готово
              </HubButton>
            </>
          ) : (
            <>
              <span className="hidden flex-1 sm:block" />
              <HubButton className="w-full sm:w-auto sm:min-w-[170px]" onClick={onClose}>
                Закрыть
              </HubButton>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
