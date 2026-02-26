"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { COOKIE_CONSENT_EVENT, getCookieConsent } from "@/lib/cookie-consent";

type YmFn = (...args: unknown[]) => void;

declare global {
  interface Window {
    ym?: YmFn;
  }
}

const DEFAULT_COUNTER_ID = 107013951;

export function YandexMetrika() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isFirstRouteEvent = useRef(true);
  const lastUrlRef = useRef<string>("");
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);
  const [ready, setReady] = useState(false);

  const counterId = Number(process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID || DEFAULT_COUNTER_ID);
  const query = searchParams?.toString();
  const currentPath = `${pathname}${query ? `?${query}` : ""}`;

  useEffect(() => {
    const syncConsent = () => {
      const consent = getCookieConsent();
      setAnalyticsEnabled(Boolean(consent?.analytics));
      setReady(true);
    };

    syncConsent();
    window.addEventListener(COOKIE_CONSENT_EVENT, syncConsent as EventListener);
    window.addEventListener("storage", syncConsent);
    return () => {
      window.removeEventListener(COOKIE_CONSENT_EVENT, syncConsent as EventListener);
      window.removeEventListener("storage", syncConsent);
    };
  }, []);

  useEffect(() => {
    if (!analyticsEnabled) return;
    if (typeof window === "undefined" || typeof window.ym !== "function") return;

    const currentUrl = `${window.location.origin}${currentPath}`;
    const referer = lastUrlRef.current || document.referrer;

    // ym(init) already sends first pageview; for SPA we send hits on subsequent route changes.
    if (isFirstRouteEvent.current) {
      isFirstRouteEvent.current = false;
      lastUrlRef.current = currentUrl;
      return;
    }

    window.ym(counterId, "hit", currentPath, {
      title: document.title,
      referer,
    });
    lastUrlRef.current = currentUrl;
  }, [analyticsEnabled, counterId, currentPath]);

  if (!ready || !analyticsEnabled) return null;

  return (
    <>
      <Script id="yandex-metrika" strategy="afterInteractive">
        {`
          (function(m,e,t,r,i,k,a){
              m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
              m[i].l=1*new Date();
              for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
              k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
          })(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=${counterId}', 'ym');

          ym(${counterId}, 'init', {
            ssr: true,
            webvisor: true,
            clickmap: true,
            trackLinks: true,
            accurateTrackBounce: true
          });
        `}
      </Script>
      <noscript>
        <div>
          <img
            src={`https://mc.yandex.ru/watch/${counterId}`}
            style={{ position: "absolute", left: "-9999px" }}
            alt=""
          />
        </div>
      </noscript>
    </>
  );
}

