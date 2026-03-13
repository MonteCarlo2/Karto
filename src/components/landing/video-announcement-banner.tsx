"use client";

import { useEffect, useRef, useState } from "react";

// TEST MODE: always shows. Change to localStorage check before release.
const ALWAYS_SHOW = true;
const STORAGE_KEY = "karto_video_announcement_seen_v2";

type Phase = "card-static" | "wipe" | "card-video" | "free-video";

// Card phase: portrait 3:4 — Free phase: landscape 16:9
const CARD_W = 520;
const CARD_H = Math.round(CARD_W * (4 / 3)); // 693
const FREE_W = 860;
const FREE_H = Math.round(FREE_W * (9 / 16)); // 484

export function VideoAnnouncementBanner() {
  const [visible, setVisible] = useState(false);
  const [phase, setPhase] = useState<Phase>("card-static");
  const [wipeX, setWipeX] = useState(100); // 100=hidden, 0=fully revealed
  const cardVideoRef = useRef<HTMLVideoElement>(null);
  const freeVideoRef = useRef<HTMLVideoElement>(null);
  const rafRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (ALWAYS_SHOW) {
      setVisible(true);
      return;
    }
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {}
  }, []);

  useEffect(() => {
    if (!visible) return;
    clearTimeout(timerRef.current);
    cancelAnimationFrame(rafRef.current);

    if (phase === "card-static") {
      timerRef.current = setTimeout(() => setPhase("wipe"), 2800);
    } else if (phase === "wipe") {
      const start = performance.now();
      const dur = 1600;
      const run = (now: number) => {
        const t = Math.min((now - start) / dur, 1);
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        setWipeX(Math.round(100 * (1 - e)));
        if (t < 1) {
          rafRef.current = requestAnimationFrame(run);
        } else {
          setWipeX(0);
          cardVideoRef.current?.play().catch(() => {});
          setPhase("card-video");
        }
      };
      rafRef.current = requestAnimationFrame(run);
      return () => cancelAnimationFrame(rafRef.current);
    } else if (phase === "card-video") {
      timerRef.current = setTimeout(() => {
        freeVideoRef.current?.play().catch(() => {});
        setPhase("free-video");
      }, 6000);
    }
    // free-video: no auto-close, user closes manually

    return () => {
      clearTimeout(timerRef.current);
      cancelAnimationFrame(rafRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, visible]);

  const close = () => {
    if (!ALWAYS_SHOW) {
      try { localStorage.setItem(STORAGE_KEY, "1"); } catch {}
    }
    setVisible(false);
  };

  if (!visible) return null;

  const isFree = phase === "free-video";
  const isCardStatic = phase === "card-static";
  const isAfterWipe = phase === "card-video" || isFree;

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center"
      style={{ background: "rgba(0,0,0,0.82)", backdropFilter: "blur(14px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      {/* ── Big headline ABOVE the card ─────────────────────────── */}
      <div
        className="w-full flex flex-col items-center mb-6 px-6"
        style={{ maxWidth: isFree ? FREE_W : CARD_W }}
      >
        <p
          className="text-xs font-semibold tracking-[0.22em] uppercase mb-3"
          style={{ color: "rgba(255,255,255,0.45)", letterSpacing: "0.22em" }}
        >
          KARTO · ОБНОВЛЕНИЕ
        </p>
        <h1
          className="text-4xl sm:text-5xl font-bold text-white text-center leading-tight"
          style={{ letterSpacing: "-0.03em" }}
        >
          {isFree ? (
            <>Ваше воображение.<br />Без ограничений.</>
          ) : (
            <>Мы готовим<br />кое-что новое.</>
          )}
        </h1>
      </div>

      {/* ── Media card ──────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden"
        style={{
          width: `min(${isFree ? FREE_W : CARD_W}px, 92vw)`,
          height: isFree
            ? `min(${FREE_H}px, 52vh)`
            : `min(${CARD_H}px, 68vh)`,
          transition: "width 1.1s cubic-bezier(0.4,0,0.2,1), height 1.1s cubic-bezier(0.4,0,0.2,1)",
          borderRadius: 20,
          overflow: "hidden",
          // No border, no background — just pure media
          boxShadow: "0 40px 120px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06)",
        }}
      >
        {/* ── Card layers (static image + wipe → animated video) ── */}
        <div
          className="absolute inset-0"
          style={{ opacity: isFree ? 0 : 1, transition: "opacity 0.7s ease" }}
        >
          {/* Static card — base layer */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/card-3.png"
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />

          {/* Animated card video — wipe-revealed from left */}
          <video
            ref={cardVideoRef}
            src="/fed43aba167d0c1b1398a0b84feb5295_1773418511_8b66ag6q.mp4"
            className="absolute inset-0 w-full h-full object-cover"
            style={{ clipPath: wipeX > 0 ? `inset(0 ${wipeX}% 0 0)` : "none" }}
            loop
            muted
            playsInline
          />

          {/* Shimmer streak at wipe edge */}
          {phase === "wipe" && wipeX > 2 && wipeX < 98 && (
            <div
              className="absolute inset-y-0 w-14 pointer-events-none"
              style={{
                left: `calc(${100 - wipeX}% - 28px)`,
                background:
                  "linear-gradient(90deg,transparent 0%,rgba(255,255,255,0.55) 50%,transparent 100%)",
              }}
            />
          )}

          {/* Card phase bottom overlay text */}
          <div
            className="absolute inset-x-0 bottom-0 pointer-events-none"
            style={{
              background:
                "linear-gradient(to top,rgba(0,0,0,0.7) 0%,rgba(0,0,0,0.15) 50%,transparent 100%)",
              padding: "80px 28px 24px",
            }}
          >
            {/* "Готовьтесь." — before wipe */}
            <p
              className="absolute bottom-6 left-7 right-16 text-3xl font-bold text-white leading-tight"
              style={{
                letterSpacing: "-0.025em",
                opacity: isCardStatic ? 1 : 0,
                transition: "opacity 0.45s ease",
              }}
            >
              Готовьтесь.
            </p>
            {/* "Ваши карточки. Теперь живые." — after wipe */}
            <p
              className="absolute bottom-6 left-7 right-16 text-3xl font-bold text-white leading-tight"
              style={{
                letterSpacing: "-0.025em",
                opacity: isAfterWipe && !isFree ? 1 : 0,
                transition: "opacity 0.5s ease 0.3s",
              }}
            >
              Ваши карточки.<br />Теперь живые.
            </p>
          </div>
        </div>

        {/* ── Free generation video ──────────────────────────────── */}
        <div
          className="absolute inset-0"
          style={{ opacity: isFree ? 1 : 0, transition: "opacity 0.7s ease 0.5s" }}
        >
          <video
            ref={freeVideoRef}
            src="/Video_Vapor_Removal_HVNV8Pd.mp4"
            className="absolute inset-0 w-full h-full object-cover"
            loop
            muted
            playsInline
          />
          {/* Free gen overlay text */}
          <div
            className="absolute inset-x-0 bottom-0 pointer-events-none"
            style={{
              background:
                "linear-gradient(to top,rgba(0,0,0,0.68) 0%,transparent 60%)",
              padding: "60px 28px 22px",
            }}
          >
            <p
              className="text-3xl font-bold text-white leading-tight"
              style={{
                letterSpacing: "-0.025em",
                opacity: isFree ? 1 : 0,
                transition: "opacity 0.5s ease 0.7s",
              }}
            >
              Создайте что угодно.
            </p>
          </div>
        </div>
      </div>

      {/* ── Controls below card ─────────────────────────────────── */}
      <div
        className="flex items-center justify-between mt-5 px-1"
        style={{ width: `min(${isFree ? FREE_W : CARD_W}px, 92vw)` }}
      >
        {/* Phase dots */}
        <div className="flex items-center gap-2">
          {[false, true].map((fi) => (
            <div
              key={String(fi)}
              className="rounded-full transition-all duration-700"
              style={{
                width: isFree === fi ? 24 : 8,
                height: 8,
                background:
                  isFree === fi
                    ? "rgba(255,255,255,0.9)"
                    : "rgba(255,255,255,0.3)",
              }}
            />
          ))}
        </div>

        <button
          onClick={close}
          className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all hover:opacity-80 active:scale-95"
          style={{ background: "rgba(255,255,255,0.12)", color: "#fff", border: "1px solid rgba(255,255,255,0.18)" }}
        >
          Закрыть
        </button>
      </div>

      {/* ── Absolute close X (top right of screen) ────────────── */}
      <button
        onClick={close}
        className="absolute top-5 right-5 w-9 h-9 rounded-full flex items-center justify-center transition-all hover:bg-white/10"
        style={{ color: "rgba(255,255,255,0.6)" }}
        aria-label="Закрыть"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  );
}
