"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// TEST MODE — set to false before production release
const ALWAYS_SHOW = true;
const STORAGE_KEY = "karto_video_announcement_seen_v2";

// Delay before banner appears (ms) — lets hero animation finish
const SHOW_DELAY_MS = 3500;

type Phase = "card-static" | "wipe" | "card-video" | "free-video";

export function VideoAnnouncementBanner() {
  const [visible, setVisible] = useState(false);
  const [morphing, setMorphing] = useState(false); // brief hide during shape transition
  const [phase, setPhase] = useState<Phase>("card-static");
  const [wipeX, setWipeX] = useState(100);
  const cardVideoRef = useRef<HTMLVideoElement>(null);
  const freeVideoRef = useRef<HTMLVideoElement>(null);
  const rafRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Show after hero animation delay
  useEffect(() => {
    const t = setTimeout(() => {
      if (ALWAYS_SHOW) { setVisible(true); return; }
      try { if (!localStorage.getItem(STORAGE_KEY)) setVisible(true); } catch {}
    }, SHOW_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  const close = useCallback(() => {
    if (!ALWAYS_SHOW) {
      try { localStorage.setItem(STORAGE_KEY, "1"); } catch {}
    }
    setVisible(false);
    // Tell navbar to show badge
    window.dispatchEvent(new CustomEvent("karto:banner:closed"));
  }, []);

  // Listen for reopen from navbar badge
  useEffect(() => {
    const reopen = () => {
      setPhase("card-static");
      setWipeX(100);
      setVisible(true);
    };
    window.addEventListener("karto:banner:reopen", reopen);
    return () => window.removeEventListener("karto:banner:reopen", reopen);
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
        // Morph animation: briefly fade out, switch shape, fade in
        setMorphing(true);
        setTimeout(() => {
          freeVideoRef.current?.currentTime && (freeVideoRef.current.currentTime = 0);
          freeVideoRef.current?.play().catch(() => {});
          setPhase("free-video");
          setTimeout(() => setMorphing(false), 80);
        }, 350);
      }, 6000);
    }

    return () => {
      clearTimeout(timerRef.current);
      cancelAnimationFrame(rafRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, visible]);

  // Manual navigation
  const goToCard = () => {
    clearTimeout(timerRef.current);
    cancelAnimationFrame(rafRef.current);
    freeVideoRef.current?.pause();
    setMorphing(true);
    setTimeout(() => {
      setWipeX(0);
      setPhase("card-video");
      cardVideoRef.current?.play().catch(() => {});
      setTimeout(() => setMorphing(false), 80);
    }, 300);
  };

  const goToFree = () => {
    clearTimeout(timerRef.current);
    cancelAnimationFrame(rafRef.current);
    setMorphing(true);
    setTimeout(() => {
      if (freeVideoRef.current) {
        freeVideoRef.current.currentTime = 0;
        freeVideoRef.current.play().catch(() => {});
      }
      setPhase("free-video");
      setTimeout(() => setMorphing(false), 80);
    }, 300);
  };

  if (!visible) return null;

  const isFree = phase === "free-video";
  const isCardStatic = phase === "card-static";
  const isAfterWipe = phase === "card-video" && !isFree;

  // Container size — aspect-ratio keeps correct proportions
  // Card: 3:4 constrained by width OR height (whichever is smaller)
  //   max-width = min(560px, 88vw, 52.5vh)  [52.5vh = 70vh * 3/4, ensures height ≤ 70vh]
  // Free: 16:9 constrained by width or height
  //   max-width = min(860px, 92vw)
  const cardMaxW = "min(560px, 88vw, 52.5vh)";
  const freeMaxW = "min(860px, 92vw)";

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center"
      style={{
        background: "rgba(2,5,3,0.76)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        cursor: "default",
        userSelect: "none",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      {/* X close — top right */}
      <button
        onClick={close}
        className="absolute top-5 right-5 z-10 w-10 h-10 rounded-full flex items-center justify-center transition-all"
        style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.45)", outline: "none", border: "none" }}
        aria-label="Закрыть"
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <path d="M1 1l11 11M12 1L1 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      </button>

      {/* ── Headline ABOVE media ─────────────────────────────── */}
      <div
        className="flex flex-col items-center mb-6 px-6 pointer-events-none"
        style={{ transition: "width 1.1s cubic-bezier(0.4,0,0.2,1)", width: isFree ? `min(860px, 92vw)` : `min(560px, 88vw, 52.5vh)` }}
      >
        <p
          className="text-[0.6rem] tracking-[0.32em] uppercase mb-4"
          style={{ color: "rgba(255,255,255,0.28)", fontFamily: "var(--font-geist-sans)" }}
        >
          Скоро в KARTO
        </p>

        {/* Two-color headline — Playfair italic */}
        <h1
          className="text-center leading-[1.04]"
          style={{
            fontFamily: "var(--font-playfair)",
            fontSize: "clamp(2rem, 5vw, 3.4rem)",
            fontWeight: 700,
            fontStyle: "italic",
            letterSpacing: "-0.02em",
          }}
        >
          {isFree ? (
            <>
              <span style={{ color: "#ffffff" }}>Ваше воображение.</span><br />
              <span style={{ color: "#5cce8a" }}>Без границ.</span>
            </>
          ) : (
            <>
              <span style={{ color: "#ffffff" }}>Ваши товары.</span><br />
              <span style={{ color: "#5cce8a" }}>Оживают.</span>
            </>
          )}
        </h1>

        <p
          className="mt-3 text-[0.73rem] text-center"
          style={{ color: "rgba(255,255,255,0.3)", fontFamily: "var(--font-geist-sans)", letterSpacing: "0.04em" }}
        >
          {isFree
            ? "Свободная видеогенерация · скоро в режиме «Свободное творчество»"
            : "Анимация карточек · скоро в режиме «Свободное творчество»"}
        </p>
      </div>

      {/* ── Media container ─────────────────────────────────── */}
      <div
        className="relative overflow-hidden"
        style={{
          width: isFree ? freeMaxW : cardMaxW,
          aspectRatio: isFree ? "16/9" : "3/4",
          transition: "width 1.1s cubic-bezier(0.4,0,0.2,1)",
          borderRadius: 0, // no border-radius — square corners
          boxShadow: "0 0 120px rgba(0,0,0,0.85)",
          opacity: morphing ? 0 : 1,
          transition2: "opacity 0.3s ease",
        } as React.CSSProperties}
      >
        {/* ── Card layers ── */}
        <div
          className="absolute inset-0"
          style={{ opacity: isFree ? 0 : 1, transition: "opacity 0.6s ease" }}
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

          {/* Text overlay on card */}
          <div
            className="absolute inset-x-0 bottom-0 pointer-events-none"
            style={{ background: "linear-gradient(to top,rgba(0,0,0,0.72) 0%,transparent 65%)", padding: "80px 28px 24px" }}
          >
            <p
              className="absolute bottom-6 left-7 right-7 leading-snug"
              style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(1.3rem,3.5vw,2rem)", fontWeight: 700, fontStyle: "italic", color: "#fff", letterSpacing: "-0.01em", opacity: isCardStatic ? 1 : 0, transition: "opacity 0.4s ease" }}
            >
              Готовьтесь.
            </p>
            <p
              className="absolute bottom-6 left-7 right-7 leading-snug"
              style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(1.3rem,3.5vw,2rem)", fontWeight: 700, fontStyle: "italic", color: "#fff", letterSpacing: "-0.01em", opacity: isAfterWipe ? 1 : 0, transition: "opacity 0.5s ease 0.3s" }}
            >
              Ваши карточки.<br />Теперь живые.
            </p>
          </div>
        </div>

        {/* ── Free video (loops) ── */}
        <div
          className="absolute inset-0"
          style={{ opacity: isFree ? 1 : 0, transition: "opacity 0.6s ease 0.4s" }}
        >
          <video
            ref={freeVideoRef}
            src="/Video_Vapor_Removal_HVNV8Pd.mp4"
            className="absolute inset-0 w-full h-full object-cover"
            loop
            muted
            playsInline
          />
          <div
            className="absolute inset-x-0 bottom-0 pointer-events-none"
            style={{ background: "linear-gradient(to top,rgba(0,0,0,0.65) 0%,transparent 60%)", padding: "72px 28px 22px" }}
          >
            <p
              className="leading-snug"
              style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(1.3rem,3.5vw,2rem)", fontWeight: 700, fontStyle: "italic", color: "#fff", letterSpacing: "-0.01em", opacity: isFree ? 1 : 0, transition: "opacity 0.5s ease 0.8s" }}
            >
              Создайте что угодно.
            </p>
          </div>
        </div>
      </div>

      {/* ── Dot switcher ─────────────────────────────────────── */}
      <div className="flex items-center gap-2.5 mt-5">
        {[
          { isFreePhase: false, action: goToCard },
          { isFreePhase: true, action: goToFree },
        ].map(({ isFreePhase, action }) => (
          <button
            key={String(isFreePhase)}
            onClick={action}
            aria-label={isFreePhase ? "Свободная генерация" : "Анимация карточек"}
            className="rounded-full transition-all duration-500 cursor-pointer"
            style={{
              width: isFree === isFreePhase ? 28 : 8,
              height: 8,
              background: isFree === isFreePhase ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.25)",
              border: "none",
              outline: "none",
            }}
          />
        ))}
      </div>
    </div>
  );
}
