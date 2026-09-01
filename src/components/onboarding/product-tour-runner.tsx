"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { driver, type Config, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import type { User } from "@supabase/supabase-js";

import { createBrowserClient } from "@/lib/supabase/client";
import {
  getStepRoute,
  PRODUCT_TOUR_DEMO_CTA,
  PRODUCT_TOUR_STEP_META,
} from "@/lib/onboarding/product-tour-steps";
import {
  getTourStepIndex,
  isTourRunning,
  markProductTourCompleted,
  setTourRunning,
  setTourStepIndex,
  shouldForceProductTour,
  shouldShowProductTour,
  accountHasCompletedTour,
} from "@/lib/onboarding/product-tour-storage";
import {
  applyTourSpot,
  clearTourSpot,
  renderTourPopover,
  setCreativeDualHighlight,
} from "@/lib/onboarding/product-tour-ui";
import {
  KARTO_TOUR_CLOSE_STUDIO_EVENT,
  KARTO_TOUR_OPEN_STUDIO_EVENT,
} from "@/lib/onboarding/product-tour-constants";

const SESSION_WAIT_MS = 15_000;
const SESSION_POLL_MS = 250;
const ANCHOR_WAIT_MS = 16_000;
const TOTAL_STEPS = PRODUCT_TOUR_STEP_META.length;

function isAuthRoute(pathname: string): boolean {
  return pathname === "/login" || pathname.startsWith("/auth");
}

async function waitForAuthenticatedUser(): Promise<User | null> {
  const supabase = createBrowserClient();
  const deadline = Date.now() + SESSION_WAIT_MS;
  while (Date.now() < deadline) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.user) return session.user;
    await new Promise((r) => window.setTimeout(r, SESSION_POLL_MS));
  }
  return null;
}

function isDisplayedTourTarget(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  let node: HTMLElement | null = el;
  while (node && node !== document.body) {
    const cs = window.getComputedStyle(node);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    node = node.parentElement;
  }
  const box = el.getBoundingClientRect();
  const compact = window.innerWidth < 768;
  return box.width >= (compact ? 48 : 80) && box.height >= (compact ? 24 : 40);
}

function queryTourTarget(selector: string): HTMLElement | null {
  const nodes = document.querySelectorAll(selector);
  for (const node of nodes) {
    if (isDisplayedTourTarget(node)) return node;
  }
  return null;
}

