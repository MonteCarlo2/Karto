"use client";

import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { hub, HubButton, hubSans } from "./hub-ui";

/**
 * Единое подтверждение записи в кабинет WB: что именно произойдёт, можно ли вернуть, две крупные кнопки.
 * Показывается внутри плитки на месте кнопки действия; появляется мягко, без скачка.
 */
/** Описание действия начинается с глагола в нижнем регистре: в подтверждении ставим заглавную. */
export const sentence = (text: string) => (text ? `${text[0]!.toUpperCase()}${text.slice(1)}` : text);

export function ConfirmPanel({
  title = "Подтвердите действие",
  children,
  note,
  confirmLabel = "Подтвердить",
  busy,
  onConfirm,
  onCancel,
}: {
  title?: string;
  /** Что произойдёт, простыми словами. */
  children: ReactNode;
  /** Вторая строка: вернуть нельзя, деньги не спишутся и т. п. */
  note?: ReactNode;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div role="group" aria-label={title} className="hub-pop mt-4 rounded-[20px] p-4 sm:p-5" style={{ backgroundColor: "rgba(185, 255, 75, 0.2)", boxShadow: "inset 0 0 0 1.5px rgba(122, 190, 40, 0.55)" }}>
      <p className="flex items-center gap-2.5 text-[16px] font-semibold" style={{ ...hubSans, color: hub.text }}>
        <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ backgroundColor: "#B9FF4B" }} aria-hidden>
          <ShieldCheck className="h-[18px] w-[18px]" style={{ color: hub.text }} />
        </span>
        {title}
      </p>
      <div className="mt-3 text-[16px] leading-[1.55]" style={{ ...hubSans, color: hub.text }}>
        {children}
      </div>
      {note ? (
        <p className="mt-2 text-[14.5px] leading-[1.5]" style={{ ...hubSans, color: hub.textMuted }}>
          {note}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2.5">
        <HubButton loading={busy} onClick={onConfirm}>
          {confirmLabel}
        </HubButton>
        <HubButton variant="ghost" disabled={busy} onClick={onCancel}>
          Отмена
        </HubButton>
      </div>
    </div>
  );
}
