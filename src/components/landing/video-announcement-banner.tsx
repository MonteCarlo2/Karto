"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "karto_video_announcement_seen_v1";

type Slide = {
  id: string;
  type: "image" | "video";
  src: string;
  title: string;
  subtitle: string;
  duration: number;
};

const SLIDES: Slide[] = [
  {
    id: "card",
    type: "image",
    src: "/card-3.png",
    title: "Карточки нового поколения",
    subtitle: "Создавайте профессиональные карточки за секунды — с помощью AI",
    duration: 4000,
  },
  {
    id: "animated",
    type: "video",
    src: "/fed43aba167d0c1b1398a0b84feb5295_1773418511_8b66ag6q.mp4",
    title: "А теперь они оживают",
    subtitle: "Скоро каждую карточку товара можно будет анимировать",
    duration: 7000,
  },
  {
    id: "free",
    type: "video",
    src: "/Video_Vapor_Removal_HVNV8Pd.mp4",
    title: "Любая идея — в видео",
    subtitle: "Свободная видеогенерация уже в разработке",
    duration: 7000,
  },
];

export function VideoAnnouncementBanner() {
  const [visible, setVisible] = useState(false);
  const [active, setActive] = useState(0);
  const [fading, setFading] = useState(false);
  // progress 0..1 for the auto-advance bar
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([null, null, null]);
  const startedAt = useRef(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {}
  }, []);

  const goTo = useCallback((idx: number) => {
    setFading(true);
    setTimeout(() => {
      setActive(idx);
      setFading(false);
      setProgress(0);
    }, 280);
  }, []);

  // Progress bar + auto-advance
  useEffect(() => {
    if (!visible) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (progressRef.current) clearInterval(progressRef.current);

    const dur = SLIDES[active].duration;
    startedAt.current = Date.now();
    setProgress(0);

    progressRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAt.current;
      setProgress(Math.min(elapsed / dur, 1));
    }, 40);

    timerRef.current = setTimeout(() => {
      clearInterval(progressRef.current!);
      goTo((active + 1) % SLIDES.length);
    }, dur);

    return () => {
      clearTimeout(timerRef.current!);
      clearInterval(progressRef.current!);
    };
  }, [active, visible, goTo]);

  // Play video of active slide, pause others
  useEffect(() => {
    if (!visible) return;
    videoRefs.current.forEach((v, i) => {
      if (!v) return;
      if (i === active) {
        v.currentTime = 0;
        v.play().catch(() => {});
      } else {
        v.pause();
      }
    });
  }, [active, visible]);

  const close = () => {
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch {}
    setVisible(false);
  };

  if (!visible) return null;

  const slide = SLIDES[active];

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6"
      style={{ background: "rgba(0,0,0,0.52)", backdropFilter: "blur(8px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      {/* Card */}
      <div
        className="relative w-full max-w-xl rounded-3xl overflow-hidden"
        style={{
          background: "#f7f8f9",
          border: "1px solid rgba(0,0,0,0.09)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.28)",
        }}
      >
        {/* Close */}
        <button
          onClick={close}
          className="absolute top-3.5 right-3.5 z-20 w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-black/8 transition-all"
          aria-label="Закрыть"
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M1 1l11 11M12 1L1 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>

        {/* Media area */}
        <div
          className="relative overflow-hidden"
          style={{ height: 340, background: "#ebebec" }}
        >
          {SLIDES.map((s, i) => (
            <div
              key={s.id}
              className="absolute inset-0 flex items-center justify-center"
              style={{
                opacity: i === active && !fading ? 1 : 0,
                transition: "opacity 0.28s ease",
                pointerEvents: i === active ? "auto" : "none",
              }}
            >
              {s.type === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={s.src}
                  alt=""
                  className="h-full w-full object-contain"
                  draggable={false}
                />
              ) : (
                <video
                  ref={(el) => { videoRefs.current[i] = el; }}
                  src={s.src}
                  className="h-full w-full object-contain"
                  loop
                  muted
                  playsInline
                />
              )}
            </div>
          ))}

          {/* Progress bar (top of media) */}
          <div className="absolute top-0 inset-x-0 h-[3px] bg-black/10">
            <div
              className="h-full bg-black/40 transition-none"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>

        {/* Text + controls */}
        <div className="px-6 pt-5 pb-5">
          {/* Text fades with slide */}
          <div
            style={{
              opacity: fading ? 0 : 1,
              transform: fading ? "translateY(5px)" : "translateY(0)",
              transition: "opacity 0.28s ease, transform 0.28s ease",
            }}
          >
            <h2 className="text-2xl sm:text-[1.65rem] font-bold text-gray-900 leading-snug">
              {slide.title}
            </h2>
            <p className="mt-1.5 text-[0.9rem] text-gray-500 leading-relaxed">
              {slide.subtitle}
            </p>
          </div>

          <div className="mt-4 flex items-center justify-between">
            {/* Dot indicators */}
            <div className="flex items-center gap-2">
              {SLIDES.map((_, i) => (
                <button
                  key={i}
                  onClick={() => goTo(i)}
                  aria-label={`Слайд ${i + 1}`}
                  className="rounded-full transition-all duration-300"
                  style={{
                    width: i === active ? 22 : 8,
                    height: 8,
                    background: i === active ? "#111827" : "#d1d5db",
                  }}
                />
              ))}
            </div>

            <button
              onClick={close}
              className="rounded-xl px-5 py-2 text-sm font-semibold text-white transition-all hover:opacity-85 active:scale-95"
              style={{ background: "#111827" }}
            >
              Понятно
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
