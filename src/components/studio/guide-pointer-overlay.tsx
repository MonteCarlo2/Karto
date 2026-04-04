"use client";

/**
 * Подсказка под кнопкой «инструкция»: плавная стрелка вверх + текст на фоне сетки.
 * Закрытие только через открытие инструкции (обработчик на кнопке в родителе).
 */
export function GuidePointerOverlay({
  /** Необязательная короткая строчка мельче основного текста */
  subtitle,
}: {
  subtitle?: string;
}) {
  return (
    <div
      className="pointer-events-none absolute left-1/2 top-full z-[55] mt-1 w-[6rem] -translate-x-1/2"
      aria-live="polite"
    >
      <div className="relative flex flex-col items-center">
        <div className="-mb-0.5 -mt-4 text-[#1F4E3D]/72" aria-hidden>
          <svg
            width="56"
            height="88"
            viewBox="0 0 56 88"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="overflow-visible"
          >
            {/* Плавная S-линия вверх, один непрерывный контур без «ломаных» сегментов */}
            <path
              d="M 28 88 C 10 82 4 56 20 42 C 36 28 44 32 28 18"
              stroke="currentColor"
              strokeWidth="5.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <path
              d="M 28 2.5 L 16.25 18 L 39.75 18 Z"
              fill="currentColor"
            />
          </svg>
        </div>

        <p
          className="max-w-[5.75rem] text-center text-[11px] font-medium italic leading-tight tracking-wide text-[#2E5A43]/80"
          style={{ textShadow: "0 1px 0 rgba(255,255,255,0.88)" }}
        >
          Лучше прочитать
        </p>
        {subtitle ? (
          <p
            className="mt-0.5 max-w-[6.5rem] text-center text-[9px] font-normal leading-snug text-[#64748B]/88"
            style={{ textShadow: "0 1px 0 rgba(255,255,255,0.82)" }}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
    </div>
  );
}
