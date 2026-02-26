"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getCookieConsent, saveCookieConsent } from "@/lib/cookie-consent";

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = getCookieConsent();
    if (!consent) {
      setVisible(true);
      return;
    }
    setVisible(false);
  }, []);

  const acceptCookies = () => {
    saveCookieConsent(true);
    setVisible(false);
  };

  const declineCookies = () => {
    saveCookieConsent(false);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-4 z-[70] flex justify-center px-4">
      <div className="w-full max-w-[680px] rounded-2xl border border-[#1F4E3D]/20 bg-white/85 p-4 text-[#16382c] shadow-[0_16px_40px_rgba(31,78,61,0.18)] backdrop-blur-xl md:p-5">
        <p className="text-sm font-semibold tracking-wide text-[#1F4E3D]">Немного о cookies</p>
        <p className="mt-2 text-sm leading-5 text-[#2b4a3d]">
          Мы используем файлы cookie и Яндекс.Метрику для аналитики и улучшения сервиса — это помогает
          делать KARTO удобнее. Если вам не подходят аналитические cookies, вы можете их отклонить.
          Подробнее в{" "}
          <Link href="/privacy" className="underline decoration-[#2b4a3d]/50 underline-offset-2">
            Политике конфиденциальности
          </Link>
          .
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={declineCookies}
            className="rounded-lg border border-[#1F4E3D]/30 bg-white/70 px-4 py-2 text-sm font-medium text-[#1F4E3D] hover:bg-white"
          >
            Отклонить
          </button>
          <button
            type="button"
            onClick={acceptCookies}
            className="rounded-lg bg-[#1F4E3D] px-4 py-2 text-sm font-medium text-white hover:bg-[#16382c]"
          >
            Принять
          </button>
        </div>
      </div>
    </div>
  );
}

