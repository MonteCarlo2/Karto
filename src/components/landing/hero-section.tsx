"use client";

import * as React from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowDown, ArrowUpRight, Gift } from "lucide-react";
import { VideoBackground } from "@/components/ui/video-background";
import { welcomePerksHeroNoteRu } from "@/lib/welcome-perks";
import { cn } from "@/lib/utils";

const fontManrope = "var(--font-manrope), var(--font-sans), system-ui, sans-serif";

/** Ветер в видео — примерно со 2-й секунды */
const WIND_REVEAL_AT = 2;

const windFlow = {
  hidden: { opacity: 0, x: 110 },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.95,
      ease: [0.16, 1, 0.3, 1],
    },
  },
};

const windStagger = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.11,
      delayChildren: 0,
    },
  },
};

export function HeroSection() {
  const reduceMotion = useReducedMotion();
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const revealedRef = React.useRef(false);
  const [revealed, setRevealed] = React.useState(false);

  React.useEffect(() => {
    if (reduceMotion) {
      revealedRef.current = true;
      setRevealed(true);
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    let raf = 0;

    const checkReveal = () => {
      if (revealedRef.current) return;
      if (video.currentTime >= WIND_REVEAL_AT) {
        revealedRef.current = true;
        setRevealed(true);
        return;
      }
      raf = requestAnimationFrame(checkReveal);
    };

    const onPlaying = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(checkReveal);
    };

    if (video.currentTime >= WIND_REVEAL_AT) {
      revealedRef.current = true;
      setRevealed(true);
    } else {
      video.addEventListener("playing", onPlaying);
      video.addEventListener("seeked", onPlaying);
      if (!video.paused) onPlaying();
    }

    return () => {
      cancelAnimationFrame(raf);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("seeked", onPlaying);
    };
  }, [reduceMotion]);

  const animateState = revealed ? "visible" : "hidden";

  return (
    <section
      id="hero"
      className="relative w-full overflow-hidden"
      style={{
        maxWidth: "100vw",
        height: "100vh",
        minHeight: "100vh",
        maxHeight: "100vh",
      }}
    >
      <div
        className="absolute inset-0 isolate overflow-hidden"
        style={{ height: "100vh", transform: "translateZ(0)" }}
      >
        <VideoBackground
          ref={videoRef}
          src="/hero-video.mp4"
          poster="/hero-video-poster.webp"
          className="absolute inset-0 h-full w-full"
        />
      </div>

      <div className="absolute inset-0 flex items-end pb-14 pt-24 md:items-center md:justify-start md:pb-12 md:pt-16">
        <div className="w-full px-8 lg:px-14 xl:px-20 md:-translate-y-6 lg:-translate-y-8">
          <motion.div
            className="max-w-3xl text-left"
            initial="hidden"
            animate={animateState}
            variants={windStagger}
          >
            <motion.h1
              variants={windFlow}
              className="hero-title"
              style={{ textWrap: "balance" }}
            >
              <span className="block">Второй пилот вашего</span>
              <span className="block">бизнеса на</span>
              <span className="hero-title-accent block">маркетплейсах.</span>
            </motion.h1>

            <motion.p
              variants={windFlow}
              className="hero-subtitle mt-6 max-w-2xl md:mt-7"
              style={{ textWrap: "pretty" }}
            >
              <span className="hero-subtitle-lead">
                Комплексная платформа-ассистент для селлеров.
              </span>{" "}
              Всё, что нужно для роста вашего магазина в одном месте: от карточек и
              описаний до работы с отзывами и контроля прибыли.
            </motion.p>

            <motion.div variants={windFlow} className="mt-7 flex flex-col gap-3">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <Link
                  href="/login"
                  className={cn(
                    "group inline-flex h-[3.35rem] min-w-[15.5rem] items-center justify-between gap-4 rounded-2xl pl-6 pr-2",
                    "bg-[#2E5A43] text-white",
                    "shadow-[0_16px_40px_-14px_rgba(46,90,67,0.5)] ring-1 ring-[#84CC16]/20",
                    "transition-[transform,background-color,box-shadow] duration-200 ease-out",
                    "hover:bg-[#244A36] hover:shadow-[0_18px_44px_-12px_rgba(46,90,67,0.55)]",
                    "active:scale-[0.98]"
                  )}
                >
                  <span
                    className="text-[13px] font-bold uppercase tracking-[0.12em]"
                    style={{ fontFamily: fontManrope }}
                  >
                    Начать бесплатно
                  </span>
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#84CC16] text-[#1A2E12] transition-transform duration-200 group-hover:scale-105">
                    <ArrowUpRight className="h-4 w-4" strokeWidth={2.5} />
                  </span>
                </Link>

                <Link
                  href="#how-it-works"
                  className={cn(
                    "hero-learn-more-link group inline-flex h-[3.35rem] items-center gap-3 px-1",
                    "transition-transform duration-200 ease-out active:scale-[0.98]"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                      "border border-[#84CC16]/45 bg-white/20"
                    )}
                  >
                    <ArrowDown
                      className="h-4 w-4 text-[#2E5A43] transition-transform duration-200 group-hover:translate-y-0.5"
                      strokeWidth={2.25}
                    />
                  </span>
                  <span
                    className="relative z-[1] text-[13px] font-bold uppercase tracking-[0.12em] text-[#1A1A1A]"
                    style={{ fontFamily: fontManrope }}
                  >
                    Узнать больше
                  </span>
                </Link>
              </div>

              <p
                className="flex max-w-md items-start gap-2 text-xs font-normal leading-relaxed text-[#5C5C56]"
                style={{ fontFamily: fontManrope }}
              >
                <Gift
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#2E5A43]"
                  strokeWidth={1.75}
                  aria-hidden
                />
                <span>{welcomePerksHeroNoteRu()}</span>
              </p>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
