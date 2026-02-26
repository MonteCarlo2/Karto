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

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[70] p-3 md:p-5">
      <div className="mx-auto max-w-4xl rounded-2xl border border-white/20 bg-black/70 p-4 text-white shadow-2xl backdrop-blur-md md:p-5">
        <p className="text-sm leading-5">
          Мы используем файлы cookie и Яндекс.Метрику для аналитики и улучшения работы сервиса.
          Продолжая пользоваться сайтом, вы соглашаетесь с нашей{" "}
          <Link href="/privacy" className="underline">
            Политикой конфиденциальности
          </Link>
          .
        </p>
        <div className="mt-4">
          <button
            type="button"
            onClick={acceptCookies}
            className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black hover:bg-gray-100"
          >
            Понятно
          </button>
        </div>
      </div>
    </div>
  );
}

