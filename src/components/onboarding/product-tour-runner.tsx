"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { driver, type DriveStep, type Config } from "driver.js";
import "driver.js/dist/driver.css";

import { createBrowserClient } from "@/lib/supabase/client";
import {
  KARTO_TOUR_CLOSE_STUDIO_EVENT,
  KARTO_TOUR_OPEN_STUDIO_EVENT,
  PRODUCT_TOUR_COMPLETED_STORAGE_KEY,
  PRODUCT_TOUR_PENDING_COOKIE,
  PRODUCT_TOUR_PENDING_STORAGE_KEY,
} from "@/lib/onboarding/product-tour-constants";

function openStudioMenu(): void {
  window.dispatchEvent(new CustomEvent(KARTO_TOUR_OPEN_STUDIO_EVENT));
}

function closeStudioMenu(): void {
  window.dispatchEvent(new CustomEvent(KARTO_TOUR_CLOSE_STUDIO_EVENT));
}

function waitForElement(selector: string, timeoutMs = 4000): Promise<Element | null> {
  return new Promise((resolve) => {
    const existing = document.querySelector(selector);
    if (existing) {
      resolve(existing);
      return;
    }
    const started = Date.now();
    const timer = window.setInterval(() => {
      const el = document.querySelector(selector);
      if (el) {
        window.clearInterval(timer);
        resolve(el);
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        window.clearInterval(timer);
        resolve(null);
      }
    }, 80);
  });
}

function consumePendingTourFlag(): boolean {
  if (typeof window === "undefined") return false;
  if (sessionStorage.getItem(PRODUCT_TOUR_COMPLETED_STORAGE_KEY) === "1") {
    return false;
  }

  let pending = sessionStorage.getItem(PRODUCT_TOUR_PENDING_STORAGE_KEY) === "1";
  if (!pending) {
    const match = document.cookie.match(
      new RegExp(`(?:^|; )${PRODUCT_TOUR_PENDING_COOKIE}=1`)
    );
    if (match) {
      pending = true;
      document.cookie = `${PRODUCT_TOUR_PENDING_COOKIE}=; Max-Age=0; path=/`;
      sessionStorage.setItem(PRODUCT_TOUR_PENDING_STORAGE_KEY, "1");
    }
  }

  return pending;
}

function markTourCompleted(): void {
  sessionStorage.setItem(PRODUCT_TOUR_COMPLETED_STORAGE_KEY, "1");
  sessionStorage.removeItem(PRODUCT_TOUR_PENDING_STORAGE_KEY);
}

