"use client";

import { useEffect } from "react";

/** Любой сбой страницы: без красного экрана и кода, страница сама пробует открыться заново. */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app] сбой страницы:", error);
    const timer = setTimeout(reset, 2000);
    return () => clearTimeout(timer);
  }, [error, reset]);
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center" role="status">
      <p className="text-[22px] font-semibold">Обновляем страницу</p>
      <p className="max-w-[44ch] text-[15px] leading-[1.55] text-neutral-600">Это займёт несколько секунд.</p>
      <button type="button" onClick={reset} className="rounded-full border px-5 py-2 text-[14px] font-semibold">
        Обновить
      </button>
    </div>
  );
}