async function waitForSelector(selector: string): Promise<Element | null> {
  const immediate = queryTourTarget(selector);
  if (immediate) return immediate;

  return new Promise((resolve) => {
    let settled = false;
    const deadline = Date.now() + ANCHOR_WAIT_MS;
    const finish = (el: Element | null) => {
      if (settled) return;
      settled = true;
      obs.disconnect();
      window.clearInterval(poll);
      resolve(el);
    };
    const obs = new MutationObserver(() => {
      const el = queryTourTarget(selector);
      if (el) finish(el);
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    const poll = window.setInterval(() => {
      const el = queryTourTarget(selector);
      if (el) {
        finish(el);
        return;
      }
      if (Date.now() > deadline) finish(queryTourTarget(selector));
    }, 16);
  });
}

function resolvePopoverSide(
  side: "top" | "right" | "bottom" | "left"
): "top" | "right" | "bottom" | "left" {
  if (window.innerWidth >= 1100) return side;
  if (side === "left" || side === "right") return "bottom";
  return side;
}

function resolvePopoverOffset(offset: number | undefined): number {
  if (window.innerWidth >= 1100) return offset ?? 28;
  return Math.min(offset ?? 28, 14);
}

function clampTourPopoverInViewport(): void {
  const pop = document.querySelector(".driver-popover.karto-spotlight-tour");
  if (!(pop instanceof HTMLElement)) return;
  const pad = 10;
  const skip = document.querySelector(".karto-tour-skip-btn");
  const skipBox = skip instanceof HTMLElement ? skip.getBoundingClientRect() : null;
  const rect = pop.getBoundingClientRect();
  const maxWidth = window.innerWidth - pad * 2;
  if (pop.classList.contains("karto-spotlight-tour--final")) {
    pop.style.width = `${Math.min(540, maxWidth)}px`;
  }
  if (rect.width > maxWidth) {
    pop.style.maxWidth = `${maxWidth}px`;
  }
  const width = Math.min(pop.getBoundingClientRect().width, maxWidth);
  const height = pop.getBoundingClientRect().height;
  let left = rect.left;
  let top = rect.top;
  const maxLeft = window.innerWidth - pad - width;
  const maxTop = window.innerHeight - pad - height;
  if (left > maxLeft) left = Math.max(pad, maxLeft);
  if (left < pad) left = pad;
  if (top > maxTop) top = Math.max(pad, maxTop);
  if (top < pad) top = pad;
  if (skipBox && top < skipBox.bottom + 8 && left + width > skipBox.left - 8) {
    const belowSkip = skipBox.bottom + 8;
    top = Math.min(belowSkip, Math.max(pad, window.innerHeight - pad - height));
  }
  pop.style.left = `${Math.round(left)}px`;
  pop.style.top = `${Math.round(top)}px`;
  pop.style.right = "auto";
  pop.style.bottom = "auto";
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitForPaint(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

async function waitForLayoutSettle(el: HTMLElement): Promise<void> {
  let last = el.getBoundingClientRect();
  let stableFrames = 0;
  const deadline = Date.now() + 640;
  while (Date.now() < deadline) {
    await waitForPaint();
    const next = el.getBoundingClientRect();
    if (
      Math.abs(next.top - last.top) < 0.75 &&
      Math.abs(next.left - last.left) < 0.75 &&
      Math.abs(next.width - last.width) < 0.75 &&
      Math.abs(next.height - last.height) < 0.75
    ) {
      stableFrames += 1;
      if (stableFrames >= 3) return;
    } else {
      stableFrames = 0;
    }
    last = next;
  }
}

function hasLaidOutSize(el: HTMLElement): boolean {
  const box = el.getBoundingClientRect();
  const compact = window.innerWidth < 768;
  return box.width >= (compact ? 64 : 120) && box.height >= (compact ? 40 : 64);
}

async function waitForElementReady(el: HTMLElement): Promise<boolean> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (hasLaidOutSize(el)) break;
    await waitForPaint();
  }

  const imgs = Array.from(el.querySelectorAll("img"));
  if (imgs.length > 0) {
    await Promise.race([
      Promise.all(
        imgs.map((img) => {
          if (img.complete && img.naturalWidth > 0) return Promise.resolve();
          return img.decode().catch(() => undefined);
        })
      ),
      waitMs(1800),
    ]);
  }

  return hasLaidOutSize(el);
}

async function bringTourTargetIntoView(el: HTMLElement): Promise<void> {
  const box = el.getBoundingClientRect();
  const fullyVisible =
    box.top >= 8 && box.bottom <= window.innerHeight - 8 && box.width > 0 && box.height > 0;
  if (!fullyVisible) {
    el.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
  }
  await waitForLayoutSettle(el);
}

async function waitForUsableTarget(
  selector: string,
  gen: number,
  genRef: { current: number }
): Promise<HTMLElement | null> {
  if (genRef.current !== gen) return null;
  const found = await waitForSelector(selector);
  if (genRef.current !== gen) return null;
  if (!(found instanceof HTMLElement)) return null;
  await waitForElementReady(found);
  if (genRef.current !== gen) return null;
  return found;
}

async function waitForQuietStart(isFirstStep: boolean): Promise<void> {
  await waitForPaint();
  if (document.readyState !== "complete") {
    await Promise.race([
      new Promise<void>((resolve) => window.addEventListener("load", () => resolve(), { once: true })),
      waitMs(2500),
    ]);
  }
  if (document.fonts?.ready) {
    await Promise.race([document.fonts.ready.catch(() => undefined), waitMs(1200)]);
  }
  await waitMs(isFirstStep ? 700 : 40);
}

async function waitForPairThenReveal(gen: number, genRef: { current: number }, needsSpot: boolean): Promise<void> {
  const deadline = Date.now() + 1800;
  while (Date.now() < deadline) {
    if (genRef.current !== gen) return;
    const popover = document.querySelector(".driver-popover.karto-spotlight-tour");
    const spot = document.querySelector(".karto-tour-spot");
    if (popover && (!needsSpot || spot)) {
      if (popover instanceof HTMLElement) void popover.offsetHeight;
      await waitForPaint();
      if (genRef.current !== gen) return;
      clampTourPopoverInViewport();
      playTourReveal();
      document.documentElement.classList.add("karto-tour-holding");
      return;
    }
    await waitForPaint();
  }
  if (genRef.current === gen) {
    clampTourPopoverInViewport();
    playTourReveal();
    document.documentElement.classList.add("karto-tour-holding");
  }
}

function armTourReveal(): void {
  document.documentElement.classList.add("karto-tour-pending");
  document.documentElement.classList.remove("karto-tour-revealing");
}

function playTourReveal(): void {
  document.documentElement.classList.remove("karto-tour-pending");
  document.documentElement.classList.add("karto-tour-revealing", "karto-tour-holding");
}

function clearTourReveal(): void {
  document.documentElement.classList.remove(
    "karto-tour-pending",
    "karto-tour-revealing",
    "karto-tour-locked",
    "karto-tour-holding"
  );
}

const DRIVER_CONFIG: Config = {
  animate: false,
  duration: 0,
  smoothScroll: false,
  allowClose: false,
  overlayOpacity: 0,
  overlayColor: "#0b100e",
  stagePadding: 0,
  stageRadius: 0,
  popoverClass: "karto-spotlight-tour",
  popoverOffset: 28,
  showButtons: ["next", "previous"],
  disableButtons: ["close"],
  showProgress: true,
  skipMissingElement: false,
  nextBtnText: " ",
  prevBtnText: " ",
  doneBtnText: " ",
};

function TourSkipButton({ onSkip }: { onSkip: () => void }) {
  return (
    <button
      type="button"
      className="karto-tour-skip-btn"
      style={{ pointerEvents: "auto", zIndex: 10000000010 }}
      onPointerDown={(e) => {
        e.stopPropagation();
      }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onSkip();
      }}
    >
      Пропустить
    </button>
  );
}

function TourVeil() {
  return <div className="karto-tour-veil" aria-hidden />;
}

/**
 * Один шаг — один driver. Так оверлей не ломается на /studio/free
 * (чужие якоря с главной там не существуют).
 */
export function ProductTourRunner() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const driverRef = useRef<Driver | null>(null);
  const indexRef = useRef(0);
  const bootGenRef = useRef(0);
  const sessionReadyRef = useRef(false);
  const [tourVisible, setTourVisible] = useState(false);
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => setPortalReady(true), []);

  useEffect(() => {
    if (!tourVisible) return;
    router.prefetch("/studio/free");
    router.prefetch("/");
  }, [tourVisible, router]);

  const teardownDriver = useCallback(() => {
    clearTourReveal();
    clearTourSpot();
    setCreativeDualHighlight(false);
    window.dispatchEvent(new CustomEvent(KARTO_TOUR_CLOSE_STUDIO_EVENT));
    driverRef.current?.destroy();
    driverRef.current = null;
  }, []);

  const endTour = useCallback(() => {
    markProductTourCompleted();
    teardownDriver();
    setTourVisible(false);
    document.documentElement.classList.remove("karto-tour-active", "karto-tour-locked", "karto-tour-holding");
    const params = new URLSearchParams(searchParams.toString());
    if (params.has("tour")) {
      params.delete("tour");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  }, [pathname, router, searchParams, teardownDriver]);

  const abortTourForNavigation = useCallback(() => {
    markProductTourCompleted();
    clearTourReveal();
    clearTourSpot();
    setCreativeDualHighlight(false);
    driverRef.current?.destroy();
    driverRef.current = null;
    setTourVisible(false);
    document.documentElement.classList.remove("karto-tour-active", "karto-tour-locked", "karto-tour-holding");
  }, []);

  const destroyDriverKeepVeil = useCallback(() => {
    clearTourSpot();
    setCreativeDualHighlight(false);
    window.dispatchEvent(new CustomEvent(KARTO_TOUR_CLOSE_STUDIO_EVENT));
    driverRef.current?.destroy();
    driverRef.current = null;
    document.documentElement.classList.remove("karto-tour-locked");
  }, []);

  const goToStep = useCallback(
    (nextIndex: number) => {
      if (nextIndex < 0 || nextIndex >= TOTAL_STEPS) return;
      destroyDriverKeepVeil();
      document.documentElement.classList.add("karto-tour-active", "karto-tour-holding");
      setTourVisible(true);
      armTourReveal();
      setTourStepIndex(nextIndex);
      indexRef.current = nextIndex;
      const route = getStepRoute(nextIndex);
      if (pathname !== route) {
        router.push(`${route}?tour=resume`);
        return;
      }
      window.dispatchEvent(new CustomEvent("karto-tour-boot", { detail: nextIndex }));
    },
    [destroyDriverKeepVeil, pathname, router]
  );

  const bootStep = useCallback(
    async (stepIndex: number, gen: number) => {
      const meta = PRODUCT_TOUR_STEP_META[stepIndex];
      if (!meta) return;

      const holding = document.documentElement.classList.contains("karto-tour-holding");
      const isCreative = meta.id === "creative";
      const isFinal = stepIndex === TOTAL_STEPS - 1;
      let target: HTMLElement | null = null;

      document.documentElement.classList.remove("karto-tour-locked");

      async function resolveTarget(selector: string): Promise<HTMLElement | null> {
        let el = await waitForUsableTarget(selector, gen, bootGenRef);
        if (bootGenRef.current !== gen) return null;
        if (el) return el;
        await waitMs(200);
        if (bootGenRef.current !== gen) return null;
        return waitForUsableTarget(selector, gen, bootGenRef);
      }

      if (!holding) {
        const quiet = waitForQuietStart(true);
        if (meta.selector && !meta.openStudio) {
          target = await resolveTarget(meta.selector);
        }
        if (bootGenRef.current !== gen) return;
        if (target) await bringTourTargetIntoView(target);
        await quiet;
        if (bootGenRef.current !== gen) return;
        document.documentElement.classList.add("karto-tour-active");
        setTourVisible(true);
        armTourReveal();
        await waitForPaint();
      } else {
        document.documentElement.classList.add("karto-tour-active", "karto-tour-holding");
        setTourVisible(true);
        armTourReveal();
        await waitForQuietStart(false);
        if (bootGenRef.current !== gen) return;
        if (meta.selector && !meta.openStudio) {
          target = await resolveTarget(meta.selector);
        }
      }

      if (bootGenRef.current !== gen) return;

      if (meta.openStudio) {
        window.dispatchEvent(new CustomEvent(KARTO_TOUR_OPEN_STUDIO_EVENT));
        await waitMs(180);
        if (bootGenRef.current !== gen) return;
        if (meta.selector) {
          target = await resolveTarget(meta.selector);
          if (!target) {
            window.dispatchEvent(new CustomEvent(KARTO_TOUR_OPEN_STUDIO_EVENT));
            await waitMs(200);
            if (bootGenRef.current !== gen) return;
            target = await resolveTarget(meta.selector);
          }
          if (bootGenRef.current !== gen || !target) return;
        }
      }

      if (target) {
        await bringTourTargetIntoView(target);
      } else if (meta.selector && !isFinal) {
        return;
      }
      if (bootGenRef.current !== gen) return;
      document.documentElement.classList.add("karto-tour-locked");

      const driverObj = driver({
        ...DRIVER_CONFIG,
        disableButtons: stepIndex === 0 || isFinal ? ["previous", "close"] : ["close"],
        popoverOffset: resolvePopoverOffset(meta.popoverOffset),
        steps: [
          {
            element: meta.selector,
            popover: {
              title: meta.title,
              description: meta.description,
              side: resolvePopoverSide(meta.side),
              align: meta.align,
              disableButtons: stepIndex === 0 || isFinal ? ["previous"] : [],
              onNextClick: () => {
                if (isFinal) {
                  markProductTourCompleted();
                  teardownDriver();
                  window.location.href = PRODUCT_TOUR_DEMO_CTA.href;
                  return;
                }
                goToStep(stepIndex + 1);
              },
              onPrevClick: () => {
                if (stepIndex === 0) return;
                goToStep(stepIndex - 1);
              },
            },
          },
        ],
        onPopoverRender: (popover) => {
          renderTourPopover(popover, {
            activeIndex: stepIndex,
            totalSteps: TOTAL_STEPS,
            finalCtaLabel: PRODUCT_TOUR_DEMO_CTA.buttonLabel,
          });
        },
        onHighlighted: (element) => {
          if (element instanceof HTMLElement && element.id !== "driver-dummy-element") {
            applyTourSpot(element);
          }
          setCreativeDualHighlight(isCreative);
          void waitForPairThenReveal(gen, bootGenRef, !isFinal);
        },
        onDestroyed: () => {
          clearTourSpot();
          setCreativeDualHighlight(false);
          if (driverRef.current === driverObj) driverRef.current = null;
        },
      });

      driverRef.current = driverObj;
      driverObj.drive(0);
      void waitForPairThenReveal(gen, bootGenRef, Boolean(meta.selector) && !isFinal);
    },
    [goToStep, teardownDriver]
  );

  useEffect(() => {
    const onBoot = (e: Event) => {
      const idx = (e as CustomEvent<number>).detail;
      const gen = ++bootGenRef.current;
      void bootStep(idx, gen);
    };
    window.addEventListener("karto-tour-boot", onBoot);
    return () => window.removeEventListener("karto-tour-boot", onBoot);
  }, [bootStep]);

  useEffect(() => {
    if (isAuthRoute(pathname)) return;

    const search = searchParams.toString();
    const forced = shouldForceProductTour(search);
    if (!shouldShowProductTour(search) && !isTourRunning() && !forced) return;

    let startIndex = forced ? 0 : getTourStepIndex();
    if (forced) setTourStepIndex(0);

    const targetRoute = getStepRoute(startIndex);
    if (pathname !== targetRoute) {
      const keepVeil = document.documentElement.classList.contains("karto-tour-active");
      setTourRunning(true);
      if (keepVeil) {
        setTourVisible(true);
        armTourReveal();
      }
      router.replace(`${targetRoute}?tour=resume`);
      return;
    }

    setTourRunning(true);
    indexRef.current = startIndex;

    if (driverRef.current?.isActive() && indexRef.current === startIndex) {
      return;
    }

    const gen = ++bootGenRef.current;

    let cancelled = false;
    void (async () => {
      if (!sessionReadyRef.current) {
        const authed = await waitForAuthenticatedUser();
        if (!authed) return;
        if (!forced && accountHasCompletedTour(authed)) {
          markProductTourCompleted();
          return;
        }
        sessionReadyRef.current = true;
      }
      if (cancelled || bootGenRef.current !== gen) return;
      await bootStep(startIndex, gen);
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname, router, searchParams, bootStep]);

  useEffect(() => {
    if (!tourVisible) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest("[data-tour='studio-menu'] a[href]");
      if (!(link instanceof HTMLAnchorElement)) return;
      abortTourForNavigation();
    };
    const onResize = () => clampTourPopoverInViewport();
    document.addEventListener("click", onClick, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("resize", onResize);
    };
  }, [tourVisible, abortTourForNavigation]);

  if (!portalReady || !tourVisible) return null;

  return createPortal(
    <>
      <TourVeil />
      <TourSkipButton onSkip={endTour} />
    </>,
    document.body
  );
}