function buildTourSteps(isDesktop: boolean): DriveStep[] {
  const studioSel = isDesktop
    ? "[data-tour='nav-studio-desktop']"
    : "[data-tour='nav-studio-mobile']";
  const pricingSel = isDesktop
    ? "[data-tour='nav-pricing-desktop']"
    : "[data-tour='nav-pricing-mobile']";
  const instance = isDesktop ? "desktop" : "mobile";
  const flowSel = `[data-tour='nav-flow'][data-tour-instance='${instance}']`;
  const creativeSel = `[data-tour='nav-creative'][data-tour-instance='${instance}']`;
  const autoSel = `[data-tour='nav-auto-replies'][data-tour-instance='${instance}']`;
  const freeSel = `[data-tour='nav-free-tools'][data-tour-instance='${instance}']`;

  return [
    {
      popover: {
        title: "Добро пожаловать в KARTO",
        description:
          "Краткий тур: где запустить карточку под маркетплейс, креатив, автоответы и бесплатные инструменты. Займёт около минуты.",
        side: "top",
        align: "center",
      },
    },
    {
      element: studioSel,
      popover: {
        title: "Мастерская",
        description:
          "Все инструменты для продавца — здесь. На следующем шаге откроем меню и пройдёмся по основным режимам.",
        side: "bottom",
        align: "start",
        onNextClick: (_el, _step, { driver: d }) => {
          openStudioMenu();
          window.setTimeout(() => d.moveNext(), 320);
        },
      },
    },
    {
      element: flowSel,
      popover: {
        title: "Поток",
        description:
          "Полная карточка под WB, Ozon или Яндекс Маркет: фото, описание, цена — один проход. После регистрации доступен демо-поток.",
        side: "bottom",
        align: "start",
        onPrevClick: (_el, _step, { driver: d }) => {
          closeStudioMenu();
          window.setTimeout(() => d.movePrevious(), 200);
        },
      },
    },
    {
      element: creativeSel,
      popover: {
        title: "Креатив",
        description:
          "Любые изображения и видео: фоны, инфографика, эксперименты. Оплата пакетами кредитов — когда нужно, без подписки.",
        side: "bottom",
        align: "start",
      },
    },
    {
      element: autoSel,
      popover: {
        title: "Автоответы",
        description:
          "Ответы на отзывы с ИИ. Новым аккаунтам — пробные ответы; дальше удобнее ежемесячный пакет, пока идут продажи.",
        side: "bottom",
        align: "start",
      },
    },
    {
      element: freeSel,
      popover: {
        title: "Бесплатные инструменты",
        description:
          "Юнит-экономика и SEO-описания — без оплаты, можно пользоваться сразу после регистрации.",
        side: "bottom",
        align: "start",
        onNextClick: (_el, _step, { driver: d }) => {
          closeStudioMenu();
          window.setTimeout(() => d.moveNext(), 200);
        },
      },
    },
    {
      element: pricingSel,
      popover: {
        title: "Цены",
        description:
          "Поток и креатив — разовые пакеты под задачу. Отзывы — помесячно. Стартовые бонусы начисляются после регистрации.",
        side: "bottom",
        align: "center",
      },
    },
    {
      popover: {
        title: "Начните с демо-потока",
        description:
          "Лучший первый шаг — увидеть готовую карточку за несколько минут. Нажмите «К демо», и мы откроем мастер.",
        side: "top",
        align: "center",
        doneBtnText: "К демо-потоку",
        onNextClick: () => {
          markTourCompleted();
          closeStudioMenu();
          window.location.href = "/studio?intro=true";
        },
      },
    },
  ];
}

const DRIVER_CONFIG: Config = {
  animate: true,
  smoothScroll: true,
  allowClose: true,
  overlayOpacity: 0.62,
  stagePadding: 10,
  stageRadius: 12,
  popoverClass: "karto-product-tour-popover",
  progressText: "{{current}} из {{total}}",
  nextBtnText: "Далее",
  prevBtnText: "Назад",
  doneBtnText: "Готово",
  onDestroyed: () => {
    closeStudioMenu();
    markTourCompleted();
  },
};

/** Product tour после регистрации. Подсветка — по data-tour якорям (адаптивно на всех экранах). */
export function ProductTourRunner() {
  const pathname = usePathname();
  const startedRef = useRef(false);
  const driverRef = useRef<ReturnType<typeof driver> | null>(null);

  useEffect(() => {
    if (startedRef.current) return;
    if (pathname === "/login" || pathname.startsWith("/auth")) return;

    let cancelled = false;

    void (async () => {
      if (!consumePendingTourFlag()) return;

      try {
        const supabase = createBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.user || cancelled) return;
      } catch {
        return;
      }

      if (cancelled || startedRef.current) return;
      startedRef.current = true;

      await waitForElement(
        window.matchMedia("(min-width: 768px)").matches
          ? "[data-tour='nav-studio-desktop']"
          : "[data-tour='nav-studio-mobile']",
        8000
      );
      if (cancelled) return;

      const isDesktop = window.matchMedia("(min-width: 768px)").matches;
      const steps = buildTourSteps(isDesktop);
      const driverObj = driver({
        ...DRIVER_CONFIG,
        steps,
        onCloseClick: (_el, _step, { driver: d }) => {
          markTourCompleted();
          closeStudioMenu();
          d.destroy();
        },
      });

      driverRef.current = driverObj;

      window.setTimeout(() => {
        if (!cancelled) driverObj.drive();
      }, 600);
    })();

    return () => {
      cancelled = true;
      driverRef.current?.destroy();
      driverRef.current = null;
    };
  }, [pathname]);

  return null;
}
