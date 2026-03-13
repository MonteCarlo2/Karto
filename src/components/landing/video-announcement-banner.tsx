"use client";

import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "karto_video_announcement_seen_v1";

type Phase = "card-static" | "wipe" | "card-video" | "free-video";

// Card phase: portrait 3:4 — Free phase: landscape 16:9
const CARD_W = 400;
const CARD_H = Math.round(CARD_W * (4 / 3)); // 533
const FREE_W = 680;
const FREE_H = Math.round(FREE_W * (9 / 16)); // 383

export function VideoAnnouncementBanner() {
  const [visible, setVisible] = useState(false);
  const [phase, setPhase] = useState<Phase>("card-static");
  const [wipeX, setWipeX] = useState(100); // 100=hidden, 0=revealed
  const cardVideoRef = useRef<HTMLVideoElement>(null);
  const freeVideoRef = useRef<HTMLVideoElement>(null);
  const rafRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // TEST MODE: always show banner on every page load
  useEffect(() => {
    setVisible(true);
  }, []);

  useEffect(() => {
    if (!visible) return;
    clearTimeout(timerRef.current);
    cancelAnimationFrame(rafRef.current);

    if (phase === "card-static") {
      timerRef.current = setTimeout(() => setPhase("wipe"), 2800);
    } else if (phase === "wipe") {
      const start = performance.now();
      const dur = 1500;
      const run = (now: number) => {
        const t = Math.min((now - start) / dur, 1);
        // ease-in-out cubic
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        const x = Math.round(100 * (1 - e));
        setWipeX(x);
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
      }, 5500);
    } else if (phase === "free-video") {
      timerRef.current = setTimeout(close, 9000);
    }

    return () => {
      clearTimeout(timerRef.current);
      cancelAnimationFrame(rafRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, visible]);

  const close = () => {
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch {}
    setVisible(false);
  };

  if (!visible) return null;

  const isFree = phase === "free-video";

  // Which card headline
  const cardTitle = phase === "card-static" ? "Готовьтесь." : null;
  const cardTitleAfter = phase !== "card-static" && !isFree;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.58)", backdropFilter: "blur(10px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      {/* Banner card — morphs 3:4 portrait → 16:9 landscape */}
      <div
        className="relative overflow-hidden"
        style={{
          width: isFree ? `min(${FREE_W}px, 94vw)` : `min(${CARD_W}px, 88vw)`,
          height: isFree ? `min(${FREE_H}px, 55vh)` : `min(${CARD_H}px, 82vh)`,
          transition: "width 1s cubic-bezier(0.4,0,0.2,1), height 1s cubic-bezier(0.4,0,0.2,1)",
          borderRadius: 28,
          background: "#e2e3e5",
          border: "1px solid rgba(0,0,0,0.1)",
          boxShadow: "0 32px 80px rgba(0,0,0,0.45)",
        }}
      >
        {/* Close button */}
        <button
          onClick={close}
          className="absolute top-4 right-4 z-30 w-8 h-8 rounded-full flex items-center justify-center transition-all hover:bg-white/20"
          style={{ background: "rgba(0,0,0,0.28)", color: "#fff" }}
          aria-label="Закрыть"
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M1 1l9 9M10 1L1 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </button>

        {/* Phase pill indicator */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex gap-1.5 pointer-events-none">
          {[false, true].map((isFreeIndicator) => (
            <div
              key={String(isFreeIndicator)}
              className="h-[3px] rounded-full transition-all duration-700"
              style={{
                width: isFree === isFreeIndicator ? 22 : 8,
                background: isFree === isFreeIndicator ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.35)",
              }}
            />
          ))}
        </div>

        {/* ── Card layers ─────────────────────────────────── */}
        <div
          className="absolute inset-0"
          style={{ opacity: isFree ? 0 : 1, transition: "opacity 0.65s ease" }}
        >
          {/* Static card image (base layer) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/card-3.png"
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />

          {/* Animated card video — wipe reveal from left */}
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
              className="absolute inset-y-0 w-12 pointer-events-none"
              style={{
                left: `calc(${100 - wipeX}% - 24px)`,
                background:
                  "linear-gradient(90deg,transparent 0%,rgba(255,255,255,0.5) 50%,transparent 100%)",
              }}
            />
          )}
        </div>

        {/* ── Free generation video ────────────────────────── */}
        <div
          className="absolute inset-0"
          style={{ opacity: isFree ? 1 : 0, transition: "opacity 0.65s ease 0.4s" }}
        >
          <video
            ref={freeVideoRef}
            src="/Video_Vapor_Removal_HVNV8Pd.mp4"
            className="absolute inset-0 w-full h-full object-cover"
            loop
            muted
            playsInline
          />
        </div>

        {/* ── Bottom gradient + headline ────────────────────── */}
        <div
          className="absolute inset-x-0 bottom-0 pointer-events-none z-10"
          style={{
            background:
              "linear-gradient(to top,rgba(0,0,0,0.72) 0%,rgba(0,0,0,0.18) 55%,transparent 100%)",
            padding: "72px 22px 20px",
          }}
        >
          {/* "Готовьтесь." — teaser before wipe */}
          <h2
            className="absolute bottom-5 left-5 right-14 text-[1.65rem] font-bold text-white leading-tight"
            style={{
              letterSpacing: "-0.02em",
              opacity: cardTitle ? 1 : 0,
              transition: "opacity 0.4s ease",
            }}
          >
            {cardTitle ?? ""}
          </h2>

          {/* "Ваши карточки. Теперь живые." — during + after wipe */}
          <h2
            className="absolute bottom-5 left-5 right-14 text-[1.65rem] font-bold text-white leading-tight"
            style={{
              letterSpacing: "-0.02em",
              opacity: cardTitleAfter ? 1 : 0,
              transition: "opacity 0.5s ease 0.2s",
            }}
          >
            Ваши карточки.<br />Теперь живые.
          </h2>

          {/* "Создайте что угодно." — free phase */}
          <h2
            className="text-[1.65rem] font-bold text-white leading-tight"
            style={{
              letterSpacing: "-0.02em",
              opacity: isFree ? 1 : 0,
              transition: "opacity 0.5s ease 0.5s",
            }}
          >
            Создайте что угодно.
          </h2>
        </div>
      </div>
    </div>
  );
}
