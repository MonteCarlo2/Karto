"use client";

import * as React from "react";
import { Sparkles, ChevronRight } from "lucide-react";

/** Плашка «Новое» над аватаром — без белой рамки, заметный градиент и тень. */
export function ProfileAvatarNewTag({
  show,
  children,
}: {
  show: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="relative inline-flex shrink-0 flex-col items-center">
      {children}
      {show ? (
        <span
          className="pointer-events-none absolute -top-2.5 left-1/2 z-[2] -translate-x-1/2 select-none whitespace-nowrap rounded-full bg-gradient-to-b from-amber-400 via-orange-500 to-orange-600 px-2.5 py-0.5 text-[9px] font-bold uppercase leading-none tracking-[0.18em] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)] shadow-[0_3px_16px_rgba(234,88,12,0.6)]"
          aria-hidden
        >
          Новое
        </span>
      ) : null}
    </div>
  );
}

/** Компактный индикатор: слово чуть светлее фона, чип меньше прежнего. */
export function ProfileMenuUpdateCue() {
  return (
    <span className="mt-0.5 inline-flex w-fit max-w-full items-center gap-0.5 rounded-full bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 px-2 py-0.5 text-[11px] font-bold leading-none shadow-[0_1px_8px_rgba(234,88,12,0.4),inset_0_1px_0_rgba(255,255,255,0.2)] ring-1 ring-orange-200/45">
      <Sparkles className="h-3 w-3 shrink-0 text-amber-100" strokeWidth={2.25} aria-hidden />
      <span className="pr-0.5 font-semibold tracking-tight text-[#fff5eb]">Обновление</span>
      <ChevronRight className="h-3 w-3 shrink-0 text-white/90" strokeWidth={2.5} aria-hidden />
    </span>
  );
}
