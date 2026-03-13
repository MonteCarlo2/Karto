"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// TEST MODE — set to false before production release
const ALWAYS_SHOW = true;
const STORAGE_KEY = "karto_video_announcement_seen_v2";

type Phase = "card-static" | "wipe" | "card-video" | "free-video";

const CARD_W = 520;
const CARD_H = Math.round(CARD_W * (4 / 3)); // 693
const FREE_W = 880;
const FREE_H = Math.round(FREE_W * (9 / 16)); // 495

export function VideoAnnouncementBanner() {
  const [visible, setVisible] = useState(false);
  const [phase, setPhase] = useState<Phase>("card-static");
  const [wipeX, setWipeX] = useState(100);
  const cardVideoRef = useRef<HTMLVideoElement>(null);
  const freeVideoRef = useRef<HTMLVideoElement>(null);
  const rafRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (ALWAYS_SHOW) { setVisible(true); return; }
    try { if (!localStorage.getItem(STORAGE_KEY)) setVisible(true); } catch {}
  }, []);

  const close = useCallback(() => {
    if (!ALWAYS_SHOW) {
      try { localStorage.setItem(STORAGE_KEY, "1"); } catch {}
    }
    setVisible(false);
  }, []);

  // Phase sequencer
  useEffect(() => {
    if (!visible) return;
    clearTimeout(timerRef.current);
    cancelAnimationFrame(rafRef.current);

    if (phase === "card-static") {
      timerRef.current = setTimeout(() => setPhase("wipe"), 2800);
    } else if (phase === "wipe") {
      const start = performance.now();
      const dur = 1700;
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
    // free-video: no loop, no auto-close — freezes on last frame

    return () => {
      clearTimeout(timerRef.current);
      cancelAnimationFrame(rafRef.current);
    };
  }, [phase, visible, close]);

  // Manual navigation
  const goToCard = () => {
    clearTimeout(timerRef.current);
    cancelAnimationFrame(rafRef.current);
    freeVideoRef.current?.pause();
    setWipeX(0);
    if (cardVideoRef.current) {
      cardVideoRef.current.currentTime = 0;
      cardVideoRef.current.play().catch(() => {});
    }
    setPhase("card-video");
  };

  const goToFree = () => {
    clearTimeout(timerRef.current);
    cancelAnimationFrame(rafRef.current);
    if (freeVideoRef.current) {
      freeVideoRef.current.currentTime = 0;
      freeVideoRef.current.play().catch(() => {});
    }
    setPhase("free-video");
  };

  if (!visible) return null;

  const isFree = phase === "free-video";
  const isCardStatic = phase === "card-static";
  const isAfterWipe = (phase === "card-video") && !isFree;

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center"
      style={{
        background: "rgba(4,6,5,0.88)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        cursor: "default",
        userSelect: "none",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      {/* X — top right of viewport */}
      <button
        onClick={close}
        className="absolute top-5 right-5 z-10 w-10 h-10 rounded-full flex items-center justify-center transition-all"
        style={{
          background: "rgba(255,255,255,0.07)",
          color: "rgba(255,255,255,0.4)",
          outline: "none",
          border: "none",
        }}
        aria-label="Закрыть"
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <path d="M1 1l11 11M12 1L1 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      </button>

      {/* ── HEADLINE above media ─────────────────────────── */}
      <div
        className="flex flex-col items-center mb-6 px-6 pointer-events-none"
        style={{
          width: `min(${isFree ? FREE_W : CARD_W}px, 92vw)`,
          transition: "width 1.1s cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        {/* Eyebrow */}
        <p
          className="text-[0.65rem] tracking-[0.32em] uppercase mb-4"
          style={{ color: "rgba(255,255,255,0.32)", fontFamily: "var(--font-geist-sans)" }}
        >
          Скоро в KARTO
        </p>

        {/* Main headline — Playfair italic */}
        <h1
          className="text-center text-white leading-[1.04]"
          style={{
            fontFamily: "var(--font-playfair)",
            fontSize: "clamp(2.2rem, 5vw, 3.6rem)",
            fontWeight: 700,
            fontStyle: "italic",
            letterSpacing: "-0.02em",
            opacity: 1,
            transition: "opacity 0.5s ease",
          }}
        >
          {isFree ? (
            <>Ваше воображение.<br />Без границ.</>
          ) : (
            <>Ваши товары.<br />Оживают.</>
          )}
        </h1>

        {/* Section hint */}
        <p
          className="mt-3 text-[0.78rem]"
          style={{ color: "rgba(255,255,255,0.35)", fontFamily: "var(--font-geist-sans)", letterSpacing: "0.04em" }}
        >
          {isFree
            ? "Свободная видеогенерация · появится в режиме «Свободное творчество»"
            : "Анимация карточек · появится в режиме «Свободное творчество»"}
        </p>
      </div>

      {/* ── MEDIA card ─────────────────────────────────── */}
      <div
        className="relative overflow-hidden pointer-events-none"
        style={{
          width: `min(${isFree ? FREE_W : CARD_W}px, 92vw)`,
          height: isFree ? `min(${FREE_H}px, 50vh)` : `min(${CARD_H}px, 62vh)`,
          transition: "width 1.1s cubic-bezier(0.4,0,0.2,1), height 1.1s cubic-bezier(0.4,0,0.2,1)",
          borderRadius: 14,
          boxShadow: "0 0 100px rgba(0,0,0,0.9)",
          // No border, no background — pure media
        }}
      >
        {/* ── Card layers ── */}
        <div
          className="absolute inset-0"
          style={{ opacity: isFree ? 0 : 1, transition: "opacity 0.7s ease" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/card-3.png"
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
          <video
            ref={cardVideoRef}
            src="/fed43aba167d0c1b1398a0b84feb5295_1773418511_8b66ag6q.mp4"
            className="absolute inset-0 w-full h-full object-cover"
            style={{ clipPath: wipeX > 0 ? `inset(0 ${wipeX}% 0 0)` : "none" }}
            loop
            muted
            playsInline
          />

          {/* Shimmer at wipe edge */}
          {phase === "wipe" && wipeX > 2 && wipeX < 98 && (
            <div
              className="absolute inset-y-0 w-16 pointer-events-none"
              style={{
                left: `calc(${100 - wipeX}% - 32px)`,
                background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.65),transparent)",
              }}
            />
          )}

          {/* Text on card video */}
          <div
            className="absolute inset-x-0 bottom-0 pointer-events-none"
            style={{
              background: "linear-gradient(to top,rgba(0,0,0,0.72) 0%,transparent 65%)",
              padding: "72px 28px 24px",
            }}
          >
            <p
              className="absolute bottom-6 left-7 right-7 leading-snug"
              style={{
                fontFamily: "var(--font-playfair)",
                fontSize: "clamp(1.3rem,3vw,1.9rem)",
                fontWeight: 700,
                fontStyle: "italic",
                color: "#fff",
                letterSpacing: "-0.01em",
                opacity: isCardStatic ? 1 : 0,
                transition: "opacity 0.4s ease",
              }}
            >
              Готовьтесь.
            </p>
            <p
              className="absolute bottom-6 left-7 right-7 leading-snug"
              style={{
                fontFamily: "var(--font-playfair)",
                fontSize: "clamp(1.3rem,3vw,1.9rem)",
                fontWeight: 700,
                fontStyle: "italic",
                color: "#fff",
                letterSpacing: "-0.01em",
                opacity: isAfterWipe ? 1 : 0,
                transition: "opacity 0.5s ease 0.3s",
              }}
            >
              Ваши карточки.<br />Теперь живые.
            </p>
          </div>
        </div>

        {/* ── Free video (no loop — freezes on last frame) ── */}
        <div
          className="absolute inset-0"
          style={{ opacity: isFree ? 1 : 0, transition: "opacity 0.7s ease 0.4s" }}
        >
          <video
            ref={freeVideoRef}
            src="/Video_Vapor_Removal_HVNV8Pd.mp4"
            className="absolute inset-0 w-full h-full object-cover"
            muted
            playsInline
            // No loop — freezes on last frame
          />
          <div
            className="absolute inset-x-0 bottom-0 pointer-events-none"
            style={{
              background: "linear-gradient(to top,rgba(0,0,0,0.68) 0%,transparent 60%)",
              padding: "72px 28px 24px",
            }}
          >
            <p
              className="leading-snug"
              style={{
                fontFamily: "var(--font-playfair)",
                fontSize: "clamp(1.3rem,3vw,1.9rem)",
                fontWeight: 700,
                fontStyle: "italic",
                color: "#fff",
                letterSpacing: "-0.01em",
                opacity: isFree ? 1 : 0,
                transition: "opacity 0.5s ease 0.8s",
              }}
            >
              Создайте что угодно.
            </p>
          </div>
        </div>
      </div>

      {/* ── Section switcher ─────────────────────────────── */}
      <div className="flex items-center gap-2.5 mt-5">
        {[
          { label: "Анимация карточек", active: !isFree, action: goToCard },
          { label: "Свободная генерация", active: isFree, action: goToFree },
        ].map(({ label, active, action }) => (
          <button
            key={label}
            onClick={action}
            className="rounded-full text-xs font-medium transition-all duration-300"
            style={{
              padding: "7px 16px",
              background: active ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.05)",
              color: active ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.38)",
              border: active
                ? "1px solid rgba(255,255,255,0.22)"
                : "1px solid rgba(255,255,255,0.07)",
              fontFamily: "var(--font-geist-sans)",
              letterSpacing: "0.01em",
              outline: "none",
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
