"use client";

/** Компактная метка «Демо» у этапов Потока — без длинных баннеров. */
export function DemoFlowBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border border-[#2E5A43]/25 bg-[#2E5A43]/08 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#2E5A43] ${className}`}
      title="Демо-поток: 2 стиля описания и 5 фото в 2K"
    >
      Демо
    </span>
  );
}
