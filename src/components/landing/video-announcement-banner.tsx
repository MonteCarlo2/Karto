"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const ALWAYS_SHOW = true;
const STORAGE_KEY = "karto_video_announcement_seen_v2";
const SHOW_DELAY_MS = 3500;

const CARD_W = 600;
const FREE_W = 940;

type Phase = "card-static" | "wipe" | "card-video" | "free-video";

export function VideoAnnouncementBanner() {
  const [visible, setVisible] = useState(false);
  const [entered, setEntered] = useState(false);
  const [phase, setPhase] = useState<Phase>("card-static");
  const [wipeX, setWipeX] = useState(100);

  const cardVideoRef = useRef<HTMLVideoElement>(null);
  const freeVideoRef = useRef<HTMLVideoElement>(null);
  const wipeRafRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // ── Show + fade-in ──────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      if (ALWAYS_SHOW) { setVisible(true); return; }
      try { if (!localStorage.getItem(STORAGE_KEY)) setVisible(true); } catch {}
    }, SHOW_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!visible) { setEntered(false); return; }
    const t = setTimeout(() => setEntered(true), 30);
    return () => clearTimeout(t);
  }, [visible]);

  const close = useCallback(() => {
    setEntered(false);
    setTimeout(() => {
      setVisible(false);
      if (!ALWAYS_SHOW) {
        try { localStorage.setItem(STORAGE_KEY, "1"); } catch {}
      }
      window.dispatchEvent(new CustomEvent("karto:banner:closed"));
    }, 500);
  }, []);

  // Reopen from navbar badge
  useEffect(() => {
    const reopen = () => {
      setPhase("card-static");
      setWipeX(100);
      setVisible(true);
    };
    window.addEventListener("karto:banner:reopen", reopen);
    return () => window.removeEventListener("karto:banner:reopen", reopen);
  }, []);

  // ── Play helpers ────────────────────────────────────────
  const playFreeVideo = useCallback(() => {
    const v = freeVideoRef.current;
    if (!v) return;
    v.currentTime = 0;
    v.play().catch(() => {});
  }, []);

  const stopFreeVideo = useCallback(() => {
    const v = freeVideoRef.current;
    if (!v) return;
    v.pause();
  }, []);

  // Tight loop: reset near the end to avoid the freeze/flash at loop boundary
  const handleFreeTimeUpdate = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    if (v.duration && v.currentTime >= v.duration - 0.18) {
      v.currentTime = 0;
    }
  }, []);

  // ── Phase sequencer ──────────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    clearTimeout(timerRef.current);
    cancelAnimationFrame(wipeRafRef.current);

    if (phase === "card-static") {
      stopFreeVideo();
      timerRef.current = setTimeout(() => setPhase("wipe"), 2800);

    } else if (phase === "wipe") {
      stopFreeVideo();
      const start = performance.now();
      const dur = 1700;
      const run = (now: number) => {
        const t = Math.min((now - start) / dur, 1);
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        setWipeX(Math.round(100 * (1 - e)));
        if (t < 1) {
          wipeRafRef.current = requestAnimationFrame(run);
        } else {
          setWipeX(0);
          cardVideoRef.current?.play().catch(() => {});
          setPhase("card-video");
        }
      };
      wipeRafRef.current = requestAnimationFrame(run);
      return () => cancelAnimationFrame(wipeRafRef.current);

    } else if (phase === "card-video") {
      timerRef.current = setTimeout(() => {
        setPhase("free-video");
        // Start free video 500ms later so the crossfade opacity begins first
        setTimeout(() => playFreeVideo(), 500);
      }, 6000);

    } else if (phase === "free-video") {
      // free video started in the timer callback above (or from manual nav)
    }

    return () => clearTimeout(timerRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, visible]);

  // ── Manual navigation ────────────────────────────────────
  const goToCard = () => {
    clearTimeout(timerRef.current);
    cancelAnimationFrame(wipeRafRef.current);
    stopFreeVideo();
    setWipeX(0);
    setPhase("card-video");
    cardVideoRef.current?.play().catch(() => {});
  };

  const goToFree = () => {
    clearTimeout(timerRef.current);
    cancelAnimationFrame(wipeRafRef.current);
    setPhase("free-video");
    setTimeout(() => playFreeVideo(), 500);
  };

  // Cleanup
  useEffect(() => () => {
    clearTimeout(timerRef.current);
    cancelAnimationFrame(wipeRafRef.current);
  }, []);

  if (!visible) return null;

  const isFree = phase === "free-video";
  const isCardStatic = phase === "card-static";
  const isAfterWipe = phase === "card-video";

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center"
      style={{
        background: "rgba(2,5,3,0.76)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        cursor: "default",
        userSelect: "none",
        opacity: entered ? 1 : 0,
        transition: "opacity 0.65s ease",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      {/* X close */}
      <button
        onClick={close}
        className="absolute top-5 right-5 z-10 w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 transition-all"
        style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.45)", outline: "none", border: "none" }}
        aria-label="Закрыть"
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <path d="M1 1l11 11M12 1L1 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      </button>

      {/* ── Headline ── */}
      <div
        className="flex flex-col items-center mb-7 px-6 pointer-events-none"
        style={{
          width: isFree ? `min(${FREE_W}px, 92vw)` : `min(${CARD_W}px, 88vw, 55vh)`,
          transition: "width 1.2s cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        <p
          className="text-[0.58rem] tracking-[0.34em] uppercase mb-4"
          style={{ color: "rgba(255,255,255,0.26)", fontFamily: "var(--font-geist-sans)" }}
        >
          Скоро в KARTO
        </p>
        <h1
          className="text-center leading-[1.04]"
          style={{
            fontFamily: "var(--font-playfair)",
            fontSize: "clamp(2.3rem,5.5vw,3.8rem)",
            fontWeight: 700,
            fontStyle: "italic",
            letterSpacing: "-0.022em",
          }}
        >
          {isFree ? (
            <>
              <span style={{ color: "#fff" }}>Ваше воображение.</span><br />
              <span style={{ color: "#5cce8a" }}>Без границ.</span>
            </>
          ) : (
            <>
              <span style={{ color: "#fff" }}>Ваши товары.</span><br />
              <span style={{ color: "#5cce8a" }}>Оживают.</span>
            </>
          )}
        </h1>
        <p
          className="mt-3 text-[0.72rem] text-center"
          style={{ color: "rgba(255,255,255,0.28)", fontFamily: "var(--font-geist-sans)", letterSpacing: "0.04em" }}
        >
          {isFree
            ? "Свободная генерация · скоро в «Свободном творчестве»"
            : "Анимация карточек · скоро в «Свободном творчестве»"}
        </p>
      </div>

      {/* ── Media container ── */}
      <div
        className="relative overflow-hidden"
        style={{
          width: isFree ? `min(${FREE_W}px, 92vw)` : `min(${CARD_W}px, 88vw, 55vh)`,
          aspectRatio: isFree ? "16/9" : "3/4",
          transition: "width 1.2s cubic-bezier(0.4,0,0.2,1)",
          borderRadius: 0,
          boxShadow: "0 0 140px rgba(0,0,0,0.9)",
        }}
      >
        {/* Card layers */}
        <div
          className="absolute inset-0"
          style={{ opacity: isFree ? 0 : 1, transition: "opacity 0.9s ease" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/card-3.png" alt="" className="absolute inset-0 w-full h-full object-cover" />

          <video
            ref={cardVideoRef}
            src="/fed43aba167d0c1b1398a0b84feb5295_1773418511_8b66ag6q.mp4"
            className="absolute inset-0 w-full h-full object-cover"
            style={{ clipPath: wipeX > 0 ? `inset(0 ${wipeX}% 0 0)` : "none" }}
            loop
            muted
            playsInline
            preload="auto"
          />

          {phase === "wipe" && wipeX > 2 && wipeX < 98 && (
            <div
              className="absolute inset-y-0 w-20 pointer-events-none"
              style={{
                left: `calc(${100 - wipeX}% - 40px)`,
                background: "linear-gradient(90deg,transparent 0%,rgba(255,255,255,0.7) 50%,transparent 100%)",
              }}
            />
          )}

          <div
            className="absolute inset-x-0 bottom-0 pointer-events-none"
            style={{ background: "linear-gradient(to top,rgba(0,0,0,0.7) 0%,transparent 65%)", padding: "88px 32px 26px" }}
          >
            <p
              className="absolute bottom-6 left-8 right-8 leading-snug"
              style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(1.4rem,3.5vw,2.1rem)", fontWeight: 700, fontStyle: "italic", color: "#fff", letterSpacing: "-0.01em", opacity: isCardStatic ? 1 : 0, transition: "opacity 0.45s ease" }}
            >
              Готовьтесь.
            </p>
            <p
              className="absolute bottom-6 left-8 right-8 leading-snug"
              style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(1.4rem,3.5vw,2.1rem)", fontWeight: 700, fontStyle: "italic", color: "#fff", letterSpacing: "-0.01em", opacity: isAfterWipe ? 1 : 0, transition: "opacity 0.55s ease 0.35s" }}
            >
              Ваши карточки.<br />Теперь живые.
            </p>
          </div>
        </div>

        {/* Free video — seamless loop via timeupdate reset */}
        <div
          className="absolute inset-0"
          style={{ opacity: isFree ? 1 : 0, transition: "opacity 0.9s ease 0.35s" }}
        >
          <video
            ref={freeVideoRef}
            src="/Video_Vapor_Removal_HVNV8Pd.mp4"
            className="absolute inset-0 w-full h-full object-cover"
            muted
            playsInline
            preload="auto"
            onTimeUpdate={handleFreeTimeUpdate}
          />
          <div
            className="absolute inset-x-0 bottom-0 pointer-events-none"
            style={{ background: "linear-gradient(to top,rgba(0,0,0,0.65) 0%,transparent 60%)", padding: "72px 32px 24px" }}
          >
            <p
              className="leading-snug"
              style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(1.4rem,3.5vw,2.1rem)", fontWeight: 700, fontStyle: "italic", color: "#fff", letterSpacing: "-0.01em", opacity: isFree ? 1 : 0, transition: "opacity 0.55s ease 0.85s" }}
            >
              Создайте что угодно.
            </p>
          </div>
        </div>
      </div>

      {/* Dot switcher */}
      <div className="flex items-center gap-2.5 mt-6">
        {[
          { isFreePhase: false, action: goToCard },
          { isFreePhase: true, action: goToFree },
        ].map(({ isFreePhase, action }) => (
          <button
            key={String(isFreePhase)}
            onClick={action}
            className="rounded-full transition-all duration-500 cursor-pointer"
            style={{
              width: isFree === isFreePhase ? 30 : 8,
              height: 8,
              background: isFree === isFreePhase ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.22)",
              border: "none",
              outline: "none",
            }}
          />
        ))}
      </div>
    </div>
  );
}
